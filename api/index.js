// Production entry point on Vercel. Every request is routed here by vercel.json.
import { createClient } from '@libsql/client/web';
import { waitUntil } from '@vercel/functions';
import { wrapClient } from '../db.js';
import { createApp, loadConfig } from '../server.js';

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
export default createApp({ config: loadConfig(), db: wrapClient(client), defer: waitUntil });
