// Optional Gmail integration (read-only). Searches only for mail from Amex and the benefit merchants,
// extracts amount/merchant, and runs the same matcher as the CSV importer. Message bodies are never stored;
// only the matched detection (credit, date, amount, one-line evidence) is saved.
//
// NOTE: gmail.readonly is a Google "restricted" scope. Public use needs Google OAuth verification plus an
// annual security assessment. For personal / small-group use keep the OAuth app in "Testing" (up to 100
// listed test users; refresh tokens then expire after 7 days) or use an internal Workspace app.

import { ACTIVE_CREDITS } from './catalog.js';
import { matchTransaction } from './matcher.js';
import { localNow } from './periods.js';

export const gmailConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${process.env.BASE_URL || 'http://localhost:3000'}/api/gmail/callback`;

export function authUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly openid email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || 'Google token error');
  return j;
}

export const exchangeCode = (code) => tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
export const refreshAccess = (refresh_token) => tokenRequest({ refresh_token, grant_type: 'refresh_token' });

export function emailFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()).email; } catch { return null; }
}

const AMEX_DOMAINS = ['americanexpress.com', 'welcome.americanexpress.com', 'aexp.com'];

export function buildQuery(sinceDays = 45) {
  const senders = new Set(AMEX_DOMAINS);
  for (const c of ACTIVE_CREDITS) for (const s of c.matchers.senders) senders.add(s);
  return `newer_than:${sinceDays}d (${[...senders].map((s) => `from:${s}`).join(' OR ')})`;
}

async function gget(token, path) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Gmail API ${r.status}`);
  return r.json();
}

function bodyText(payload) {
  const parts = [];
  (function walk(p) {
    if (!p) return;
    if (p.body?.data && /^text\/(plain|html)/.test(p.mimeType || '')) {
      parts.push({ type: p.mimeType, text: Buffer.from(p.body.data, 'base64url').toString('utf8') });
    }
    (p.parts || []).forEach(walk);
  })(payload);
  const plain = parts.find((x) => x.type === 'text/plain') || parts[0];
  if (!plain) return '';
  return plain.type === 'text/html'
    ? plain.text.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
    : plain.text.replace(/\s+/g, ' ');
}

const money = '\\$\\s?([\\d,]+\\.\\d{2})';
const toNum = (s) => Number(s.replace(/,/g, ''));

/**
 * Pure parser: one Gmail message -> a transaction for matchTransaction(), or null.
 * msg: { id, from, subject, dateMs, text }
 */
export function parseEmail(msg, tz = 'America/New_York') {
  const from = String(msg.from || '').toLowerCase();
  const domain = (from.match(/@([a-z0-9.-]+)/) || [])[1] || '';
  const isAmex = AMEX_DOMAINS.some((d) => domain.endsWith(d));
  const hay = `${msg.subject} ${msg.text}`.slice(0, 6000);
  const date = localNow(tz, new Date(msg.dateMs)).date;
  const base = { date, source: 'gmail', extId: `gmail:${msg.id}` };

  if (isAmex) {
    // Statement-credit style notices ("a statement credit of $15.00 ... Uber Cash")
    const credit = hay.match(new RegExp(`(?:statement credit|credit)[^$]{0,60}${money}`, 'i'));
    if (credit && /statement credit|credit (?:has been|was|is) (?:applied|posted|added)|you.ve (?:got|received) a credit/i.test(hay)) {
      return { ...base, amount: -toNum(credit[1]), description: `${msg.subject} ${hay.slice(0, 200)} credit` };
    }
    // Purchase alerts ("A charge of $22.10 was placed on your Card ... at LULULEMON")
    const charge = hay.match(new RegExp(`(?:charge|purchase|transaction)[^$]{0,40}${money}[^.]{0,80}?\\b(?:at|with|from)\\s+([A-Za-z0-9*&+.' -]{3,40})`, 'i'));
    if (charge) return { ...base, amount: toNum(charge[1]), description: charge[2].trim() };
    return null;
  }

  // Merchant receipt: use the labelled total when present.
  const total = hay.match(new RegExp(`(?<![a-z])(?:order\\s+)?(?:total|amount (?:charged|paid)|you paid)[^$\\d]{0,25}${money}`, 'i')) || hay.match(new RegExp(money));
  if (!total) return null;
  return { ...base, amount: toNum(total[1]), description: `${domain} ${msg.subject}` };
}

/** Scan one user's Gmail. Returns detections (not yet persisted). */
export async function scanGmail(refreshToken, tz, { sinceDays = 45, max = 100 } = {}) {
  const { access_token } = await refreshAccess(refreshToken);
  const list = await gget(access_token, `messages?maxResults=${max}&q=${encodeURIComponent(buildQuery(sinceDays))}`);
  const detections = [];
  for (const m of list.messages || []) {
    const full = await gget(access_token, `messages/${m.id}?format=full`);
    const h = (n) => (full.payload.headers.find((x) => x.name.toLowerCase() === n) || {}).value || '';
    const tx = parseEmail({ id: m.id, from: h('from'), subject: h('subject'), dateMs: Number(full.internalDate), text: bodyText(full.payload) }, tz);
    const d = tx && matchTransaction(tx);
    if (d) detections.push(d);
  }
  return detections;
}
