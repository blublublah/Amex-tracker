// Browser end-to-end check: signup -> mark a credit used -> import CSV -> send test digest -> read outbox.
// Usage: npm i -D playwright (or use a global install), then `node scripts/e2e.mjs`
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amex-e2e-'));
const port = 3199;
const srv = spawn('node', ['src/server.js'], { env: { ...process.env, DATA_DIR: dir, PORT: String(port), BASE_URL: `http://localhost:${port}` }, stdio: 'ignore' });
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
const b = await chromium.launch();
try {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('response', (r) => { if (process.env.DEBUG && r.url().includes('/api/auth')) console.log('RESP', r.status(), r.url()); });
  p.on('console', (m) => { if (process.env.DEBUG) console.log('CONSOLE', m.text()); });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/`);
  await p.click('[data-act=mode][data-m=signup]');
  await p.fill('#a-email', 'e2e@example.com');
  await p.fill('#a-pw', 'a long e2e password');
  await p.click('button[type=submit]');
  await p.waitForSelector('.hero');
  await p.click('label.check:has(input[data-act=toggle]) >> nth=0');
  await p.waitForSelector('.card.done');
  fs.writeFileSync(path.join(dir, 'a.csv'), 'Date,Description,Amount\n10/05/2026,DIGITAL ENTERTAINMENT CREDIT,-25.00\n');
  await p.goto(`http://localhost:${port}/#connect`);
  await p.setInputFiles('#csvfile', path.join(dir, 'a.csv'));
  await p.click('[data-act=importcsv]');
  await p.waitForSelector('.msg');
  const tok = fs.readFileSync(path.join(dir, 'outbox.log'), 'utf8').match(/#verify=([\w-]+)/)[1];
  // open the emailed link the way a user would: in a fresh tab
  const p2 = await ctx.newPage();
  await p2.goto(`http://localhost:${port}/#verify=${tok}`);
  await p2.waitForSelector('text=Email confirmed');
  await p2.close();
  await p.goto(`http://localhost:${port}/#settings`);
  await p.click('[data-act=testmail]');
  await p.waitForSelector('text=Test digest sent');
  const outbox = fs.readFileSync(path.join(dir, 'outbox.log'), 'utf8');
  assert.match(outbox, /Platinum credit/);
  assert.deepEqual(errors, []);
  console.log('e2e ok');
} finally {
  await b.close();
  srv.kill();
}
