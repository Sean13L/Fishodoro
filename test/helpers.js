// Runs the app on the same libSQL client code as production, against a throwaway file.
// Tests inspect that file directly and synchronously through node:sqlite.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { wrapClient } from '../db.js';

export async function openTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishodoro-test-'));
  const file = path.join(dir, 'test.db');
  const client = createClient({ url: `file:${file}` });
  // Off here, because deletion must not depend on foreign keys being enforced by the host.
  await client.execute('PRAGMA foreign_keys = OFF');
  const app = wrapClient(client);
  await app.migrate();
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA busy_timeout = 5000');
  return {
    app,
    get: (sql, ...args) => raw.prepare(sql).get(...args),
    all: (sql, ...args) => raw.prepare(sql).all(...args),
    run: (sql, ...args) => raw.prepare(sql).run(...args),
    close() { raw.close(); app.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
