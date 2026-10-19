import { currentPeriod, daysBetween, localNow, periodsForYear } from './periods.js';
import { ACTIVE_CREDITS, DEFAULT_LEAD_DAYS } from './catalog.js';

const EPS = 0.005;

/**
 * Pure function: which credits need a nudge today?
 *
 * states: [{ credit, tracked, enrolled, remind, used }]   `used` = amount captured in the current period
 * sent:   Set of "creditId|periodKey|lead" already emailed
 *
 * A reminder fires the first time daysLeft <= lead (so a missed day never skips a reminder).
 * If several lead thresholds were crossed at once only one nudge is produced; all crossed leads are
 * recorded in `markSent`.
 */
export function dueReminders({ states, today, leadDays, sent }) {
  const due = [];
  const markSent = [];
  for (const s of states) {
    if (!s.tracked || !s.remind) continue;
    const credit = s.credit;
    if (credit.period === 'cycle') continue;
    const p = currentPeriod(credit, today);
    if (!p) continue;
    const remaining = Math.round((p.amount - s.used(p.key)) * 100) / 100;
    if (remaining <= EPS) continue;
    const leads = (leadDays[credit.period] || DEFAULT_LEAD_DAYS[credit.period] || []).slice().sort((a, b) => b - a);
    const daysLeft = daysBetween(today, p.end);
    const crossed = leads.filter((l) => daysLeft <= l);
    const fresh = crossed.filter((l) => !sent.has(`${credit.id}|${p.key}|${l}`));
    if (!fresh.length) continue;
    for (const l of crossed) markSent.push({ creditId: credit.id, periodKey: p.key, lead: l });
    due.push({
      creditId: credit.id,
      name: credit.name,
      emoji: credit.emoji,
      periodKey: p.key,
      periodLabel: p.label,
      amount: p.amount,
      remaining,
      daysLeft,
      deadline: p.end,
      needsEnroll: credit.enrollment && !s.enrolled,
      summary: credit.summary,
    });
  }
  due.sort((a, b) => a.daysLeft - b.daysLeft);
  return { due, markSent };
}

export function digestEmail(due, appUrl) {
  const total = due.reduce((n, d) => n + d.remaining, 0);
  const dayWord = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  const subject = `${due.length} Platinum credit${due.length > 1 ? 's' : ''} to use — $${total.toFixed(0)} still unclaimed`;
  const lines = due.map(
    (d) => `• ${d.name}: $${d.remaining.toFixed(2)} left for ${d.periodLabel} — expires ${d.deadline} (${dayWord(d.daysLeft)})` +
      (d.needsEnroll ? '\n  ⚠ Enrollment required: enroll the card first in your Amex Benefits dashboard.' : ''),
  );
  const text = `Your Amex Platinum credits that are still unused:\n\n${lines.join('\n')}\n\nOpen your tracker: ${appUrl}\n\nManage reminder timing in Settings. Amex terms change; always confirm eligibility in your Amex account.`;
  const rows = due.map(
    (d) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e6e0d4">
      <div style="font:600 16px Georgia,serif;color:#14213d">${d.emoji} ${esc(d.name)}</div>
      <div style="font:14px Helvetica,Arial,sans-serif;color:#555;margin-top:4px">$${d.remaining.toFixed(2)} left for ${esc(d.periodLabel)} &middot; expires <b>${d.deadline}</b> (${dayWord(d.daysLeft)})</div>
      ${d.needsEnroll ? '<div style="font:13px Helvetica,Arial,sans-serif;color:#9a6b00;margin-top:4px">Enrollment required — enroll in your Amex Benefits dashboard first.</div>' : ''}
    </td></tr>`).join('');
  const html = `<div style="background:#f6f3ec;padding:32px 12px"><table align="center" width="560" style="background:#fff;border-top:3px solid #b8975a;padding:32px"><tr><td>
    <div style="font:11px Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#b8975a">Platinum Credit Tracker</div>
    <h1 style="font:400 26px Georgia,serif;color:#14213d;margin:8px 0 4px">$${total.toFixed(0)} still unclaimed</h1>
    <table width="100%">${rows}</table>
    <p style="margin-top:24px"><a href="${appUrl}" style="background:#14213d;color:#fff;padding:12px 22px;font:13px Helvetica,Arial,sans-serif;letter-spacing:.08em;text-decoration:none;text-transform:uppercase">Open tracker</a></p>
  </td></tr></table></div>`;
  return { subject, text, html };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Decide if this user's digest should be evaluated now (their local hour reached, once per local day). */
export function digestWindowOpen(user, now = new Date()) {
  const { date, hour } = localNow(user.tz, now);
  return hour >= user.remind_hour && user.last_digest_date !== date ? date : null;
}

export { periodsForYear, ACTIVE_CREDITS };
