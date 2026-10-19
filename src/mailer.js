import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const mailEnabled = () => !!transport;

/** Sends via SMTP, or (no SMTP configured) appends to data/outbox.log so dev/testing works. */
export async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || 'Platinum Credit Tracker <no-reply@localhost>';
  if (!transport) {
    const dir = process.env.DATA_DIR || path.resolve('data');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'outbox.log'), `\n=== ${new Date().toISOString()} → ${to}\nSubject: ${subject}\n${text}\n`);
    console.log(`[mail:dev] to=${to} subject="${subject}" (set SMTP_HOST to send for real)`);
    return { dev: true };
  }
  return transport.sendMail({ from, to, subject, text, html });
}
