import test from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_BY_ID, ACTIVE_CREDITS, DEFAULT_LEAD_DAYS } from '../src/catalog.js';
import { periodsForYear, periodKeyForDate, currentPeriod, daysBetween, localNow } from '../src/periods.js';
import { dueReminders } from '../src/reminders.js';
import { matchTransaction, parseAmexCsv } from '../src/matcher.js';
import { parseEmail } from '../src/gmail.js';
import { buildIcs } from '../src/ics.js';

test('catalog annual maximum matches Amex totals ($2,994 excl. Venue/Global Entry)', () => {
  let total = 0;
  for (const c of ACTIVE_CREDITS) {
    if (c.period === 'cycle' || c.id === 'venue') continue;
    total += periodsForYear(c, 2026).reduce((n, p) => n + p.amount, 0);
  }
  assert.ok(Math.abs(total - 2994) < 1, `total was ${total}`);
});

test('period counts and December Uber Cash bonus', () => {
  assert.equal(periodsForYear(CREDIT_BY_ID.digital, 2026).length, 12);
  assert.equal(periodsForYear(CREDIT_BY_ID.resy, 2026).length, 4);
  assert.equal(periodsForYear(CREDIT_BY_ID.hotel, 2026).length, 2);
  const uber = periodsForYear(CREDIT_BY_ID.uber_cash, 2026);
  assert.equal(uber[11].amount, 35);
  assert.equal(uber.reduce((n, p) => n + p.amount, 0), 200);
});

test('period boundaries (leap year, quarter ends)', () => {
  const feb = periodsForYear(CREDIT_BY_ID.digital, 2028)[1];
  assert.equal(feb.end, '2028-02-29');
  assert.equal(periodKeyForDate(CREDIT_BY_ID.resy, '2026-10-01'), '2026-Q4');
  assert.equal(periodKeyForDate(CREDIT_BY_ID.hotel, '2026-06-30'), '2026-H1');
  assert.equal(currentPeriod(CREDIT_BY_ID.hotel, '2026-07-01').key, '2026-H2');
  assert.equal(daysBetween('2026-10-19', '2026-12-31'), 73);
});

test('localNow respects time zones', () => {
  const t = new Date('2026-01-01T03:00:00Z');
  assert.equal(localNow('America/Los_Angeles', t).date, '2025-12-31');
  assert.equal(localNow('Asia/Tokyo', t).date, '2026-01-01');
});

function states(over = {}) {
  return ACTIVE_CREDITS.map((c) => ({ credit: c, tracked: true, enrolled: false, remind: true, used: () => 0, ...(over[c.id] || {}) }));
}

test('reminders fire at lead thresholds, once, and skip completed credits', () => {
  const sent = new Set();
  // Oct 19: Q4 ends Dec 31 (73 days) -> no quarterly reminder; October monthly ends in 12 days -> 10-day lead not yet crossed
  let r = dueReminders({ states: states(), today: '2026-10-19', leadDays: DEFAULT_LEAD_DAYS, sent });
  assert.ok(!r.due.some((d) => d.creditId === 'resy'));
  assert.ok(!r.due.some((d) => d.creditId === 'digital'));
  // Oct 22: 9 days left -> monthly lead 10 crossed
  r = dueReminders({ states: states(), today: '2026-10-22', leadDays: DEFAULT_LEAD_DAYS, sent });
  const names = r.due.map((d) => d.creditId);
  assert.ok(names.includes('digital') && names.includes('uber_cash') && names.includes('walmart'));
  r.markSent.forEach((m) => sent.add(`${m.creditId}|${m.periodKey}|${m.lead}`));
  // same day again: nothing new
  r = dueReminders({ states: states(), today: '2026-10-22', leadDays: DEFAULT_LEAD_DAYS, sent });
  assert.equal(r.due.length, 0);
  // Dec 1: Q4 has 30 days left -> quarterly + annual(90..) crossed
  r = dueReminders({ states: states(), today: '2026-12-01', leadDays: DEFAULT_LEAD_DAYS, sent });
  assert.ok(r.due.some((d) => d.creditId === 'resy') && r.due.some((d) => d.creditId === 'oura'));
  // completed credits are skipped
  r = dueReminders({ states: states({ resy: { used: () => 100 } }), today: '2026-12-01', leadDays: DEFAULT_LEAD_DAYS, sent: new Set() });
  assert.ok(!r.due.some((d) => d.creditId === 'resy'));
  // untracked / reminders off
  r = dueReminders({ states: states({ oura: { tracked: false }, clear: { remind: false } }), today: '2026-12-20', leadDays: DEFAULT_LEAD_DAYS, sent: new Set() });
  assert.ok(!r.due.some((d) => ['oura', 'clear'].includes(d.creditId)));
});

