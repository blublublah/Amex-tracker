import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH || path.join(dataDir, 'tracker.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'America/New_York',
  remind_hour INTEGER NOT NULL DEFAULT 9,
  email_reminders INTEGER NOT NULL DEFAULT 1,
  lead_days TEXT,
  cal_token TEXT NOT NULL,
  last_digest_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_credits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_id TEXT NOT NULL,
  tracked INTEGER NOT NULL DEFAULT 1,
  enrolled INTEGER NOT NULL DEFAULT 0,
  remind INTEGER NOT NULL DEFAULT 1,
  airline TEXT,
  PRIMARY KEY (user_id, credit_id)
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  ext_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS entries_lookup ON entries(user_id, credit_id, period_key);
CREATE UNIQUE INDEX IF NOT EXISTS entries_ext ON entries(user_id, ext_id) WHERE ext_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  date TEXT,
  amount REAL NOT NULL,
  confidence TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence TEXT,
  ext_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, ext_id)
);
CREATE TABLE IF NOT EXISTS reminders_sent (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  lead INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, credit_id, period_key, lead)
);
CREATE TABLE IF NOT EXISTS gmail_links (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT,
  refresh_token_enc TEXT NOT NULL,
  last_scan_at TEXT,
  last_error TEXT,
  auto_apply_spend INTEGER NOT NULL DEFAULT 0
);
`);

export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

// Lightweight migrations for columns added after first release.
for (const sql of ['ALTER TABLE users ADD COLUMN ntfy_topic TEXT', 'ALTER TABLE user_credits ADD COLUMN snooze_until TEXT']) {
  try { db.exec(sql); } catch { /* column already exists */ }
}
