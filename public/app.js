const root = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + (Math.abs(n - Math.round(n)) < 0.005 ? Math.round(n).toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let S = null; // server state
let route = 'now';
let year = null;
let flash = null;
let authMode = 'login';
let holdFlash = false; // keep a message set during startup (e.g. email confirmed) through the first route render

async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error || 'Request failed');
    e.status = r.status;
    throw e;
  }
  return j;
}

async function load() {
  try {
    S = await api('/api/state' + (year ? `?year=${year}` : ''));
    year = S.year;
  } catch (e) {
    if (e.status === 401) S = null; else throw e;
  }
  render();
}

// ---------- rendering ----------
const logo = `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 24L16 7l9 17z" fill="none" stroke="#b8975a" stroke-width="1.4"/><path d="M11.5 24L16 15l4.5 9" fill="none" stroke="#b8975a" stroke-width="1" opacity=".7"/></svg>`;

function render() {
  if (!S) return renderAuth();
  const nav = [['now', 'This period'], ['year', 'Year'], ['detected', 'Detected'], ['connect', 'Auto-detect'], ['guides', 'Guides'], ['settings', 'Settings']];
  const views = { now: viewNow, year: viewYear, detected: viewDetected, connect: viewConnect, guides: viewGuides, settings: viewSettings };
  root.innerHTML = `
    <header class="top"><div class="top-in">
      <a class="brand" href="#now">${logo}<span>Platinum<small>Credit Tracker</small></span></a>
      <nav aria-label="Main">${nav.map(([k, l]) => `<a href="#${k}" class="${route === k ? 'on' : ''}">${l}${k === 'detected' && S.pendingDetections ? `<span class="badge">${S.pendingDetections}</span>` : ''}</a>`).join('')}</nav>
      <div class="who"><span>${esc(S.user.email)}</span><button data-act="logout">Sign out</button></div>
    </div></header>
    <main>${!S.user.emailVerified ? `<div class="msg" role="status">Please confirm your email so reminders can reach you. <button class="link" data-act="resend">Resend the link</button></div>` : ''}${flash ? `<div class="msg ${flash.err ? 'err' : ''}" role="status">${esc(flash.text)}</div>` : ''}${(views[route] || viewNow)()}</main>`;
  document.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  if (route === 'connect') refreshGmail();
}

