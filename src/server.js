import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';
import { ACTIVE_CREDITS, ANNUAL_FEE, CARDS, CREDIT_BY_ID, CATALOG_VERSION, DEFAULT_LEAD_DAYS } from './catalog.js';
import { sendPush, validTopic } from './push.js';
import { currentPeriod, daysBetween, isValidTz, localNow, periodKeyForDate, periodsForYear } from './periods.js';
import { digestEmail, digestWindowOpen, dueReminders, renewalNotice } from './reminders.js';
import { buildIcs } from './ics.js';
import { mailEnabled, sendMail } from './mailer.js';
import { decrypt, encrypt, hashPassword, randomToken, sha256, signState, verifyPassword, verifyState } from './security.js';
import { matchTransaction, parseAmexCsv } from './matcher.js';
import { authUrl, emailFromIdToken, exchangeCode, gmailConfigured, scanGmail } from './gmail.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const SECURE = BASE_URL.startsWith('https');
const EPS = 0.005;
const round2 = (n) => Math.round(n * 100) / 100;

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'",
  });
  if (SECURE) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
// CSRF defence in depth (cookies are SameSite=Lax already): reject cross-origin state-changing requests.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return bad(res, 'Cross-origin request blocked.', 403); } catch { return bad(res, 'Bad origin.', 403); }
  }
  next();
});
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));

// ---------- helpers ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

const hits = new Map();
function limit(max, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const k = `${req.path}|${req.ip}`;
    const now = Date.now();
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) return bad(res, 'Too many attempts. Try again later.', 429);
    h.push(now); hits.set(k, h);
    next();
  };
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function startSession(res, userId) {
  const token = randomToken();
  q.run('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)', sha256(token), userId, Date.now() + 30 * 864e5);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 30 * 864e5, path: '/' });
}

function auth(req, res, next) {
  const tok = parseCookies(req).sid;
  const s = tok && q.get('SELECT * FROM sessions WHERE token=? AND expires_at>?', sha256(tok), Date.now());
  if (!s) return bad(res, 'Not signed in', 401);
  req.user = q.get('SELECT * FROM users WHERE id=?', s.user_id);
  next();
}

const cardsOf = (u) => { try { const c = JSON.parse(u.cards || '["platinum"]').filter((x) => CARDS[x]); return c.length ? c : ['platinum']; } catch { return ['platinum']; } };
const leadDaysOf = (u) => ({ ...DEFAULT_LEAD_DAYS, ...(u.lead_days ? JSON.parse(u.lead_days) : {}) });
const publicUser = (u) => ({
  email: u.email, emailVerified: !!u.email_verified, renewalDate: u.renewal_date || '', cards: cardsOf(u), ntfyTopic: u.ntfy_topic || '', tz: u.tz, remindHour: u.remind_hour, emailReminders: !!u.email_reminders,
  leadDays: leadDaysOf(u), calendarUrl: `${BASE_URL}/cal/${u.cal_token}.ics`,
});

function creditSettings(userId) {
  const rows = q.all('SELECT * FROM user_credits WHERE user_id=?', userId);
  const by = Object.fromEntries(rows.map((r) => [r.credit_id, r]));
  return (id) => {
    const r = by[id];
    return r
      ? { tracked: !!r.tracked, enrolled: !!r.enrolled, remind: !!r.remind, airline: r.airline || '', snoozeUntil: r.snooze_until || '' }
      : { tracked: true, enrolled: false, remind: true, airline: '', snoozeUntil: '' };
  };
}

function usedMap(userId, year) {
  const rows = q.all("SELECT * FROM entries WHERE user_id=? AND (period_key LIKE ? OR period_key='cycle') ORDER BY date, id", userId, `${year}%`);
  const m = {};
  for (const e of rows) (m[`${e.credit_id}|${e.period_key}`] ||= []).push(e);
  return m;
}
const sum = (list = []) => round2(list.reduce((n, e) => n + e.amount, 0));

