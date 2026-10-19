import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTransaction, parseAmexCsv } from '../src/matcher.js';
import { parseEmail } from '../src/gmail.js';

// Synthetic samples modelled on the shapes of public Amex exports and typical merchant receipts.
const CSV = `Date,Description,Card Member,Account #,Amount
10/01/2026,"UBER CASH CREDIT",DOM SMITH,-12345,-15.00
10/02/2026,"HULU 877-8244858 CA",DOM SMITH,-12345,18.99
10/03/2026,"GOOGLE *YOUTUBEPREMIUM g.co/helppay#",DOM SMITH,-12345,13.99
10/04/2026,"WALMART+ MEMBERSHIP",DOM SMITH,-12345,12.95
10/05/2026,"RESY | LE BERNARDIN NEW YORK NY",DOM SMITH,-12345,142.00
10/06/2026,"PLATINUM AIRLINE FEE CREDIT",DOM SMITH,-12345,-35.00
10/07/2026,"AMERICAN AIRLINES BAG FEE",DOM SMITH,-12345,35.00
10/08/2026,"AMEX TRAVEL FINE HOTELS RESORTS",DOM SMITH,-12345,820.00
10/09/2026,"WHOLE FOODS MARKET",DOM SMITH,-12345,64.12
10/10/2026,"HOTEL CREDIT",DOM SMITH,-12345,-300.00
10/11/2026,"CLEARME.COM CLEAR+ MEMBERSHIP",DOM SMITH,-12345,209.00
10/12/2026,"EQUINOX PLUS",DOM SMITH,-12345,40.00
`;

test('CSV fixture detects the expected credits', () => {
  const found = parseAmexCsv(CSV).map(matchTransaction).filter(Boolean).map((d) => `${d.creditId}:${d.confidence}`);
  assert.deepEqual(found, [
    'uber_cash:credit', 'digital:spend', 'digital:spend', 'walmart:spend', 'resy:spend',
    'airline:credit', 'airline:spend', 'hotel:spend', 'hotel:credit', 'clear:spend', 'equinox:spend',
  ]);
});

const mail = (over) => ({ id: 'm', from: 'x@y.com', subject: '', dateMs: Date.parse('2026-10-05T16:00:00Z'), text: '', ...over });

test('email fixtures: HTML-flattened Amex alerts and receipts', () => {
  const a = parseEmail(mail({ from: 'AmericanExpress@welcome.americanexpress.com', subject: 'Card Transaction Alert', text: 'Hello Dom, a purchase of $75.00 was made on your Platinum Card ending 1002 at LULULEMON ATHLETICA on 10/05/2026.' }));
  assert.equal(matchTransaction(a)?.creditId, 'lululemon');
  const r = parseEmail(mail({ from: 'receipts@resy.com', subject: 'Your Resy receipt', text: 'Thank you for dining. Subtotal $88.00 Tax $7.81 Total $95.81' }));
  assert.equal(r.amount, 95.81);
  assert.equal(matchTransaction(r)?.creditId, 'resy');
  const u = parseEmail(mail({ from: 'uber.us@uber.com', subject: 'Your Thursday evening trip with Uber', text: 'Total $23.40 Payment Amex Platinum' }));
  assert.equal(matchTransaction(u)?.creditId, 'uber_cash');
});

test('newsletters and unrelated mail are ignored', () => {
  const n = parseEmail(mail({ from: 'news@lululemon.com', subject: 'New arrivals', text: 'Shop the new collection. Free shipping over 75 dollars' }));
  assert.equal(n, null);
  assert.equal(parseEmail(mail({ from: 'AmericanExpress@welcome.americanexpress.com', subject: 'Your statement is ready', text: 'View your statement online.' })), null);
});
