import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Encryption key for Gmail refresh tokens: SECRET_KEY env, else a generated key persisted in the data dir.
function loadKey() {
  const raw = process.env.SECRET_KEY;
  if (raw) return crypto.createHash('sha256').update(raw).digest();
  const dir = process.env.DATA_DIR || path.resolve('data');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8')).digest();
}
const KEY = loadKey();

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${h.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

export const signState = (userId) => {
  const body = `${userId}.${Date.now()}`;
  return `${body}.${crypto.createHmac('sha256', KEY).update(body).digest('base64url')}`;
};

export function verifyState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const sig = crypto.createHmac('sha256', KEY).update(body).digest('base64url');
  if (sig.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[2]))) return null;
  if (Date.now() - Number(parts[1]) > 10 * 60 * 1000) return null;
  return Number(parts[0]);
}