function buildState(user, year) {
  const { date: today } = localNow(user.tz);
  year = year || Number(today.slice(0, 4));
  const settings = creditSettings(user.id);
  const used = usedMap(user.id, year);
  const held = cardsOf(user);
  const credits = ACTIVE_CREDITS.filter((c) => held.includes(c.card)).map((c) => {
    const s = settings(c.id);
    let periods = periodsForYear(c, year).map((p) => {
      const entries = used[`${c.id}|${p.key}`] || [];
      const u = sum(entries);
      return { ...p, used: u, done: u >= p.amount - EPS, entries, daysLeft: daysBetween(today, p.end), isCurrent: p.start <= today && today <= p.end, isPast: p.end < today };
    });
    let cycle = null;
    if (c.period === 'cycle') {
      const e = used[`${c.id}|cycle`] || [];
      const last = e.length ? e[e.length - 1] : null;
      cycle = { entries: e, lastDate: last?.date || null, years: c.cycleYears };
      periods = [];
    }
    return { ...c, matchers: undefined, ...s, periods, cycle };
  });
  // summary: dollars for the displayed year, tracked credits only
  let possible = 0, captured = 0, remainingNow = 0;
  for (const c of credits) {
    if (!c.tracked) continue;
    for (const p of c.periods) {
      possible += p.amount;
      captured += Math.min(p.used, p.amount);
      if (p.isCurrent && !p.done) remainingNow += p.amount - p.used;
    }
  }
  return {
    today, year, credits, catalogVersion: CATALOG_VERSION, annualFee: held.reduce((n, id) => n + CARDS[id].fee, 0), cards: CARDS,
    isNew: !q.get('SELECT 1 x FROM user_credits WHERE user_id=? UNION SELECT 1 FROM entries WHERE user_id=?', user.id, user.id), user: publicUser(user),
    summary: { possible: round2(possible), captured: round2(captured), remainingNow: round2(remainingNow) },
    pendingDetections: q.get("SELECT COUNT(*) n FROM detections WHERE user_id=? AND status='pending'", user.id).n,
  };
}

function remainingIn(userId, creditId, periodKey) {
  const c = CREDIT_BY_ID[creditId];
  const p = periodsForYear(c, Number(periodKey.slice(0, 4))).find((x) => x.key === periodKey);
  const used = sum(q.all('SELECT amount FROM entries WHERE user_id=? AND credit_id=? AND period_key=?', userId, creditId, periodKey));
  return p ? round2(p.amount - used) : 0;
}

function addEntry(userId, { creditId, periodKey, amount, date, source, note, extId }) {
  q.run('INSERT OR IGNORE INTO entries(user_id,credit_id,period_key,amount,date,source,note,ext_id) VALUES (?,?,?,?,?,?,?,?)',
    userId, creditId, periodKey, round2(amount), date || null, source, note || null, extId || null);
}

/** Persist detections; credit-posted lines (and spend, if the user opted in) are applied automatically. */
function ingest(user, detections, { autoSpend = false } = {}) {
  let applied = 0, pending = 0, skipped = 0;
  for (const d of detections) {
    if (!CREDIT_BY_ID[d.creditId] || d.periodKey === 'cycle') { skipped++; continue; }
    if (q.get('SELECT 1 x FROM detections WHERE user_id=? AND ext_id=?', user.id, d.extId)) { skipped++; continue; }
    const auto = d.confidence === 'credit' || autoSpend;
    q.run('INSERT INTO detections(user_id,credit_id,period_key,date,amount,confidence,source,evidence,ext_id,status) VALUES (?,?,?,?,?,?,?,?,?,?)',
      user.id, d.creditId, d.periodKey, d.date, d.amount, d.confidence, d.source, d.evidence, d.extId, auto ? 'accepted' : 'pending');
    if (auto) {
      const amt = Math.min(d.amount, Math.max(0, remainingIn(user.id, d.creditId, d.periodKey)));
      if (amt > EPS) addEntry(user.id, { creditId: d.creditId, periodKey: d.periodKey, amount: amt, date: d.date, source: d.source, note: d.confidence === 'credit' ? 'Amex statement credit' : 'Qualifying charge', extId: `det:${d.extId}` });
      applied++;
    } else pending++;
  }
  return { applied, pending, skipped };
}

