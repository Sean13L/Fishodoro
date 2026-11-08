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
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS focus (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  minutes INTEGER NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  round INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  species TEXT NOT NULL,
  rarity TEXT NOT NULL,
  size TEXT NOT NULL,
  weight INTEGER NOT NULL,
  caught_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catches_user ON catches(user_id, id);
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS attempts (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_key ON attempts(key, at);
CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0)
);
CREATE TABLE IF NOT EXISTS unlocks (
  user_id INTEGER NOT NULL REFERENCES users(id),
  item TEXT NOT NULL,
  bought_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item)
);
`;

const WEEK = 7 * 864e5;
const USER_TABLES = ['focus', 'rounds', 'catches', 'tokens', 'recovery', 'sessions', 'wallets', 'unlocks'];

const plain = ({ columns, rows }) => rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));

// Wraps a libSQL client: Turso over HTTP on Vercel, a local file in development.
// All SQL runs through parameterized statements from here.
export function wrapClient(client) {
  const batch = (statements) => client.batch(statements.map(([sql, ...args]) => ({ sql, args })), 'write');
  return {
    get: async (sql, ...args) => plain(await client.execute({ sql, args }))[0],
    all: async (sql, ...args) => plain(await client.execute({ sql, args })),
    run: (sql, ...args) => client.execute({ sql, args }),
    // Runs every statement in one transaction, in a single round trip.
    batch,
    migrate: () => client.batch(SCHEMA.split(';').map((sql) => sql.trim()).filter(Boolean), 'write'),
    // Deleted child-first and by name, so removal never depends on foreign key settings.
    deleteUser: (id, ...extra) => batch([...USER_TABLES.map((table) => [`DELETE FROM ${table} WHERE user_id = ?`, id]), ['DELETE FROM users WHERE id = ?', id], ...extra]),
    // Removes data we no longer need, as the Privacy Policy promises.
    purge(now) {
      const stale = 'SELECT id FROM users WHERE verified = 0 AND created_at < ?';
      return batch([
        ['DELETE FROM sessions WHERE expires_at < ?', now],
        ['DELETE FROM tokens WHERE expires_at < ?', now],
        ['DELETE FROM attempts WHERE at < ?', now - 864e5],
        ['DELETE FROM focus WHERE started_at + minutes * 60000 + 864e5 < ?', now],
        ['DELETE FROM rounds WHERE at < ?', now - 864e5],
        ...USER_TABLES.map((table) => [`DELETE FROM ${table} WHERE user_id IN (${stale})`, now - WEEK]),
        ['DELETE FROM users WHERE verified = 0 AND created_at < ?', now - WEEK],
      ]);
    },
    close: () => client.close(),
  };
}
