import { DEFAULT_LEAD_DAYS } from './catalog.js';

const fold = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const compact = (d) => d.replace(/-/g, '');
const nextDay = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
};

/**
 * events: [{ uid, name, remaining, periodLabel, end, period, summary }]
 * Subscribing to this feed in Google/Apple/Outlook Calendar gives native alerts with the same lead times.
 */
export function buildIcs(events, leadDays, appUrl) {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Platinum Credit Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Amex Platinum credit deadlines'];
  for (const e of events) {
    const leads = leadDays[e.period] || DEFAULT_LEAD_DAYS[e.period] || [];
    out.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@platinum-tracker`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
      `DTSTART;VALUE=DATE:${compact(e.end)}`,
      `DTEND;VALUE=DATE:${nextDay(e.end)}`,
      `SUMMARY:${fold(`Last day: $${e.remaining.toFixed(0)} ${e.name} (${e.periodLabel})`)}`,
      `DESCRIPTION:${fold(`${e.summary}\nTrack it: ${appUrl}`)}`,
      'TRANSP:TRANSPARENT',
    );
    for (const l of leads) {
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${fold(`${e.name}: ${l} day${l === 1 ? '' : 's'} left`)}`, `TRIGGER:-P${l}DT-15H`, 'END:VALARM');
    }
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}