// ---------- auth ----------
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 255;

async function sendVerification(u) {
  const token = randomToken();
  q.run('DELETE FROM verify_tokens WHERE user_id=?', u.id);
  q.run('INSERT INTO verify_tokens(token_hash,user_id,expires_at) VALUES (?,?,?)', sha256(token), u.id, Date.now() + 7 * 864e5);
  await sendMail({ to: u.email, subject: 'Confirm your email for Platinum Credit Tracker', text: `Confirm your email so reminders can reach you:\n${BASE_URL}/#verify=${token}\n\nIf you did not create this account, ignore this email.` });
}

app.post('/api/auth/verify', limit(20), (req, res) => {
  const r = q.get('SELECT * FROM verify_tokens WHERE token_hash=? AND expires_at>?', sha256(String(req.body?.token || '')), Date.now());
  if (!r) return bad(res, 'This confirmation link is invalid or has expired.');
  q.run('UPDATE users SET email_verified=1 WHERE id=?', r.user_id);
  q.run('DELETE FROM verify_tokens WHERE user_id=?', r.user_id);
  res.json({ ok: true });
});

app.post('/api/auth/resend', auth, limit(3, 60 * 60 * 1000), wrap(async (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true });
  await sendVerification(req.user);
  res.json({ ok: true });
}));

app.post('/api/auth/signup', limit(10), (req, res) => {
  const { email, password, tz } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  if (!emailOk(em)) return bad(res, 'Enter a valid email address.');
  if (String(password || '').length < 10) return bad(res, 'Password must be at least 10 characters.');
  if (q.get('SELECT 1 x FROM users WHERE email=?', em)) return bad(res, 'An account with that email already exists.', 409);
  const info = q.run('INSERT INTO users(email,pw_hash,tz,cal_token) VALUES (?,?,?,?)', em, hashPassword(password), isValidTz(tz) ? tz : 'America/New_York', randomToken(24));
  const uid = Number(info.lastInsertRowid);
  sendVerification(q.get('SELECT * FROM users WHERE id=?', uid)).catch((e) => console.error('verify mail failed', e.message));
  startSession(res, uid);
  res.json({ ok: true });
});

