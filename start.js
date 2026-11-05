// Local development server. Production runs from api/index.js on Vercel.
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { createClient } from '@libsql/client';
import { wrapClient } from './db.js';
import { createApp, loadConfig } from './server.js';

const config = loadConfig();
const dbFile = new URL(process.env.DB_FILE || './data/fishodoro.db', import.meta.url);
mkdirSync(new URL('.', dbFile), { recursive: true, mode: 0o700 });

const db = wrapClient(createClient({ url: dbFile.href }));
await db.migrate();
await db.purge(Date.now());
setInterval(() => db.purge(Date.now()), 3_600_000).unref();

const server = http.createServer(createApp({ config, db }));
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
const port = Number(process.env.PORT) || 3000;
server.listen(port, '127.0.0.1', () => console.log(`Fishodoro is running at http://localhost:${port}`));
