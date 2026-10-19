import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'amex-test-'));
const { app, runDigest } = await import('../src/server.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
const call = async (p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};
test.after(() => server.close());

test('auth required, signup validation, login', async () => {
  assert.equal((await call('/api/state')).status, 401);
  assert.equal((await call('/api/auth/signup', 'POST', { email: 'bad', password: 'longenoughpw' })).status, 400);
  assert.equal((await call('/api/auth/signup', 'POST', { email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await call('/api/auth/signup', 'POST', { email: 'a@b.co', password: 'correct horse battery', tz: 'America/Chicago' })).status, 200);
  assert.equal((await call('/api/auth/signup', 'POST', { email: 'a@b.co', password: 'correct horse battery' })).status, 409);
  cookie = '';
  assert.equal((await call('/api/auth/login', 'POST', { email: 'a@b.co', password: 'wrong password!' })).status, 401);
  assert.equal((await call('/api/auth/login', 'POST', { email: 'a@b.co', password: 'correct horse battery' })).status, 200);
});

test('check off, partial amounts, clear, and year summary', async () => {
  let { body: s } = await call('/api/state?year=2026');
  const resy = () => s.credits.find((c) => c.id === 'resy');
  assert.equal(resy().periods.length, 4);
  await call('/api/toggle', 'POST', { creditId: 'resy', periodKey: '2026-Q1', checked: true });
  await call('/api/entries', 'POST', { creditId: 'resy', periodKey: '2026-Q2', amount: 40 });
  ({ body: s } = await call('/api/state?year=2026'));
  assert.equal(resy().periods[0].done, true);
  assert.equal(resy().periods[1].used, 40);
  assert.equal(resy().periods[1].done, false);
  assert.equal((await call('/api/entries', 'POST', { creditId: 'resy', periodKey: '2030-Q9', amount: 5 })).status, 400);
  await call('/api/toggle', 'POST', { creditId: 'resy', periodKey: '2026-Q1', checked: false });
  ({ body: s } = await call('/api/state?year=2026'));
  assert.equal(resy().periods[0].used, 0);
});

test('CSV import auto-checks credit lines, queues spend, and is idempotent', async () => {
  const csv = 'Date,Description,Amount\n10/05/2026,PLATINUM DIGITAL ENTERTAINMENT CREDIT,-25.00\n10/09/2026,LULULEMON ATHLETICA,60.00\n10/10/2026,GROCERY,12.00\n';
  const r = await call('/api/import/csv', 'POST', { text: csv });
  assert.equal(r.body.matched, 2); assert.equal(r.body.applied, 1); assert.equal(r.body.pending, 1);
  const again = await call('/api/import/csv', 'POST', { text: csv });
  assert.equal(again.body.skipped, 2);
  let { body: s } = await call('/api/state?year=2026');
  assert.equal(s.credits.find((c) => c.id === 'digital').periods[9].done, true);
  assert.equal(s.pendingDetections, 1);
  const det = (await call('/api/detections')).body[0];
  await call(`/api/detections/${det.id}/accept`, 'POST', {});
  ({ body: s } = await call('/api/state?year=2026'));
  assert.equal(s.credits.find((c) => c.id === 'lululemon').periods[3].used, 60);
  assert.equal(s.pendingDetections, 0);
});

test('settings validation and calendar feed', async () => {
  await call('/api/settings', 'PUT', { leadDays: { annual: [45, 10, 3, 3, 'x'] }, remindHour: 7 });
  const { body: s } = await call('/api/state');
  assert.deepEqual(s.user.leadDays.annual, [45, 10, 3]);
  assert.equal(s.user.remindHour, 7);
  const ics = await fetch(s.user.calendarUrl.replace(/^https?:\/\/[^/]+/, base));
  assert.equal(ics.status, 200);
  assert.match(await ics.text(), /BEGIN:VCALENDAR/);
  assert.equal((await fetch(base + '/cal/nope.ics')).status, 404);
});

test('test digest goes to the dev outbox', async () => {
  const r = await call('/api/reminders/test', 'POST', {});
  assert.equal(r.status, 200);
  assert.ok(typeof r.body.sent === 'boolean');
});

test('push topic validation and new-user flag', async () => {
  assert.equal((await call('/api/settings', 'PUT', { ntfyTopic: 'no spaces!' })).status, 400);
  assert.equal((await call('/api/settings', 'PUT', { ntfyTopic: 'my-private-topic-123' })).status, 200);
  assert.equal((await call('/api/state')).body.user.ntfyTopic, 'my-private-topic-123');
  assert.equal((await call('/api/settings', 'PUT', { ntfyTopic: '' })).status, 200);
  assert.equal((await call('/api/state')).body.user.ntfyTopic, '');
  // second user has no entries or credit settings yet -> isNew
  const saved = cookie; cookie = '';
  await call('/api/auth/signup', 'POST', { email: 'new@b.co', password: 'another long password' });
  assert.equal((await call('/api/state')).body.isNew, true);
  cookie = saved;
  assert.equal((await call('/api/state')).body.isNew, false);
});
