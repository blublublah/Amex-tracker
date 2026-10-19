// Calendar-period math. All dates are 'YYYY-MM-DD' strings in the user's local time zone.

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function amountFor(credit, periodKey) {
  if (credit.period === 'monthly' && credit.monthAmounts) {
    const m = Number(periodKey.slice(5, 7));
    if (credit.monthAmounts[m] != null) return credit.monthAmounts[m];
  }
  return credit.amount;
}

/** All periods of `credit` that fall in calendar `year`. */
export function periodsForYear(credit, year) {
  const out = [];
  const add = (key, label, start, end) => out.push({ key, label, start, end, amount: amountFor(credit, key) });
  switch (credit.period) {
    case 'monthly':
      for (let m = 1; m <= 12; m++) add(`${year}-${pad(m)}`, `${MONTHS[m - 1]} ${year}`, ymd(year, m, 1), ymd(year, m, lastDay(year, m)));
      break;
    case 'quarterly':
      for (let q = 1; q <= 4; q++) {
        const m1 = (q - 1) * 3 + 1;
        add(`${year}-Q${q}`, `Q${q} (${MONTHS[m1 - 1]}–${MONTHS[m1 + 1]})`, ymd(year, m1, 1), ymd(year, m1 + 2, lastDay(year, m1 + 2)));
      }
      break;
    case 'semiannual':
      add(`${year}-H1`, 'Jan–Jun', ymd(year, 1, 1), ymd(year, 6, 30));
      add(`${year}-H2`, 'Jul–Dec', ymd(year, 7, 1), ymd(year, 12, 31));
      break;
    case 'annual':
      add(`${year}`, `${year}`, ymd(year, 1, 1), ymd(year, 12, 31));
      break;
    default: // 'cycle' has no calendar periods
  }
  return out;
}

/** Period key that a given local date falls into, or null for 'cycle' credits. */
export function periodKeyForDate(credit, date) {
  const [y, m] = date.split('-').map(Number);
  switch (credit.period) {
    case 'monthly': return `${y}-${pad(m)}`;
    case 'quarterly': return `${y}-Q${Math.ceil(m / 3)}`;
    case 'semiannual': return `${y}-H${m <= 6 ? 1 : 2}`;
    case 'annual': return `${y}`;
    default: return 'cycle';
  }
}

export function currentPeriod(credit, today) {
  const y = Number(today.slice(0, 4));
  return periodsForYear(credit, y).find((p) => p.start <= today && today <= p.end) || null;
}

/** Today's local date / hour in an IANA time zone. */
export function localNow(tz, now = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return localNow('America/New_York', now);
  }
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

export const isValidTz = (tz) => {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};