function say(text, err = false) { flash = { text, err }; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

const multi = () => S.user.cards.length > 1;
function cardFor(c, p) {
  const left = Math.max(0, p.amount - p.used);
  const hot = !p.done && p.daysLeft <= 7;
  const when = p.done ? `<span class="chip ok">Claimed</span>` : `<span class="when ${hot ? 'hot' : ''}">Expires <b>${fmtDate(p.end)}</b> · <b>${p.daysLeft === 0 ? 'today' : p.daysLeft === 1 ? '1 day' : p.daysLeft + ' days'}</b></span>`;
  return `<article class="card ${hot ? 'urgent' : ''} ${p.done ? 'done' : ''}">
    <div class="brandline">${multi() ? `${esc(S.cards[c.card].name)} · ` : ''}${esc(c.brand)}</div>
    <div class="row"><h3 class="name">${esc(c.name)}</h3><span class="chip">${esc(p.label)}</span></div>
    <div class="row"><div class="amt">${money(p.done ? p.amount : left)}<small>${p.done ? 'claimed' : p.used > 0 ? `remaining of ${money(p.amount)}` : 'available'}</small></div>${when}</div>
    <div class="bar" role="progressbar" aria-valuenow="${Math.round(Math.min(100, (p.used / p.amount) * 100))}" aria-valuemin="0" aria-valuemax="100"><i data-w="${Math.min(100, (p.used / p.amount) * 100).toFixed(0)}"></i></div>
    ${c.enrollment && !c.enrolled && !p.done ? `<div><span class="chip warn">Enrollment required</span> <label class="check small ml8"><input type="checkbox" data-act="enrolled" data-id="${c.id}"><span class="box"></span>I've enrolled</label></div>` : ''}
    <div class="tools">
      <label class="check"><input type="checkbox" data-act="toggle" data-id="${c.id}" data-key="${p.key}" ${p.done ? 'checked' : ''}><span class="box"></span>Used</label>
      ${p.done ? '' : `<button class="link" data-act="snooze" data-id="${c.id}" data-until="${c.snoozeUntil >= S.today ? '' : 'week'}">${c.snoozeUntil >= S.today ? 'Snoozed — resume' : 'Snooze reminders 7 days'}</button><form class="mini" data-act="addamt" data-id="${c.id}" data-key="${p.key}"><input type="number" min="0.01" step="0.01" placeholder="$ spent" aria-label="Amount spent for ${esc(c.name)}"><button class="btn ghost small" type="submit">Add</button></form>`}
    </div>
    ${p.entries.length ? `<ul class="entries">${p.entries.map((e) => `<li><span>${money(e.amount)} · ${e.source === 'manual' ? 'manual' : 'auto: ' + esc(e.source)}${e.date ? ' · ' + fmtDate(e.date) : ''}</span><button data-act="delentry" data-id="${e.id}" aria-label="Remove entry">✕</button></li>`).join('')}</ul>` : ''}
    <details><summary>How to use it</summary><ul>${c.guide.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p>${esc(c.terms)}</p></details>
  </article>`;
}

function cycleCard(c) {
  const last = c.cycle.lastDate;
  return `<article class="card"><div class="brandline">${esc(c.brand)}</div><h3 class="name">${esc(c.name)}</h3>
    <div class="when">${esc(c.summary)}</div>
    <div class="tools"><label class="check"><input type="checkbox" data-act="toggle" data-id="${c.id}" data-key="cycle" ${last ? 'checked' : ''}><span class="box"></span>${last ? `Used ${fmtDate(last)} · next eligible ${c.cycle.years} yrs later` : 'Mark as used today'}</label></div>
    <details><summary>How to use it</summary><ul>${c.guide.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p>${esc(c.terms)}</p></details></article>`;
}

function viewNow() {
  const cur = [];
  for (const c of S.credits) {
    if (!c.tracked || c.period === 'cycle') continue;
    const p = c.periods.find((x) => x.isCurrent);
    if (p) cur.push({ c, p });
  }
  const open = cur.filter((x) => !x.p.done).sort((a, b) => a.p.daysLeft - b.p.daysLeft || b.p.amount - a.p.amount);
  const soon = open.filter((x) => x.p.daysLeft <= 14);
  const later = open.filter((x) => x.p.daysLeft > 14);
  const done = cur.filter((x) => x.p.done);
  const dateStr = new Date(S.today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return `
  <div class="hero"><div class="eyebrow">${esc(dateStr)}</div>
    <h1>${money(S.summary.remainingNow)} awaits you</h1>
    <p>${open.length ? `${open.length} credit${open.length > 1 ? 's' : ''} still open this period${soon.length ? `, ${soon.length} expiring within two weeks` : ''}.` : 'Every credit this period is claimed. Beautifully done.'}</p>
    <div class="figures">
      <div class="fig"><b>${money(S.summary.captured)}</b><span>Claimed in ${S.year}</span></div>
      <div class="fig"><b>${money(S.summary.possible)}</b><span>Available in ${S.year}</span></div>
      <div class="fig"><b>${Math.round((S.summary.captured / S.annualFee) * 100)}%</b><span>of $${S.annualFee} fee covered</span></div>
    </div></div>
  ${S.isNew && !localStorage.getItem('welcomed') ? `<section><div class="panel"><div class="eyebrow">Welcome</div><h3>Three steps to a well-kept Platinum</h3>
    <ol class="guide-list"><li><b>Choose your credits</b> in <a href="#settings">Settings</a> — untrack any you will not use so reminders stay relevant.</li>
    <li><b>Enroll</b> in the Amex Benefits dashboard for Resy, lululemon, Digital Entertainment, Equinox, CLEAR+, Oura and the airline credit, then tick "I've enrolled" on each card.</li>
    <li><b>Backfill and automate:</b> mark credits already used in the <a href="#year">Year</a> view, then import an Amex CSV or connect Gmail under <a href="#connect">Auto-detect</a>.</li></ol>
    <p><button class="btn ghost small" data-act="welcomed">Got it</button></p></div></section>` : ''}
  ${soon.length ? `<section><div class="sec-head"><h2>Expiring soon</h2><span class="eyebrow">Within 14 days</span></div><div class="grid">${soon.map((x) => cardFor(x.c, x.p)).join('')}</div></section>` : ''}
  ${later.length ? `<section><div class="sec-head"><h2>Available this period</h2></div><div class="grid">${later.map((x) => cardFor(x.c, x.p)).join('')}</div></section>` : ''}
  ${done.length ? `<section><div class="sec-head"><h2>Claimed</h2></div><div class="grid">${done.map((x) => cardFor(x.c, x.p)).join('')}</div></section>` : ''}
  ${S.credits.some((c) => c.tracked && c.period === 'cycle') ? `<section><div class="sec-head"><h2>Multi-year benefits</h2></div><div class="grid">${S.credits.filter((c) => c.tracked && c.period === 'cycle').map(cycleCard).join('')}</div></section>` : ''}
  ${!cur.length ? '<div class="empty">No credits are being tracked. Choose some in Settings.</div>' : ''}`;
}

function shortLabel(c, p) {
  if (c.period === 'monthly') return MONTH_SHORT[Number(p.key.slice(5, 7)) - 1];
  if (c.period === 'quarterly') return p.key.slice(5);
  if (c.period === 'semiannual') return p.key.slice(5);
  return String(p.key);
}

function insights() {
  const rows = S.credits.filter((c) => c.tracked && c.period !== 'cycle').map((c) => {
    const missed = c.periods.filter((p) => p.isPast).reduce((n, p) => n + Math.max(0, p.amount - p.used), 0);
    const claimed = c.periods.reduce((n, p) => n + Math.min(p.used, p.amount), 0);
    return { c, missed, claimed };
  });
  const missedTotal = rows.reduce((n, r) => n + r.missed, 0);
  const top = rows.filter((r) => r.missed > 0).sort((a, b) => b.missed - a.missed).slice(0, 3);
  const best = rows.slice().sort((a, b) => b.claimed - a.claimed)[0];
  return `<div class="panel"><div class="eyebrow">Insights</div>
    <p class="insight">${missedTotal > 0 ? `<b>${money(missedTotal)}</b> has expired unclaimed so far in ${S.year}${top.length ? `, mostly from ${top.map((r) => `${esc(r.c.name)} (${money(r.missed)})`).join(', ')}` : ''}.` : `Nothing has expired unclaimed so far in ${S.year}. Impressive.`}</p>
    ${best && best.claimed > 0 ? `<p class="muted small">Your biggest win: ${esc(best.c.name)}, ${money(best.claimed)} claimed.</p>` : ''}</div>`;
}
function viewYear() {
  const rows = S.credits.filter((c) => c.tracked && c.period !== 'cycle').map((c) => `
    <div class="nm">${esc(c.name)}<small>${multi() ? esc(S.cards[c.card].name) + '<br>' : ''}${money(c.amount)} · ${c.period}${c.monthAmounts ? ' (Dec $35)' : ''} · <b>${money(c.periods.reduce((n, p) => n + Math.min(p.used, p.amount), 0))}</b> of ${money(c.periods.reduce((n, p) => n + p.amount, 0))} claimed</small></div>
    <div class="cells">${c.periods.map((p) => {
      const cls = p.done ? 'done' : p.used > 0 ? 'partial' : p.isPast ? 'miss' : p.isCurrent ? '' : 'fut';
      return `<button class="cell ${cls} ${p.isCurrent ? 'cur' : ''}" data-act="toggle" data-id="${c.id}" data-key="${p.key}" data-checked="${p.done ? 1 : 0}" aria-pressed="${p.done}" aria-label="${esc(c.name)} ${esc(p.label)}: ${money(p.used)} of ${money(p.amount)} used" title="${esc(p.label)} · ${money(p.used)} of ${money(p.amount)} — click to ${p.done ? 'clear' : 'mark used'}">${shortLabel(c, p)}<b>${money(p.used)}</b></button>`;
    }).join('')}</div><div class="yr-sep"></div>`).join('');
  return `<section><div class="sec-head"><h2>${S.year} at a glance</h2>
    <div class="yearnav"><button data-act="year" data-d="-1" aria-label="Previous year">‹</button>${S.year}<button data-act="year" data-d="1" aria-label="Next year">›</button></div></div>
    ${insights()}
    <p class="muted small">Click any period to mark it used or clear it. Dark = claimed, gold outline = partially used, red = missed.</p>
    <div class="yr">${rows}</div></section>`;
}

function viewDetected() {
  return `<section><div class="sec-head"><h2>Detected spending</h2></div><div id="det" class="panel"><div class="muted">Loading…</div></div></section>`;
}

async function loadDetections() {
  const el = document.getElementById('det');
  if (!el) return;
  const list = await api('/api/detections');
  el.innerHTML = list.length
    ? list.map((d) => {
      const c = S.credits.find((x) => x.id === d.credit_id);
      return `<div class="det"><div><b>${esc(c?.name || d.credit_id)}</b> <span class="chip">${esc(d.period_key)}</span><div class="muted small">${esc(d.evidence)}</div></div>
        <div class="mini"><span>${money(d.amount)}</span><button class="btn small" data-act="accept" data-id="${d.id}">Count it</button><button class="btn ghost small" data-act="dismiss" data-id="${d.id}">Dismiss</button></div></div>`;
    }).join('')
    : '<div class="empty">Nothing to confirm. Connect Gmail or import an Amex CSV to detect spending automatically.</div>';
}

function viewConnect() {
  return `<section><div class="sec-head"><h2>Automatic detection</h2></div>
    <p class="muted w720">Amex does not offer a public API for card activity, so the tracker reads what you already receive: your Amex activity export, and (optionally) emails from Amex and the benefit merchants. Posted statement credits are checked off automatically; qualifying charges wait for your confirmation unless you choose otherwise.</p>
    <div class="two">
      <div class="panel" id="gmailpanel"><h3>Gmail</h3><div class="muted">Checking…</div></div>
      <div class="panel"><h3>Amex activity CSV</h3>
        <p class="muted small">Amex.com → Statements &amp; Activity → Download → CSV. Works with any date range and is the most reliable source for posted credits.</p>
        <input type="file" id="csvfile" accept=".csv,text/csv">
        <label class="f" for="csvcard">Which card is this file for?</label><select id="csvcard">${S.user.cards.map((id) => `<option value="${id}">${esc(S.cards[id].name)}</option>`).join('')}</select>
        <label class="check small mt14"><input type="checkbox" id="csvauto"><span class="box"></span>Also count qualifying charges automatically</label>
        <p><button class="btn" data-act="importcsv">Import</button></p>
      </div>
    </div>
    <div class="panel"><h3>Tip: make Amex email you</h3><p class="muted">In the Amex app, set Spending alerts to notify you on every charge (threshold $0.01) and by email. Those alerts name the merchant and amount, which lets Gmail detection work even for subscriptions that never email receipts.</p></div>
  </section>`;
}

async function refreshGmail() {
  const el = document.getElementById('gmailpanel');
  if (!el) return;
  const g = await api('/api/gmail/status');
  if (!g.available) {
    el.innerHTML = `<h3>Gmail</h3><p class="muted small">Gmail detection is not set up on this server. The host needs Google OAuth credentials (see README). CSV import works without it.</p>`;
  } else if (!g.connected) {
    el.innerHTML = `<h3>Gmail</h3><p class="muted small">Read-only access. Only messages from Amex and the benefit merchants are searched; email bodies are never stored.</p><p><a class="btn" href="/api/gmail/connect">Connect Gmail</a></p>`;
  } else {
    el.innerHTML = `<h3>Gmail</h3><p class="small">Connected as <b>${esc(g.googleEmail || 'your account')}</b>.<br><span class="muted">${g.lastScanAt ? 'Last scan ' + esc(g.lastScanAt) + ' UTC' : 'Not scanned yet'}${g.lastError ? ' · <span class="c-bad">' + esc(g.lastError) + '</span>' : ''}</span></p>
      <label class="check small"><input type="checkbox" data-act="gmailauto" ${g.autoApplySpend ? 'checked' : ''}><span class="box"></span>Count qualifying charges automatically</label>
      <p class="mini mt16"><button class="btn" data-act="scan">Scan now</button><button class="btn ghost" data-act="disconnect">Disconnect</button></p>`;
  }
}

function viewGuides() {
  return `<section><div class="sec-head"><h2>How to spend each credit</h2></div>
    <div class="grid">${S.credits.map((c) => `<article class="card"><div class="brandline">${esc(c.brand)}</div><h3 class="name">${esc(c.name)}</h3><div class="when">${esc(c.summary)}</div>
      <ul class="m0 guide-list">${c.guide.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="muted small m0">${esc(c.terms)}${c.verify ? ' <b>Verify this one in your Amex account.</b>' : ''}</p></article>`).join('')}</div>
    <p class="muted small mt24">Credit details reflect Amex's published terms as of ${esc(S.catalogVersion)}. Amex changes benefits periodically; always confirm in your account.</p></section>`;
}

function viewSettings() {
  const u = S.user;
  const tzs = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [u.tz]);
  const types = [['monthly', 'Monthly credits'], ['quarterly', 'Quarterly'], ['semiannual', 'Semi-annual'], ['annual', 'Annual']];
  return `<section><div class="sec-head"><h2>Reminders &amp; settings</h2></div>
  <div class="panel"><h3>Your cards</h3><p class="muted small">Choose the cards you hold; each brings its own credits, reminders and fee total.</p>${Object.values(S.cards).map((c) => `<label class="check mt14"><input type="checkbox" data-card="${c.id}" ${u.cards.includes(c.id) ? 'checked' : ''}><span class="box"></span>${esc(c.name)} · $${c.fee}/yr fee</label><br>`).join('')}<p class="mt14"><button class="btn ghost" data-act="savecards">Save cards</button></p></div>
  <div class="panel"><h3>Email reminders</h3>
    <p class="muted small">One tidy digest per day, only when an unused credit crosses one of the lead times below. ${S.mail ? '' : '<b>This server has no SMTP configured; emails are written to a local log.</b>'}</p>
    <label class="check"><input type="checkbox" id="s-email" ${u.emailReminders ? 'checked' : ''}><span class="box"></span>Send me reminder emails</label>
    <div class="two"><div><label class="f" for="s-tz">Time zone</label><select id="s-tz">${tzs.map((t) => `<option ${t === u.tz ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div><label class="f" for="s-hour">Send at</label><select id="s-hour">${[...Array(24).keys()].map((h) => `<option value="${h}" ${h === u.remindHour ? 'selected' : ''}>${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}</option>`).join('')}</select></div></div>
    <label class="f" for="s-ntfy">Phone push via ntfy (optional)</label>
    <input type="text" id="s-ntfy" value="${esc(u.ntfyTopic)}" placeholder="a-long-private-topic-name" autocomplete="off">
    <p class="muted small">Install the free ntfy app and subscribe to this topic name (pick something hard to guess). Reminders arrive as push notifications.</p>
    <label class="f" for="s-renew">Annual fee renewal date (optional)</label>
    <input type="date" id="s-renew" value="${esc(u.renewalDate)}">
    <p class="muted small">We'll mention it 45, 14 and 3 days before, with how much of the fee your credits have covered.</p>
    <label class="f">Days before the deadline (comma separated)</label>
    <div class="leads">${types.map(([k, l]) => `<div><div class="small muted">${l}</div><input type="text" data-lead="${k}" value="${u.leadDays[k].join(', ')}" aria-label="${l} lead days"></div>`).join('')}</div>
    <p class="mt24 mini"><button class="btn" data-act="savesettings">Save</button><button class="btn ghost" data-act="testmail">Send a test digest</button></p>
  </div>
  <div class="panel"><h3>Calendar alerts</h3><p class="muted small">Subscribe to this private link in Google Calendar, Apple Calendar or Outlook to get a deadline event (with the same lead-time alerts) for every open credit.</p>
    <div class="copy"><input type="text" readonly value="${esc(u.calendarUrl)}" id="calurl" aria-label="Calendar feed URL"><button class="btn ghost" data-act="copycal">Copy</button></div></div>
  <div class="panel"><h3>Your credits</h3>
    <table class="set"><thead><tr><th>Credit</th><th>Track</th><th>Remind</th><th>Enrolled</th></tr></thead><tbody>
    ${S.credits.map((c) => `<tr><td>${esc(c.name)}${c.id === 'airline' ? `<br><input type="text" data-airline placeholder="Airline you selected" value="${esc(c.airline)}" aria-label="Selected airline">` : ''}</td>
      <td><label class="check"><input type="checkbox" data-act="setc" data-f="tracked" data-id="${c.id}" ${c.tracked ? 'checked' : ''}><span class="box"></span></label></td>
      <td><label class="check"><input type="checkbox" data-act="setc" data-f="remind" data-id="${c.id}" ${c.remind ? 'checked' : ''}><span class="box"></span></label></td>
      <td>${c.enrollment ? `<label class="check"><input type="checkbox" data-act="setc" data-f="enrolled" data-id="${c.id}" ${c.enrolled ? 'checked' : ''}><span class="box"></span></label>` : '<span class="muted small">n/a</span>'}</td></tr>`).join('')}
    </tbody></table></div>
  <div class="panel"><h3>Your data</h3><p class="muted small">Download everything you have recorded, or restore it into another account.</p>
    <p class="mini"><a class="btn ghost" href="/api/export" download>Export JSON</a><input type="file" id="jsonfile" accept=".json,application/json" class="w240"><button class="btn ghost" data-act="importjson">Import</button></p></div>
  <div class="panel"><h3>Account</h3><p class="muted small">Deleting your account removes all your data, including any Gmail connection.</p>
    <p class="mini"><input type="password" id="delpw" placeholder="Password" aria-label="Password to confirm deletion" class="w240"><button class="btn ghost" data-act="delacct">Delete account</button></p></div>
  </section>`;
}

function renderAuth() {
  const resetToken = (location.hash.match(/reset=([\w-]+)/) || [])[1];
  const mode = resetToken ? 'reset' : authMode;
  const titles = { login: ['Welcome back', 'Sign in'], signup: ['Create your account', 'Create account'], forgot: ['Reset password', 'Email me a link'], reset: ['Choose a new password', 'Save password'] };
  root.innerHTML = `<div class="auth">
    <div class="auth-art"><div class="brand">${logo}<span>Platinum<small>Credit Tracker</small></span></div>
      <div><div class="eyebrow c-gold">Every benefit. Every deadline.</div><h1>Claim what is already yours.</h1><p>A quiet, orderly way to track each Platinum credit by month, quarter and year — with considerate reminders well before they expire.</p></div>
      <div class="small c-fade">Independent tool. Not affiliated with or endorsed by American Express.</div></div>
    <div class="auth-form"><form id="authform" novalidate>
      <h2>${titles[mode][0]}</h2><div class="muted small">${mode === 'login' ? 'Sign in to see your credits.' : ''}</div>
      ${flash ? `<div class="msg ${flash.err ? 'err' : ''}" role="alert">${esc(flash.text)}</div>` : ''}
      ${mode !== 'reset' ? '<label class="f" for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required>' : ''}
      ${mode !== 'forgot' ? `<label class="f" for="a-pw">${mode === 'reset' ? 'New password' : 'Password'}</label><input id="a-pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>` : ''}
      ${mode === 'signup' ? '<div class="muted small mt6">At least 10 characters.</div>' : ''}
      <button class="btn" type="submit">${titles[mode][1]}</button>
      ${mode === 'login' || mode === 'signup' ? '<p class="small mt20"><button type="button" class="link" data-act="demo">Just looking? Try a demo with sample data</button></p>' : ''}
      <p class="small mt20">${mode === 'login' ? `<button type="button" class="link" data-act="mode" data-m="signup">Create an account</button> · <button type="button" class="link" data-act="mode" data-m="forgot">Forgot password</button>` : `<button type="button" class="link" data-act="mode" data-m="login">Back to sign in</button>`}</p>
    </form></div></div>`;
  document.getElementById('authform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('a-email')?.value;
    const password = document.getElementById('a-pw')?.value;
    try {
      if (mode === 'login') await api('/api/auth/login', 'POST', { email, password });
      else if (mode === 'signup') await api('/api/auth/signup', 'POST', { email, password, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      else if (mode === 'reset') { await api('/api/auth/reset', 'POST', { token: resetToken, password }); history.replaceState(null, '', '#now'); }
      else { await api('/api/auth/forgot', 'POST', { email }); flash = { text: 'If that account exists, a reset link is on its way.' }; return renderAuth(); }
      flash = null; route = 'now'; await load();
    } catch (err) { flash = { text: err.message, err: true }; renderAuth(); }
  });
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'FORM' || t.tagName === 'INPUT' && t.type === 'checkbox') return;
  const act = t.dataset.act;
  try {
    if (act === 'mode') { authMode = t.dataset.m; flash = null; return renderAuth(); }
    if (act === 'demo') { await api('/api/demo', 'POST', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); flash = null; route = 'now'; return load(); }
    if (act === 'importjson') {
      const f = document.getElementById('jsonfile').files[0];
      if (!f) return say('Choose an export file first.', true);
      let d; try { d = JSON.parse(await f.text()); } catch { return say('That file is not valid JSON.', true); }
      const r = await api('/api/import/json', 'POST', d); await load(); return say(`Imported ${r.added} new entries.`);
    }
    if (act === 'snooze') {
      const d = new Date(S.today + 'T12:00:00'); d.setDate(d.getDate() + 7);
      await api(`/api/credits/${t.dataset.id}`, 'PUT', { snoozeUntil: t.dataset.until ? d.toISOString().slice(0, 10) : '' });
      return load();
    }
    if (act === 'savecards') {
      const cards = [...document.querySelectorAll('[data-card]')].filter((i) => i.checked).map((i) => i.dataset.card);
      await api('/api/settings', 'PUT', { cards }); await load(); return say('Cards updated.');
    }
    if (act === 'resend') { await api('/api/auth/resend', 'POST', {}); return say('Confirmation link sent. Check your inbox.'); }
    if (act === 'welcomed') { localStorage.setItem('welcomed', '1'); return render(); }
    if (act === 'logout') { await api('/api/auth/logout', 'POST', {}); S = null; flash = null; return render(); }
    if (act === 'year') { year = S.year + Number(t.dataset.d); return load(); }
    if (act === 'delentry') { await api(`/api/entries/${t.dataset.id}`, 'DELETE'); return load(); }
    if (act === 'toggle' && t.classList.contains('cell')) {
      await api('/api/toggle', 'POST', { creditId: t.dataset.id, periodKey: t.dataset.key, checked: t.dataset.checked !== '1' });
      return load();
    }
    if (act === 'accept' || act === 'dismiss') { await api(`/api/detections/${t.dataset.id}/${act}`, 'POST', {}); await load(); return; }
    if (act === 'importcsv') {
      const f = document.getElementById('csvfile').files[0];
      if (!f) return say('Choose a CSV file first.', true);
      const r = await api('/api/import/csv', 'POST', { text: await f.text(), autoApplySpend: document.getElementById('csvauto').checked, card: document.getElementById('csvcard').value });
      await load();
      return say(`Read ${r.rows} rows: ${r.applied} credits checked off, ${r.pending} charges waiting for your confirmation${r.skipped ? `, ${r.skipped} already known` : ''}.`);
    }
    if (act === 'scan') { t.disabled = true; t.textContent = 'Scanning…'; const r = await api('/api/gmail/scan', 'POST', {}); await load(); return say(`Scan complete: ${r.applied} credits checked off, ${r.pending} waiting for confirmation.`); }
    if (act === 'disconnect') { await api('/api/gmail/disconnect', 'POST', {}); return refreshGmail(); }
    if (act === 'savesettings') {
      const leadDays = {};
      document.querySelectorAll('[data-lead]').forEach((i) => { leadDays[i.dataset.lead] = i.value.split(/[ ,]+/).filter(Boolean).map(Number); });
      await api('/api/settings', 'PUT', { emailReminders: document.getElementById('s-email').checked, tz: document.getElementById('s-tz').value, ntfyTopic: document.getElementById('s-ntfy').value, renewalDate: document.getElementById('s-renew').value, remindHour: Number(document.getElementById('s-hour').value), leadDays });
      await load(); return say('Settings saved.');
    }
    if (act === 'testmail') { const r = await api('/api/reminders/test', 'POST', {}); return say(r.sent ? `Test digest sent with ${r.count} credit${r.count > 1 ? 's' : ''}.` : 'Nothing is open right now, so there was nothing to send.'); }
    if (act === 'copycal') { await navigator.clipboard?.writeText(document.getElementById('calurl').value); return say('Calendar link copied.'); }
    if (act === 'delacct') {
      if (!confirm('Permanently delete your account and all data?')) return;
      await api('/api/account/delete', 'POST', { password: document.getElementById('delpw').value });
      S = null; return render();
    }
  } catch (err) { if (err.status === 401) { S = null; render(); } else say(err.message, true); }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  const act = t.dataset?.act;
  if (!act) return;
  try {
    if (act === 'toggle' && t.type === 'checkbox') { await api('/api/toggle', 'POST', { creditId: t.dataset.id, periodKey: t.dataset.key, checked: t.checked }); await load(); }
    else if (act === 'enrolled') { await api(`/api/credits/${t.dataset.id}`, 'PUT', { enrolled: t.checked }); await load(); }
    else if (act === 'setc') { await api(`/api/credits/${t.dataset.id}`, 'PUT', { [t.dataset.f]: t.checked }); await load(); }
    else if (act === 'gmailauto') await api('/api/gmail/settings', 'POST', { autoApplySpend: t.checked });
  } catch (err) { say(err.message, true); }
  if (t.hasAttribute('data-airline')) return;
});

document.addEventListener('focusout', async (e) => {
  if (e.target.hasAttribute?.('data-airline')) {
    try { await api('/api/credits/airline', 'PUT', { airline: e.target.value }); } catch { /* ignore */ }
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-act="addamt"]');
  if (!f) return;
  e.preventDefault();
  const amount = Number(f.querySelector('input').value);
  if (!(amount > 0)) return;
  try { await api('/api/entries', 'POST', { creditId: f.dataset.id, periodKey: f.dataset.key, amount }); await load(); } catch (err) { say(err.message, true); }
});

async function checkVerifyLink() {
  const t = (location.hash.match(/verify=([\w-]+)/) || [])[1];
  if (!t) return;
  history.replaceState(null, '', '#now');
  try { await api('/api/auth/verify', 'POST', { token: t }); flash = { text: 'Email confirmed. Reminders are on.' }; } catch (e) { flash = { text: e.message, err: true }; }
  holdFlash = true;
  await load();
}
function onHash() {
  if (S && location.hash.includes('verify=')) { checkVerifyLink(); return; }
  const h = location.hash.replace('#', '').split('=')[0];
  if (['now', 'year', 'detected', 'connect', 'guides', 'settings'].includes(h)) route = h;
  if (location.hash.startsWith('#gmail=')) {
    flash = location.hash.includes('connected') ? { text: 'Gmail connected. Run a scan to look for credits.' } : { text: 'Gmail connection failed. Please try again.', err: true };
    route = 'connect';
    history.replaceState(null, '', '#connect');
  } else if (h !== 'reset' && !holdFlash) flash = null;
  holdFlash = false;
  render();
  if (S && route === 'detected') loadDetections();
}
window.addEventListener('hashchange', onHash);
await checkVerifyLink();
await load();
onHash();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