app.post('/api/auth/login', limit(10), (req, res) => {
  const { email, password } = req.body || {};
  const u = q.get('SELECT * FROM users WHERE email=?', String(email || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u.pw_hash)) return bad(res, 'Incorrect email or password.', 401);
  startSession(res, u.id);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const tok = parseCookies(req).sid;
  if (tok) q.run('DELETE FROM sessions WHERE token=?', sha256(tok));
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.post('/api/auth/forgot', limit(5), wrap(async (req, res) => {
  const u = q.get('SELECT * FROM users WHERE email=?', String(req.body?.email || '').trim().toLowerCase());
  if (u) {
    const token = randomToken();
    q.run('INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES (?,?,?)', sha256(token), u.id, Date.now() + 3600e3);
    const link = `${BASE_URL}/#reset=${token}`;
    await sendMail({ to: u.email, subject: 'Reset your Platinum Credit Tracker password', text: `Reset your password (valid 1 hour):\n${link}\n\nIf you did not ask for this, ignore this email.` });
  }
  res.json({ ok: true }); // same answer whether or not the account exists
}));

app.post('/api/auth/reset', limit(10), (req, res) => {
  const { token, password } = req.body || {};
  if (String(password || '').length < 10) return bad(res, 'Password must be at least 10 characters.');
  const r = q.get('SELECT * FROM reset_tokens WHERE token_hash=? AND expires_at>?', sha256(String(token || '')), Date.now());
  if (!r) return bad(res, 'This reset link is invalid or has expired.');
  q.run('UPDATE users SET pw_hash=?, email_verified=1 WHERE id=?', hashPassword(password), r.user_id);
  q.run('DELETE FROM reset_tokens WHERE user_id=?', r.user_id);
  q.run('DELETE FROM sessions WHERE user_id=?', r.user_id);
  startSession(res, r.user_id);
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- app data ----------
app.get('/api/state', auth, (req, res) => {
  const year = Number(req.query.year) || undefined;
  res.json({ ...buildState(req.user, year), mail: mailEnabled(), gmailAvailable: gmailConfigured() });
});

function checkCredit(req, res) {
  const c = ACTIVE_CREDITS.find((x) => x.id === req.body?.creditId);
  if (!c) { bad(res, 'Unknown credit'); return null; }
  return c;
}

// Checkbox: mark a whole period used (or clear it).
app.post('/api/toggle', auth, (req, res) => {
  const c = checkCredit(req, res); if (!c) return;
  const { periodKey, checked } = req.body;
  if (c.period === 'cycle') {
    if (checked) addEntry(req.user.id, { creditId: c.id, periodKey: 'cycle', amount: c.amount, date: req.body.date || localNow(req.user.tz).date, source: 'manual' });
    else q.run("DELETE FROM entries WHERE user_id=? AND credit_id=? AND period_key='cycle'", req.user.id, c.id);
    return res.json({ ok: true });
  }
  const p = periodsForYear(c, Number(String(periodKey).slice(0, 4))).find((x) => x.key === periodKey);
  if (!p) return bad(res, 'Unknown period');
  if (checked) {
    const left = remainingIn(req.user.id, c.id, periodKey);
    if (left > EPS) addEntry(req.user.id, { creditId: c.id, periodKey, amount: left, date: p.start <= localNow(req.user.tz).date ? localNow(req.user.tz).date : p.start, source: 'manual', note: 'Marked used' });
  } else {
    q.run('DELETE FROM entries WHERE user_id=? AND credit_id=? AND period_key=?', req.user.id, c.id, periodKey);
  }
  res.json({ ok: true });
});

// Partial / exact amount.
app.post('/api/entries', auth, (req, res) => {
  const c = checkCredit(req, res); if (!c) return;
  const amount = Number(req.body.amount);
  if (!(amount > 0) || amount > 100000) return bad(res, 'Enter an amount greater than 0.');
  const periodKey = c.period === 'cycle' ? 'cycle' : req.body.periodKey;
  if (c.period !== 'cycle' && !periodsForYear(c, Number(String(periodKey).slice(0, 4))).some((p) => p.key === periodKey)) return bad(res, 'Unknown period');
  addEntry(req.user.id, { creditId: c.id, periodKey, amount, date: localNow(req.user.tz).date, source: 'manual', note: String(req.body.note || '').slice(0, 200) });
  res.json({ ok: true });
});

app.delete('/api/entries/:id', auth, (req, res) => {
  q.run('DELETE FROM entries WHERE id=? AND user_id=?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

app.put('/api/credits/:id', auth, (req, res) => {
  const c = ACTIVE_CREDITS.find((x) => x.id === req.params.id);
  if (!c) return bad(res, 'Unknown credit', 404);
  const cur = creditSettings(req.user.id)(c.id);
  const n = { ...cur, ...Object.fromEntries(['tracked', 'enrolled', 'remind'].filter((k) => k in req.body).map((k) => [k, !!req.body[k]])) };
  if ('airline' in req.body) n.airline = String(req.body.airline).slice(0, 60);
  if ('snoozeUntil' in req.body) {
    const v = String(req.body.snoozeUntil || '');
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return bad(res, 'Bad snooze date.');
    n.snoozeUntil = v;
  }
  q.run(`INSERT INTO user_credits(user_id,credit_id,tracked,enrolled,remind,airline,snooze_until) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(user_id,credit_id) DO UPDATE SET tracked=excluded.tracked,enrolled=excluded.enrolled,remind=excluded.remind,airline=excluded.airline,snooze_until=excluded.snooze_until`,
  req.user.id, c.id, +n.tracked, +n.enrolled, +n.remind, n.airline, n.snoozeUntil || null);
  res.json({ ok: true });
});

app.put('/api/settings', auth, (req, res) => {
  const b = req.body || {};
  const u = req.user;
  const tz = b.tz && isValidTz(b.tz) ? b.tz : u.tz;
  const hour = Number.isInteger(b.remindHour) && b.remindHour >= 0 && b.remindHour < 24 ? b.remindHour : u.remind_hour;
  let leads = leadDaysOf(u);
  if (b.leadDays && typeof b.leadDays === 'object') {
    for (const k of Object.keys(DEFAULT_LEAD_DAYS)) {
      const arr = b.leadDays[k];
      if (Array.isArray(arr)) leads[k] = [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 180))].sort((a, b2) => b2 - a);
    }
  }
  let renewal = u.renewal_date;
  if ('renewalDate' in b) {
    const v = String(b.renewalDate || '');
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return bad(res, 'Bad renewal date.');
    renewal = v || null;
  }
  let cardsJson = u.cards;
  if (Array.isArray(b.cards)) {
    const c = b.cards.filter((x) => CARDS[x]);
    if (!c.length) return bad(res, 'Choose at least one card.');
    cardsJson = JSON.stringify([...new Set(c)]);
  }
  let topic = u.ntfy_topic;
  if ('ntfyTopic' in b) {
    const t = String(b.ntfyTopic || '').trim();
    if (t && !validTopic(t)) return bad(res, 'Push topic must be 6-64 letters, numbers, - or _.');
    topic = t || null;
  }
  q.run('UPDATE users SET tz=?, remind_hour=?, email_reminders=?, lead_days=?, ntfy_topic=?, cards=?, renewal_date=? WHERE id=?', tz, hour, 'emailReminders' in b ? +!!b.emailReminders : u.email_reminders, JSON.stringify(leads), topic, cardsJson || null, renewal || null, u.id);
  res.json({ ok: true });
});

app.post('/api/account/delete', auth, (req, res) => {
  if (!verifyPassword(String(req.body?.password || ''), req.user.pw_hash)) return bad(res, 'Incorrect password.', 401);
  q.run('DELETE FROM users WHERE id=?', req.user.id);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

// ---------- export / import / demo ----------
app.get('/api/export', auth, (req, res) => {
  const u = req.user;
  res.set('content-disposition', 'attachment; filename="platinum-tracker-export.json"').json({
    version: 1, exportedAt: new Date().toISOString(), settings: publicUser(u),
    credits: q.all('SELECT credit_id,tracked,enrolled,remind,airline FROM user_credits WHERE user_id=?', u.id),
    entries: q.all('SELECT credit_id,period_key,amount,date,source,note,ext_id FROM entries WHERE user_id=? ORDER BY id', u.id),
  });
});

app.post('/api/import/json', auth, (req, res) => {
  const d = req.body;
  if (!d || d.version !== 1 || !Array.isArray(d.entries)) return bad(res, 'Not a Platinum Tracker export file.');
  let added = 0;
  for (const e of d.entries.slice(0, 20000)) {
    const c = CREDIT_BY_ID[e.credit_id];
    if (!c || !(Number(e.amount) > 0) || typeof e.period_key !== 'string') continue;
    if (c.period !== 'cycle' && !periodsForYear(c, Number(e.period_key.slice(0, 4))).some((p) => p.key === e.period_key)) continue;
    if (q.get("SELECT 1 x FROM entries WHERE user_id=? AND credit_id=? AND period_key=? AND amount=? AND IFNULL(date,'')=?", req.user.id, e.credit_id, e.period_key, round2(Number(e.amount)), e.date || '')) continue;
    const r = q.run('INSERT OR IGNORE INTO entries(user_id,credit_id,period_key,amount,date,source,note,ext_id) VALUES (?,?,?,?,?,?,?,?)',
      req.user.id, e.credit_id, e.period_key, round2(Number(e.amount)), e.date || null, String(e.source || 'import').slice(0, 20), e.note ? String(e.note).slice(0, 200) : null, e.ext_id ? String(e.ext_id).slice(0, 200) : null);
    added += Number(r.changes);
  }
  for (const c of Array.isArray(d.credits) ? d.credits : []) {
    if (!CREDIT_BY_ID[c.credit_id]) continue;
    q.run(`INSERT INTO user_credits(user_id,credit_id,tracked,enrolled,remind,airline) VALUES (?,?,?,?,?,?)
           ON CONFLICT(user_id,credit_id) DO UPDATE SET tracked=excluded.tracked,enrolled=excluded.enrolled,remind=excluded.remind,airline=excluded.airline`,
    req.user.id, c.credit_id, +!!c.tracked, +!!c.enrolled, +!!c.remind, String(c.airline || '').slice(0, 60));
  }
  res.json({ added });
});

// Throwaway account with realistic sample data so people can look around before signing up.
app.post('/api/demo', limit(5, 60 * 60 * 1000), (req, res) => {
  const tz = isValidTz(req.body?.tz) ? req.body.tz : 'America/New_York';
  const info = q.run('INSERT INTO users(email,pw_hash,tz,cal_token,email_reminders) VALUES (?,?,?,?,0)', `demo-${randomToken(6)}@demo.invalid`, hashPassword(randomToken(18)), tz, randomToken(24));
  const user = q.get('SELECT * FROM users WHERE id=?', Number(info.lastInsertRowid));
  const today = localNow(tz).date, year = Number(today.slice(0, 4));
  for (const c of ACTIVE_CREDITS) {
    if (c.period === 'cycle') continue;
    q.run('INSERT INTO user_credits(user_id,credit_id,tracked,enrolled,remind,airline) VALUES (?,?,1,?,1,?)', user.id, c.id, +c.enrollment, c.id === 'airline' ? 'Delta' : '');
    // Fill most past periods, leaving gaps so the dashboard shows "missed" and "open" states.
    periodsForYear(c, year).forEach((p, i) => {
      if (p.end < today && (i + c.id.length) % 4 !== 0) addEntry(user.id, { creditId: c.id, periodKey: p.key, amount: p.amount, date: p.end, source: 'demo' });
    });
  }
  startSession(res, user.id);
  res.json({ ok: true });
});

// ---------- reminders ----------
function reminderStates(user, today) {
  const settings = creditSettings(user.id);
  const used = usedMap(user.id, today.slice(0, 4));
  const held = cardsOf(user);
  return ACTIVE_CREDITS.filter((c) => held.includes(c.card)).map((c) => ({ credit: c, ...settings(c.id), snoozed: !!settings(c.id).snoozeUntil && settings(c.id).snoozeUntil >= today, used: (key) => sum(used[`${c.id}|${key}`]) }));
}

async function runDigest(user, { force = false, now = new Date() } = {}) {
  const { date: today } = localNow(user.tz, now);
  const sent = new Set(q.all('SELECT * FROM reminders_sent WHERE user_id=?', user.id).map((r) => `${r.credit_id}|${r.period_key}|${r.lead}`));
  const { due, markSent } = dueReminders({ states: reminderStates(user, today), today, leadDays: leadDaysOf(user), sent: force ? new Set() : sent });
  const st = buildState(user);
  const renewal = renewalNotice({ renewal: user.renewal_date, today, captured: st.summary.captured, fee: st.annualFee, sent: force ? new Set() : sent });
  if (!due.length && !renewal) return { sent: false, count: 0 };
  if (renewal) markSent.push(...renewal.markSent);
  const mail = digestEmail(due, BASE_URL, renewal?.text);
  if ((user.email_reminders || force) && user.email_verified) await sendMail({ to: user.email, ...mail }); // never mail unconfirmed addresses
  if (user.ntfy_topic) {
    await sendPush(user.ntfy_topic, { title: `${due.length} Platinum credit${due.length > 1 ? 's' : ''} to use`, message: due.slice(0, 6).map((d) => `${d.name}: $${d.remaining.toFixed(0)} left, ${d.daysLeft === 0 ? 'last day' : d.daysLeft + 'd'}`).join('\n'), click: BASE_URL }).catch((e) => console.error('push failed', e.message));
  }
  if (!force) for (const m of markSent) q.run('INSERT OR IGNORE INTO reminders_sent(user_id,credit_id,period_key,lead) VALUES (?,?,?,?)', user.id, m.creditId, m.periodKey, m.lead);
  return { sent: true, count: due.length };
}

app.post('/api/reminders/test', auth, limit(5, 60 * 60 * 1000), wrap(async (req, res) => {
  const r = await runDigest(req.user, { force: true });
  res.json({ ...r, mail: mailEnabled() });
}));

app.get('/cal/:token.ics', (req, res) => {
  const u = q.get('SELECT * FROM users WHERE cal_token=?', req.params.token);
  if (!u) return res.status(404).end();
  const { date: today } = localNow(u.tz);
  const st = buildState(u, Number(today.slice(0, 4)));
  const events = [];
  for (const c of st.credits) {
    if (!c.tracked || !c.remind) continue;
    for (const p of c.periods) {
      if (p.done || p.end < today) continue;
      events.push({ uid: `${u.id}-${c.id}-${p.key}`, name: c.name, remaining: p.amount - p.used, periodLabel: p.label, end: p.end, period: c.period, summary: c.summary });
    }
  }
  res.set({ 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-cache' }).send(buildIcs(events, leadDaysOf(u), BASE_URL));
});

// ---------- detection: CSV + Gmail ----------
app.get('/api/detections', auth, (req, res) => {
  res.json(q.all("SELECT * FROM detections WHERE user_id=? AND status='pending' ORDER BY date DESC", req.user.id));
});

app.post('/api/detections/:id/:action', auth, (req, res) => {
  const d = q.get('SELECT * FROM detections WHERE id=? AND user_id=?', Number(req.params.id), req.user.id);
  if (!d) return bad(res, 'Not found', 404);
  if (req.params.action === 'accept') {
    const amt = Math.min(Number(req.body?.amount) || d.amount, Math.max(0, remainingIn(req.user.id, d.credit_id, d.period_key)));
    if (amt > EPS) addEntry(req.user.id, { creditId: d.credit_id, periodKey: d.period_key, amount: amt, date: d.date, source: d.source, note: 'Confirmed detection', extId: `det:${d.ext_id}` });
    q.run("UPDATE detections SET status='accepted' WHERE id=?", d.id);
  } else q.run("UPDATE detections SET status='dismissed' WHERE id=?", d.id);
  res.json({ ok: true });
});

app.post('/api/import/csv', auth, (req, res) => {
  let txs;
  try { txs = parseAmexCsv(String(req.body?.text || '')); } catch (e) { return bad(res, e.message); }
  const card = CARDS[req.body?.card] ? req.body.card : cardsOf(req.user)[0];
  const dets = txs.map((t) => matchTransaction(t, { cards: [card] })).filter(Boolean);
  const r = ingest(req.user, dets, { autoSpend: !!req.body?.autoApplySpend });
  res.json({ rows: txs.length, matched: dets.length, ...r });
});

app.get('/api/gmail/status', auth, (req, res) => {
  const l = q.get('SELECT * FROM gmail_links WHERE user_id=?', req.user.id);
  res.json({ available: gmailConfigured(), connected: !!l, googleEmail: l?.google_email, lastScanAt: l?.last_scan_at, lastError: l?.last_error, autoApplySpend: !!l?.auto_apply_spend });
});

app.get('/api/gmail/connect', auth, (req, res) => {
  if (!gmailConfigured()) return bad(res, 'Gmail is not configured on this server.', 501);
  res.redirect(authUrl(signState(req.user.id)));
});

app.get('/api/gmail/callback', wrap(async (req, res) => {
  const userId = verifyState(req.query.state);
  if (!userId || !req.query.code) return res.redirect('/#gmail=error');
  try {
    const t = await exchangeCode(req.query.code);
    if (!t.refresh_token) throw new Error('No refresh token returned');
    q.run(`INSERT INTO gmail_links(user_id,google_email,refresh_token_enc) VALUES (?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET google_email=excluded.google_email, refresh_token_enc=excluded.refresh_token_enc, last_error=NULL`,
    userId, emailFromIdToken(t.id_token || ''), encrypt(t.refresh_token));
    res.redirect('/#gmail=connected');
  } catch (e) {
    console.error('gmail callback', e.message);
    res.redirect('/#gmail=error');
  }
}));

async function scanUser(user, days = 45) {
  const l = q.get('SELECT * FROM gmail_links WHERE user_id=?', user.id);
  if (!l) throw new Error('Gmail is not connected');
  try {
    const dets = await scanGmail(decrypt(l.refresh_token_enc), user.tz, { sinceDays: days, cards: cardsOf(user) });
    const r = ingest(user, dets, { autoSpend: !!l.auto_apply_spend });
    q.run("UPDATE gmail_links SET last_scan_at=datetime('now'), last_error=NULL WHERE user_id=?", user.id);
    return { found: dets.length, ...r };
  } catch (e) {
    q.run('UPDATE gmail_links SET last_error=? WHERE user_id=?', e.message, user.id);
    throw e;
  }
}

app.post('/api/gmail/scan', auth, limit(10, 60 * 60 * 1000), wrap(async (req, res) => {
  try { res.json(await scanUser(req.user, Math.min(Number(req.body?.days) || 45, 120))); } catch (e) { bad(res, e.message, 502); }
}));

app.post('/api/gmail/settings', auth, (req, res) => {
  q.run('UPDATE gmail_links SET auto_apply_spend=? WHERE user_id=?', +!!req.body?.autoApplySpend, req.user.id);
  res.json({ ok: true });
});

app.post('/api/gmail/disconnect', auth, (req, res) => {
  q.run('DELETE FROM gmail_links WHERE user_id=?', req.user.id);
  res.json({ ok: true });
});

// ---------- scheduler ----------
export async function tick(now = new Date()) {
  for (const u of q.all('SELECT * FROM users WHERE email_reminders=1 OR ntfy_topic IS NOT NULL')) {
    const date = digestWindowOpen(u, now);
    if (!date) continue;
    try { await runDigest(u, { now }); q.run('UPDATE users SET last_digest_date=? WHERE id=?', date, u.id); }
    catch (e) { console.error('digest failed', u.id, e.message); }
  }
  // Gmail auto-scan roughly every 6 hours
  for (const l of q.all("SELECT user_id FROM gmail_links WHERE last_scan_at IS NULL OR last_scan_at < datetime('now','-6 hours')")) {
    try { await scanUser(q.get('SELECT * FROM users WHERE id=?', l.user_id), 14); } catch (e) { console.error('gmail scan failed', l.user_id, e.message); }
  }
  q.run('DELETE FROM sessions WHERE expires_at<?', Date.now());
  q.run("DELETE FROM users WHERE email LIKE 'demo-%@demo.invalid' AND created_at < datetime('now','-3 days')");
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Platinum Credit Tracker on ${BASE_URL} (mail: ${mailEnabled() ? 'SMTP' : 'dev outbox'}, gmail: ${gmailConfigured() ? 'on' : 'off'})`));
  setTimeout(() => tick().catch(console.error), 5000);
  setInterval(() => tick().catch(console.error), 10 * 60 * 1000);
}

export { app, buildState, ingest, runDigest };