test('a missed day does not skip a reminder, and one nudge covers all crossed leads', () => {
  const r = dueReminders({ states: states(), today: '2026-12-30', leadDays: DEFAULT_LEAD_DAYS, sent: new Set() });
  const oura = r.due.filter((d) => d.creditId === 'oura');
  assert.equal(oura.length, 1);
  assert.equal(oura[0].daysLeft, 1);
  assert.equal(r.markSent.filter((m) => m.creditId === 'oura').length, DEFAULT_LEAD_DAYS.annual.length);
});

test('matcher: posted credits and qualifying spend', () => {
  const c = matchTransaction({ date: '2026-10-05', description: 'PLATINUM DIGITAL ENTERTAINMENT CREDIT', amount: -25, source: 'csv' });
  assert.equal(c.creditId, 'digital'); assert.equal(c.confidence, 'credit'); assert.equal(c.amount, 25); assert.equal(c.periodKey, '2026-10');
  const s = matchTransaction({ date: '2026-10-05', description: 'LULULEMON ATHLETICA 123 NEW YORK', amount: 118.2, source: 'csv' });
  assert.equal(s.creditId, 'lululemon'); assert.equal(s.confidence, 'spend');
  assert.equal(matchTransaction({ date: '2026-10-05', description: 'UBER ONE MEMBERSHIP', amount: 9.99, source: 'csv' }).creditId, 'uber_one');
  assert.equal(matchTransaction({ date: '2026-10-05', description: 'UBER EATS HELP.UBER.COM', amount: 31.4, source: 'csv' }).creditId, 'uber_cash');
  assert.equal(matchTransaction({ date: '2026-10-05', description: 'DELTA AIR LINES TICKET', amount: 450, source: 'csv' }), null); // airfare is not an incidental
  assert.equal(matchTransaction({ date: '2026-10-05', description: 'DELTA BAG FEE', amount: 35, source: 'csv' }).creditId, 'airline');
  assert.equal(matchTransaction({ date: '2026-10-05', description: 'RANDOM STORE', amount: 20, source: 'csv' }), null);
  assert.equal(matchTransaction({ date: '2026-10-05', description: 'LULULEMON REFUND', amount: -40, source: 'csv' }), null); // refund, not credit
});

test('Amex CSV parsing handles quotes, BOM and date formats', () => {
  const csv = '﻿Date,Description,Card Member,Account #,Amount\n10/05/2026,"RESY | CHEZ, PARIS",DOM,-1000,87.50\n10/06/2026,RESY CREDIT,DOM,-1000,-100.00\n';
  const tx = parseAmexCsv(csv);
  assert.equal(tx.length, 2);
  assert.equal(tx[0].description, 'RESY | CHEZ, PARIS'); assert.equal(tx[0].date, '2026-10-05');
  assert.equal(matchTransaction(tx[1]).confidence, 'credit');
  assert.throws(() => parseAmexCsv('a,b\n1,2'));
});

test('Gmail parser: Amex alert, Amex credit notice, merchant receipt', () => {
  const alert = parseEmail({ id: 'a1', from: 'Amex <AmericanExpress@welcome.americanexpress.com>', subject: 'Large purchase notification', dateMs: Date.parse('2026-10-05T15:00:00Z'), text: 'A charge of $18.37 was placed on your Card ending in 1002 at LULULEMON ONLINE on October 5.' });
  assert.equal(alert.amount, 18.37); assert.match(alert.description, /LULULEMON/i);
  assert.equal(matchTransaction(alert).creditId, 'lululemon');
  const credit = parseEmail({ id: 'a2', from: 'american@aexp.com', subject: 'You received a credit', dateMs: Date.parse('2026-10-06T15:00:00Z'), text: 'A statement credit of $15.00 has been applied to your account for Uber Cash.' });
  assert.equal(credit.amount, -15);
  assert.equal(matchTransaction(credit).creditId, 'uber_cash');
  const rcpt = parseEmail({ id: 'a3', from: 'no-reply@ouraring.com', subject: 'Your Oura order confirmation', dateMs: Date.parse('2026-10-07T15:00:00Z'), text: 'Thanks! Subtotal $349.00 Shipping $0.00 Order total: $349.00' });
  assert.equal(rcpt.amount, 349);
  assert.equal(matchTransaction(rcpt).creditId, 'oura');
  assert.equal(parseEmail({ id: 'z', from: 'x@amazon.com', subject: 'hi', dateMs: 0, text: 'no money here' }), null);
});

test('ICS output is well-formed with alarms', () => {
  const ics = buildIcs([{ uid: 'u', name: 'Resy', remaining: 100, periodLabel: 'Q4', end: '2026-12-31', period: 'quarterly', summary: 'x, y' }], DEFAULT_LEAD_DAYS, 'http://x');
  assert.match(ics, /BEGIN:VEVENT[\s\S]*DTSTART;VALUE=DATE:20261231/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, DEFAULT_LEAD_DAYS.quarterly.length);
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270101'));
});
