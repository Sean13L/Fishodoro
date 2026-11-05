import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last INTEGER NOT NULL DEFAULT 0,
  prefs TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS focus (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  rarity TEXT NOT NULL,
  size TEXT NOT NULL,
  weight INTEGER NOT NULL,
  caught_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catches_user ON catches(user_id, id);
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attempts (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_key ON attempts(key, at);
`;

const WEEK = 7 * 864e5;

// All SQL runs through parameterized statements from here, which keeps a driver swap small.
export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const raw = new DatabaseSync(file);
  if (file !== ':memory:') fs.chmodSync(file, 0o600);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
  raw.exec(SCHEMA);

  const cache = new Map();
  const q = (sql) => cache.get(sql) ?? cache.set(sql, raw.prepare(sql)).get(sql);

  return {
    get: (sql, ...args) => q(sql).get(...args),
    all: (sql, ...args) => q(sql).all(...args),
    run: (sql, ...args) => q(sql).run(...args),
    tx(fn) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    // Removes data we no longer need, as the Privacy Policy promises.
    purge(now) {
      q('DELETE FROM sessions WHERE expires_at < ?').run(now);
      q('DELETE FROM tokens WHERE expires_at < ?').run(now);
      q('DELETE FROM attempts WHERE at < ?').run(now - 864e5);
      q('DELETE FROM focus WHERE started_at + minutes * 60000 + 864e5 < ?').run(now);
      q('DELETE FROM users WHERE verified = 0 AND created_at < ?').run(now - WEEK);
    },
    close: () => raw.close(),
  };
}
