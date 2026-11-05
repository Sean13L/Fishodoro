import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { guaranteedRarity, rarityOdds, RARITIES, rollFish, SIZES } from '../public/fish.js';
import { CATALOG, fishPrice, RARITY_VALUE, SIZE_MULTIPLIER } from '../public/market.js';
import { DEFAULT_PREFS, FOCUS_MINUTES } from '../public/options.js';
import { hasSprite } from '../public/sprites.js';
import { passwordProblem } from '../public/password.js';
import { createApp, httpMailer, loadConfig, totpCode } from '../server.js';
import { openTestDb } from './helpers.js';

const PASSWORD = 'gentle-river-otter-42';
let server, base, db, clock, mails, pending;

const config = loadConfig({ APP_URL: 'http://localhost:3000' });

async function call(pathname, { body, cookie, origin = config.origin, method = body === undefined ? 'GET' : 'POST', headers = {}, raw } = {}) {
  const res = await fetch(base + pathname, {
    method,
    redirect: 'manual',
    headers: { ...(method === 'GET' ? {} : { 'content-type': 'application/json', ...(origin ? { origin } : {}) }), ...(cookie ? { cookie } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  await Promise.all(pending);
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, res };
}

const signupBody = (email, extra = {}) => ({ email, password: PASSWORD, birthYear: 1990, birthMonth: 5, consent: true, ...extra });
const tokenFrom = (mail, kind) => mail.text.match(new RegExp(`#${kind}=([\\w-]+)`))[1];

async function makeUser(email = 'angler@example.com') {
  assert.equal((await call('/api/signup', { body: signupBody(email) })).status, 200);
  const token = tokenFrom(mails.at(-1), 'verify');
  assert.equal((await call('/api/verify', { body: { token, password: PASSWORD } })).status, 200);
  return login(email);
}
async function login(email, password = PASSWORD, code) {
  const r = await call('/api/login', { body: { email, password, code } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  clock = { now: Date.UTC(2026, 10, 4, 12) };
  db = await openTestDb();
  mails = [];
  pending = [];
  server = http.createServer(createApp({ config, db: db.app, now: () => clock.now, mail: async (m) => { mails.push(m); }, defer: (work) => pending.push(work) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });
beforeEach(() => {
  for (const table of ['focus', 'catches', 'tokens', 'recovery', 'sessions', 'wallets', 'unlocks', 'users', 'attempts']) db.run(`DELETE FROM ${table}`);
  mails.length = 0;
});

test('signup requires consent, age and a strong password, and stores no birth date', async () => {
  assert.equal((await call('/api/signup', { body: signupBody('a@example.com', { consent: false }) })).status, 400);
  const young = await call('/api/signup', { body: signupBody('a@example.com', { birthYear: 2015 }) });
  assert.equal(young.status, 403);
  assert.equal(young.data.underAge, true);
  assert.equal((await call('/api/signup', { body: signupBody('a@example.com', { password: 'short' }) })).status, 400);
  assert.equal((await call('/api/signup', { body: signupBody('a@example.com', { password: 'password1234' }) })).status, 400);
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 0);
  assert.equal((await call('/api/signup', { body: signupBody('a@example.com') })).status, 200);
  const row = db.get('SELECT * FROM users');
  assert.ok(!Object.keys(row).some((k) => k.includes('birth')));
  assert.match(row.pw_hash, /^argon2id\$/);
  assert.equal(row.consent_version, '2026-11-04');
  assert.ok(!JSON.stringify(row).includes(PASSWORD));
});

test('age boundary: someone exactly 16 this month is not yet allowed; a month older is', async () => {
  assert.equal((await call('/api/signup', { body: signupBody('b@example.com', { birthYear: 2010, birthMonth: 11 }) })).status, 403);
  assert.equal((await call('/api/signup', { body: signupBody('b@example.com', { birthYear: 2010, birthMonth: 10 }) })).status, 200);
});

test('signup does not reveal whether an email already has an account', async () => {
  const first = await call('/api/signup', { body: signupBody('dup@example.com') });
  const second = await call('/api/signup', { body: signupBody('dup@example.com') });
  assert.deepEqual(first.data, second.data);
  assert.equal(first.status, second.status);
  assert.match(mails.at(-1).subject, /already have/);
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 1);
});

test('emails explain that there is no marketing list and link to deletion', async () => {
  await call('/api/signup', { body: signupBody('mail@example.com') });
  assert.match(mails[0].text, /nothing to unsubscribe/);
  assert.match(mails[0].text, /#account/);
});

test('login needs a verified email and a correct password, with a uniform error', async () => {
  await call('/api/signup', { body: signupBody('v@example.com') });
  assert.equal((await call('/api/login', { body: { email: 'v@example.com', password: PASSWORD } })).status, 403);
  await call('/api/verify', { body: { token: tokenFrom(mails.at(-1), 'verify'), password: PASSWORD } });
  const wrong = await call('/api/login', { body: { email: 'v@example.com', password: 'wrong-password-here' } });
  const unknown = await call('/api/login', { body: { email: 'nobody@example.com', password: 'wrong-password-here' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.data, unknown.data);
  assert.equal(unknown.status, 401);
});

test('verify tokens are single-use and expire', async () => {
  await call('/api/signup', { body: signupBody('t@example.com') });
  const token = tokenFrom(mails.at(-1), 'verify');
  clock.now += 31 * 60_000;
  assert.equal((await call('/api/verify', { body: { token, password: PASSWORD } })).status, 400);
  clock.now -= 31 * 60_000;
  await call('/api/login', { body: { email: 't@example.com', password: PASSWORD } });
  const fresh = tokenFrom(mails.at(-1), 'verify');
  assert.equal((await call('/api/verify', { body: { token: fresh, password: PASSWORD } })).status, 200);
  assert.equal((await call('/api/verify', { body: { token: fresh, password: PASSWORD } })).status, 400);
});

test('a verify link cannot activate an account without its password, which blocks pre-hijacking', async () => {
  await call('/api/signup', { body: signupBody('victim@example.com') }); // Signed up by an attacker.
  const token = tokenFrom(mails.at(-1), 'verify');
  assert.equal((await call('/api/verify', { body: { token } })).status, 401);
  assert.equal((await call('/api/verify', { body: { token, password: 'the-victims-own-guess' } })).status, 401);
  assert.equal(db.get('SELECT verified FROM users').verified, 0);
  // The real owner takes over with a reset, which replaces the attacker's password.
  await call('/api/forgot', { body: { email: 'victim@example.com' } });
  const next = 'the-real-owner-passphrase';
  assert.equal((await call('/api/reset', { body: { token: tokenFrom(mails.at(-1), 'reset'), password: next } })).status, 200);
  assert.equal((await call('/api/login', { body: { email: 'victim@example.com', password: PASSWORD } })).status, 401);
  await login('victim@example.com', next);
});

test('the session cookie is HttpOnly and SameSite=Strict, and the token is stored hashed', async () => {
  await call('/api/signup', { body: signupBody('c@example.com') });
  await call('/api/verify', { body: { token: tokenFrom(mails.at(-1), 'verify'), password: PASSWORD } });
  const r = await call('/api/login', { body: { email: 'c@example.com', password: PASSWORD } });
  const header = r.res.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  const token = header.split(';')[0].split('=')[1];
  assert.ok(!r.data.token && !JSON.stringify(r.data).includes(token));
  assert.ok(!db.all('SELECT token_hash FROM sessions').some((s) => s.token_hash === token));
});

test('a production cookie uses __Host- and Secure', () => {
  const prod = loadConfig({ NODE_ENV: 'production', APP_URL: 'https://fish.example', APP_SECRET: 'x'.repeat(40), OPERATOR_NAME: 'n', OPERATOR_ADDRESS: 'a', OPERATOR_EMAIL: 'e@e.co', GOVERNING_LAW: 'l', DATA_LOCATION: 'd', TURSO_DATABASE_URL: 'libsql://x', TURSO_AUTH_TOKEN: 't', CRON_SECRET: 'c', MAIL_API_KEY: 'k', MAIL_FROM: 'f@e.co' });
  assert.equal(prod.secure, true);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /Missing required settings/);
  assert.equal(prod.minuteMs, 60_000);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'http://fish.example', APP_SECRET: 'x'.repeat(40), OPERATOR_NAME: 'n', OPERATOR_ADDRESS: 'a', OPERATOR_EMAIL: 'e', GOVERNING_LAW: 'l', DATA_LOCATION: 'd', TURSO_DATABASE_URL: 'libsql://x', TURSO_AUTH_TOKEN: 't', CRON_SECRET: 'c', MAIL_API_KEY: 'k', MAIL_FROM: 'f' }), /https/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'https://x.example', APP_SECRET: 'short', OPERATOR_NAME: 'n', OPERATOR_ADDRESS: 'a', OPERATOR_EMAIL: 'e', GOVERNING_LAW: 'l', DATA_LOCATION: 'd', TURSO_DATABASE_URL: 'libsql://x', TURSO_AUTH_TOKEN: 't', CRON_SECRET: 'c', MAIL_API_KEY: 'k', MAIL_FROM: 'f' }), /APP_SECRET/);
});

test('development fallbacks can never run on a reachable address, even if NODE_ENV is forgotten', () => {
  assert.throws(() => loadConfig({ APP_URL: 'https://fish.example' }), /Missing required settings/);
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /Missing required settings/);
  assert.throws(() => loadConfig({ VERCEL: '1' }), /Missing required settings/);
  assert.equal(loadConfig({ HOST: '127.0.0.1' }).production, false);
  assert.equal(loadConfig({ APP_URL: 'http://localhost:4173' }).production, false);
});

test('the fast test timer works locally and can never reach a real deployment', () => {
  assert.equal(loadConfig({}).minuteMs, 60_000);
  assert.equal(loadConfig({ FAST_TEST_TIMER: '0' }).minuteMs, 60_000);
  assert.equal(loadConfig({ FAST_TEST_TIMER: '1' }).minuteMs, 1000);
  assert.throws(() => loadConfig({ FAST_TEST_TIMER: '1', APP_URL: 'https://fish.example' }), /local testing only/);
  assert.throws(() => loadConfig({ FAST_TEST_TIMER: '1', NODE_ENV: 'production', APP_URL: 'https://fish.example', APP_SECRET: 'x'.repeat(40), OPERATOR_NAME: 'n', OPERATOR_ADDRESS: 'a', OPERATOR_EMAIL: 'e', GOVERNING_LAW: 'l', DATA_LOCATION: 'd', TURSO_DATABASE_URL: 'libsql://x', TURSO_AUTH_TOKEN: 't', CRON_SECRET: 'c', MAIL_API_KEY: 'k', MAIL_FROM: 'f' }), /local testing only/);
});

test('emails go out in the format the provider expects, and failures surface', async () => {
  const seen = [];
  let status = 200;
  const provider = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { seen.push({ method: req.method, headers: req.headers, body: JSON.parse(raw) }); res.writeHead(status); res.end('{}'); });
  });
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  const send = httpMailer({ mail: { url: `http://127.0.0.1:${provider.address().port}/emails`, key: 'brevo_test', from: 's@fish.example' } });
  await send({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['api-key'], 'brevo_test');
  assert.equal(seen[0].headers['user-agent'], 'Fishodoro/1.0');
  assert.equal(seen[0].headers['content-type'], 'application/json');
  assert.deepEqual(seen[0].body, { sender: { name: 'Fishodoro', email: 's@fish.example' }, to: [{ email: 'a@example.com' }], subject: 'Hi', textContent: 'Body' });
  status = 403;
  await assert.rejects(send({ to: 'a@example.com', subject: 'Hi', text: 'Body' }), /403/);
  provider.close();
});

test('the daily purge route only answers Vercel Cron\'s secret', async () => {
  assert.equal((await call('/api/cron/purge')).status, 404, 'no secret configured here');
  const cfg = loadConfig({ APP_URL: 'http://localhost:3000', CRON_SECRET: 'cron-secret-value' });
  const tempDb = await openTestDb();
  const app = http.createServer(createApp({ config: cfg, db: tempDb.app, mail: async () => {} }));
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  app.unref(); // A failed assertion must not leave the test run hanging.
  const at = `http://127.0.0.1:${app.address().port}/api/cron/purge`;
  assert.equal((await fetch(at)).status, 404);
  assert.equal((await fetch(at, { headers: { authorization: 'Bearer wrong' } })).status, 404);
  assert.equal((await fetch(at, { headers: { authorization: 'Bearer cron-secret-value' } })).status, 200);
  app.close();
  tempDb.close();
});

test('Vercel settings route everything through the app and keep secrets out of uploads', () => {
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.routes, [{ src: '/(.*)', dest: '/api/index.js' }], 'static files must not bypass the security headers');
  assert.deepEqual(vercel.regions, ['iad1'], 'next to the database');
  assert.equal(vercel.framework, null, "otherwise Vercel runs server.js directly and the site returns 500");
  assert.equal(vercel.functions['api/index.js'].includeFiles, 'public/**');
  const ignore = fs.readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8').split('\n');
  for (const rule of ['.env', '.env.*', 'data/']) assert.ok(ignore.includes(rule), rule);
});

test('private routes reject anonymous requests', async () => {
  for (const [pathname, body] of [['/api/catches'], ['/api/export'], ['/api/focus/active'], ['/api/focus/start', { minutes: 25 }], ['/api/focus/complete', {}], ['/api/focus/cancel', {}], ['/api/prefs', {}], ['/api/logout', {}], ['/api/password', {}], ['/api/2fa/setup', {}], ['/api/2fa/enable', {}], ['/api/2fa/disable', {}], ['/api/account/delete', {}]]) {
    assert.equal((await call(pathname, { body })).status, 401, pathname);
  }
  assert.equal((await call('/api/nope')).status, 404);
  assert.equal((await call('/api/constructor')).status, 404);
  assert.equal((await call('/api/me', { method: 'DELETE', body: {} })).status, 404);
});

test('writes need the right origin and JSON content type', async () => {
  const cookie = await makeUser();
  assert.equal((await call('/api/focus/start', { body: { minutes: 25 }, cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/focus/start', { body: { minutes: 25 }, cookie, origin: null })).status, 403);
  assert.equal((await call('/api/focus/start', { raw: 'x', method: 'POST', cookie, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call('/api/focus/start', { raw: '{bad', method: 'POST', cookie })).status, 400);
  assert.equal((await call('/api/focus/start', { raw: '[1]', method: 'POST', cookie })).status, 400);
  assert.equal(db.get('SELECT COUNT(*) n FROM focus').n, 0);
});

test('oversized request bodies are rejected', async () => {
  const r = await call('/api/login', { raw: JSON.stringify({ email: 'x'.repeat(40_000) }), method: 'POST' });
  assert.equal(r.status, 413);
  assert.match(r.data.error, /too large/);
});

test('login is rate limited per account, even with the right password afterwards', async () => {
  await makeUser('limit@example.com');
  for (let i = 0; i < 10; i++) assert.equal((await call('/api/login', { body: { email: 'limit@example.com', password: 'wrong-password-here' } })).status, 401);
  const blocked = await call('/api/login', { body: { email: 'limit@example.com', password: PASSWORD } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.res.headers.get('retry-after')) > 0);
  clock.now += 16 * 60_000;
  await login('limit@example.com');
  clock.now -= 16 * 60_000;
});

test('parallel requests cannot slip past the rate limit', async () => {
  await makeUser('burst@example.com');
  const results = await Promise.all(Array.from({ length: 25 }, () => call('/api/login', { body: { email: 'burst@example.com', password: 'wrong-password-here' } })));
  assert.equal(results.filter((r) => r.status === 401).length, 10);
  assert.equal(results.filter((r) => r.status === 429).length, 15);
});

test('login is rate limited per IP across different accounts', async () => {
  for (let i = 0; i < 30; i++) await call('/api/login', { body: { email: `u${i}@example.com`, password: 'wrong-password-here' } });
  assert.equal((await call('/api/login', { body: { email: 'other@example.com', password: 'wrong-password-here' } })).status, 429);
  assert.ok(!db.all('SELECT key FROM attempts').some((a) => a.key.includes('example.com') || a.key.includes('127.0.0.1')));
  db.run('DELETE FROM attempts');
});

test('signup and forgot are rate limited', async () => {
  for (let i = 0; i < 10; i++) await call('/api/signup', { body: signupBody(`s${i}@example.com`) });
  assert.equal((await call('/api/signup', { body: signupBody('s99@example.com') })).status, 429);
  await makeUserAfterClear();
  for (let i = 0; i < 3; i++) assert.equal((await call('/api/forgot', { body: { email: 'f@example.com' } })).status, 200);
  assert.equal((await call('/api/forgot', { body: { email: 'f@example.com' } })).status, 429);
});
async function makeUserAfterClear() { db.run('DELETE FROM attempts'); return makeUser('f@example.com'); }

test('nobody can flood an inbox through signup or login retries', async () => {
  for (let i = 0; i < 8; i++) {
    const r = await call('/api/signup', { body: signupBody('target@example.com') });
    assert.equal(r.status, 200, 'the response stays the same');
  }
  assert.equal(mails.length, 3);
  db.run('DELETE FROM attempts WHERE key != ?', 'none');
  mails.length = 0;
  await call('/api/signup', { body: signupBody('pending@example.com') });
  for (let i = 0; i < 9; i++) assert.equal((await call('/api/login', { body: { email: 'pending@example.com', password: PASSWORD } })).status, 403);
  assert.equal(mails.length, 3);
});

test('odd query values and body types are handled safely', async () => {
  const cookie = await makeUser();
  for (const before of ['Infinity', '1e999', '-1', 'abc', '0', "1;DROP TABLE users"]) assert.equal((await call(`/api/catches?before=${encodeURIComponent(before)}`, { cookie })).status, 200, before);
  for (const body of [{ email: {} , password: 'x' }, { email: ['a@b.co'], password: 'x' }, { email: 'a@b.co', password: {} }, { email: 'a@b.co', password: 'x'.repeat(5000) }]) {
    assert.ok([400, 401].includes((await call('/api/login', { body })).status));
  }
  assert.equal((await call('/api/signup', { body: { email: 'q@example.com', password: PASSWORD, birthYear: '1990', birthMonth: 5, consent: true } })).status, 400);
  assert.equal((await call('/api/signup', { body: { email: 'q@example.com', password: PASSWORD, birthYear: 1990, birthMonth: 13, consent: true } })).status, 400);
  assert.equal((await call('/api/signup', { body: { email: 'q@example.com', password: PASSWORD, birthYear: 1990, birthMonth: 5, consent: 'true' } })).status, 400);
  assert.equal((await call('/api/signup', { body: { email: 'q@example.com', password: PASSWORD, birthYear: 3000, birthMonth: 5, consent: true } })).status, 403);
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 1);
  assert.equal((await call('/api/me', { cookie: 'sid=not-a-real-token' })).data.user, null);
  assert.equal((await call('/api/2fa/enable', { body: { code: { a: 1 } }, cookie })).status, 409);
});

test('forgot does not reveal accounts; reset works once and ends every session', async () => {
  const cookie = await makeUser('r@example.com');
  const known = await call('/api/forgot', { body: { email: 'r@example.com' } });
  const unknown = await call('/api/forgot', { body: { email: 'nobody@example.com' } });
  assert.deepEqual(known.data, unknown.data);
  const token = tokenFrom(mails.at(-1), 'reset');
  assert.equal((await call('/api/reset', { body: { token, password: 'short' } })).status, 400);
  const next = 'another-calm-lake-77';
  assert.equal((await call('/api/reset', { body: { token, password: next } })).status, 200);
  assert.equal((await call('/api/reset', { body: { token, password: 'yet-another-pass-88' } })).status, 400);
  assert.equal((await call('/api/catches', { cookie })).status, 401);
  await login('r@example.com', next);
});

test('changing a password keeps this session and ends the others', async () => {
  const one = await makeUser('p@example.com');
  const two = await login('p@example.com');
  const next = 'quiet-harbor-swan-55';
  assert.equal((await call('/api/password', { body: { current: 'wrong', next }, cookie: one })).status, 401);
  assert.equal((await call('/api/password', { body: { current: PASSWORD, next: 'short' }, cookie: one })).status, 400);
  const changed = await call('/api/password', { body: { current: PASSWORD, next }, cookie: one });
  assert.equal(changed.status, 200);
  const fresh = changed.res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/catches', { cookie: fresh })).status, 200);
  assert.equal((await call('/api/catches', { cookie: one })).status, 401, 'the old token dies, in case it was stolen');
  assert.equal((await call('/api/catches', { cookie: two })).status, 401);
});

test('a login in flight cannot outlive a password change', async () => {
  const email = 'inflight@example.com';
  await makeUser(email);
  // Changes the password in the gap between the login's credential check and its session insert.
  const racing = { ...db.app, run: async (sql, ...args) => {
    if (sql.startsWith('INSERT INTO sessions')) db.run('UPDATE users SET pw_hash = ? WHERE email = ?', 'argon2id$changed', email);
    return db.app.run(sql, ...args);
  } };
  const app = http.createServer(createApp({ config, db: racing, now: () => clock.now, mail: async () => {} }));
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  app.unref();
  const before = db.get('SELECT COUNT(*) n FROM sessions').n;
  const res = await fetch(`http://127.0.0.1:${app.address().port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: config.origin }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(db.get('SELECT COUNT(*) n FROM sessions').n, before);
  app.close();
});

test('a password change discards an unfinished 2FA setup', async () => {
  const cookie = await makeUser('pending@example.com');
  await call('/api/2fa/setup', { body: { password: PASSWORD }, cookie });
  assert.ok(db.get('SELECT totp_secret FROM users').totp_secret);
  await call('/api/password', { body: { current: PASSWORD, next: 'quiet-harbor-swan-55' }, cookie });
  assert.equal(db.get('SELECT totp_secret FROM users').totp_secret, null);
});

test('logout ends the session on the server', async () => {
  const cookie = await makeUser('l@example.com');
  assert.equal((await call('/api/logout', { body: {}, cookie })).status, 200);
  assert.equal((await call('/api/catches', { cookie })).status, 401);
  assert.equal((await call('/api/me', { cookie })).data.user, null);
});

test('focus: rejects bad lengths, early claims and double claims', async () => {
  const cookie = await makeUser();
  for (const minutes of [0, 4, 181, 25.5, '25', -5, 1e9, null]) assert.equal((await call('/api/focus/start', { body: { minutes }, cookie })).status, 400);
  const start = await call('/api/focus/start', { body: { minutes: 25 }, cookie });
  assert.equal(start.data.active.remainingMs, 25 * 60_000);
  const again = await call('/api/focus/start', { body: { minutes: 60 }, cookie });
  assert.equal(again.data.active.minutes, 25);
  clock.now += 24 * 60_000;
  const early = await call('/api/focus/complete', { body: {}, cookie });
  assert.equal(early.status, 409);
  assert.equal(early.data.retryAfterMs, 60_000);
  assert.equal(db.get('SELECT COUNT(*) n FROM catches').n, 0);
  clock.now += 60_000;
  const first = await call('/api/focus/complete', { body: {}, cookie });
  assert.equal(first.status, 200);
  assert.ok(first.data.fish.species);
  assert.equal((await call('/api/focus/complete', { body: {}, cookie })).status, 404);
  assert.equal(db.get('SELECT COUNT(*) n FROM catches').n, 1);
});

test('focus: parallel claims only ever produce one fish', async () => {
  const cookie = await makeUser();
  await call('/api/focus/start', { body: { minutes: 15 }, cookie });
  clock.now += 15 * 60_000;
  const results = await Promise.all(Array.from({ length: 8 }, () => call('/api/focus/complete', { body: {}, cookie })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(db.get('SELECT COUNT(*) n FROM catches').n, 1);
});

test('focus: the client cannot choose its fish', async () => {
  const cookie = await makeUser();
  await call('/api/focus/start', { body: { minutes: 15 }, cookie });
  clock.now += 15 * 60_000;
  await call('/api/focus/complete', { body: { rarity: 'cosmic', species: 'koi', size: 'huge', weight: 99999 }, cookie });
  assert.notEqual(db.get('SELECT weight FROM catches').weight, 99999);
});

test('focus: a finished session stays claimable for a day, then expires; cancel gives no fish', async () => {
  const cookie = await makeUser();
  await call('/api/focus/start', { body: { minutes: 15 }, cookie });
  clock.now += 15 * 60_000 + 23 * 3600_000;
  assert.equal((await call('/api/focus/active', { cookie })).data.active.remainingMs, 0);
  clock.now += 3600_000 + 1000;
  assert.equal((await call('/api/focus/active', { cookie })).data.active, null);
  assert.equal((await call('/api/focus/complete', { body: {}, cookie })).status, 404);
  await call('/api/focus/start', { body: { minutes: 15 }, cookie });
  await call('/api/focus/cancel', { body: {}, cookie });
  clock.now += 15 * 60_000;
  assert.equal((await call('/api/focus/complete', { body: {}, cookie })).status, 404);
});

test("one user can never see or claim another user's data", async () => {
  const alice = await makeUser('alice@example.com');
  const bob = await makeUser('bob@example.com');
  await call('/api/focus/start', { body: { minutes: 15 }, cookie: alice });
  clock.now += 15 * 60_000;
  assert.equal((await call('/api/focus/complete', { body: {}, cookie: bob })).status, 404);
  assert.equal((await call('/api/focus/complete', { body: {}, cookie: alice })).status, 200);
  const bobs = await call('/api/catches', { cookie: bob });
  assert.equal(bobs.data.catches.length, 0);
  const bobsExport = await call('/api/export', { cookie: bob });
  assert.equal(bobsExport.data.catches.length, 0);
  assert.equal(bobsExport.data.account.email, 'bob@example.com');
  assert.ok(!JSON.stringify(bobsExport.data).includes('pw_hash') && !JSON.stringify(bobsExport.data).includes('totp_secret'));
  assert.equal((await call('/api/catches?user_id=1', { cookie: bob })).data.catches.length, 0);
});

test('catches: validates input, resists SQL injection and pages results', async () => {
  const cookie = await makeUser();
  assert.equal((await call(`/api/catches?rarity=${encodeURIComponent("' OR 1=1 --")}`, { cookie })).status, 400);
  const { id } = db.get('SELECT id FROM users');
  for (let i = 0; i < 65; i++) db.run('INSERT INTO catches (user_id, species, rarity, size, weight, caught_at) VALUES (?, ?, ?, ?, ?, ?)', id, 'koi', 'gold', 'tiny', 5, 1);
  const page = await call('/api/catches?rarity=gold', { cookie });
  assert.equal(page.data.catches.length, 60);
  assert.equal(page.data.more, true);
  const rest = await call(`/api/catches?before=${page.data.catches.at(-1).id}`, { cookie });
  assert.equal(rest.data.catches.length, 5);
  assert.equal(rest.data.counts.gold, 65);
});

test('custom focus lengths work from 5 to 180 minutes, and the defaults are 15, 30, 45 and 60', async () => {
  assert.deepEqual(FOCUS_MINUTES, [15, 30, 45, 60]);
  assert.equal(DEFAULT_PREFS.focus, 30);
  const cookie = await makeUser('custom@example.com');
  for (const minutes of [5, 37, 180]) {
    const r = await call('/api/focus/start', { body: { minutes }, cookie });
    assert.equal(r.data.active.minutes, minutes);
    await call('/api/focus/cancel', { body: {}, cookie });
  }
  await call('/api/focus/start', { body: { minutes: 5 }, cookie });
  clock.now += 5 * 60_000 - 1;
  assert.equal((await call('/api/focus/complete', { body: {}, cookie })).status, 409);
  clock.now += 1;
  assert.equal((await call('/api/focus/complete', { body: {}, cookie })).status, 200);
  const saved = await call('/api/prefs', { body: { focus: 37, controlsOpen: false, footerOpen: 'no' }, cookie });
  assert.equal(saved.data.prefs.focus, 37);
  assert.equal(saved.data.prefs.controlsOpen, false);
  assert.equal(saved.data.prefs.footerOpen, true, 'a bad value falls back to the default');
  assert.equal((await call('/api/prefs', { body: { focus: 2 }, cookie })).data.prefs.focus, DEFAULT_PREFS.focus);
});

test('prefs keep only allowed keys and values', async () => {
  const cookie = await makeUser();
  const r = await call('/api/prefs', { body: { sky: 'cosmic', angler: 'frog', volume: 40, angler2: 'x', scene: '<script>', layout: 7, __proto__: { admin: true } }, cookie });
  assert.equal(r.data.prefs.sky, 'cosmic');
  assert.equal(r.data.prefs.angler, 'frog');
  assert.equal(r.data.prefs.scene, DEFAULT_PREFS.scene);
  assert.ok(!('angler2' in r.data.prefs) && !('admin' in r.data.prefs));
  assert.equal((await call('/api/me', { cookie })).data.user.prefs.sky, 'cosmic');
  assert.ok(!db.get('SELECT prefs FROM users').prefs.includes('script'));
});

test('2FA: setup, replay protection, recovery codes, and disabling', async () => {
  const cookie = await makeUser('2fa@example.com');
  assert.equal((await call('/api/2fa/setup', { body: { password: 'wrong' }, cookie })).status, 401);
  const setup = await call('/api/2fa/setup', { body: { password: PASSWORD }, cookie });
  assert.match(setup.data.qr, /^data:image\/gif/);
  const key = setup.data.key;
  assert.ok(!db.get('SELECT totp_secret FROM users').totp_secret.includes(key));
  const secret = fromBase32(key);
  const counter = () => Math.floor(clock.now / 30_000);
  assert.equal((await call('/api/2fa/enable', { body: { code: '000000' }, cookie })).status, 400);
  const enable = await call('/api/2fa/enable', { body: { code: totpCode(secret, counter()) }, cookie });
  assert.equal(enable.status, 200);
  const afterEnable = enable.res.headers.get('set-cookie').split(';')[0];
  assert.equal(enable.data.recoveryCodes.length, 8);
  assert.ok(!db.all('SELECT hash FROM recovery').some((r) => enable.data.recoveryCodes.includes(r.hash)));

  const body = { email: '2fa@example.com', password: PASSWORD };
  const need = await call('/api/login', { body });
  assert.equal(need.status, 401);
  assert.equal(need.data.need2fa, true);
  assert.equal(need.res.headers.get('set-cookie'), null);
  assert.equal((await call('/api/login', { body: { ...body, code: '000000' } })).status, 401);

  clock.now += 60_000;
  const code = totpCode(secret, counter());
  assert.equal((await call('/api/login', { body: { ...body, code } })).status, 200);
  assert.equal((await call('/api/login', { body: { ...body, code } })).status, 401, 'a code must not work twice');

  const recovery = enable.data.recoveryCodes[0];
  assert.equal((await call('/api/login', { body: { ...body, code: recovery } })).status, 200);
  assert.equal((await call('/api/login', { body: { ...body, code: recovery } })).status, 401, 'a recovery code must not work twice');

  assert.equal((await call('/api/2fa/disable', { body: { password: PASSWORD }, cookie: afterEnable })).status, 401);
  assert.equal((await call('/api/2fa/disable', { body: { password: PASSWORD, code: enable.data.recoveryCodes[1] }, cookie: afterEnable })).status, 200);
  assert.equal(db.get('SELECT COUNT(*) n FROM recovery').n, 0);
  assert.equal(db.get('SELECT totp_secret FROM users').totp_secret, null);
});

test('parallel logins can use one 2FA code only once', async () => {
  const cookie = await makeUser('race@example.com');
  const { data: { key } } = await call('/api/2fa/setup', { body: { password: PASSWORD }, cookie });
  const secret = fromBase32(key);
  await call('/api/2fa/enable', { body: { code: totpCode(secret, Math.floor(clock.now / 30_000)) }, cookie });
  clock.now += 60_000;
  const code = totpCode(secret, Math.floor(clock.now / 30_000));
  const results = await Promise.all(Array.from({ length: 5 }, () => call('/api/login', { body: { email: 'race@example.com', password: PASSWORD, code } })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test('turning on 2FA signs out every other device and gives this one a new token', async () => {
  const here = await makeUser('devices@example.com');
  const other = await login('devices@example.com');
  const { data: { key } } = await call('/api/2fa/setup', { body: { password: PASSWORD }, cookie: here });
  const enabled = await call('/api/2fa/enable', { body: { code: totpCode(fromBase32(key), Math.floor(clock.now / 30_000)) }, cookie: here });
  const fresh = enabled.res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/catches', { cookie: fresh })).status, 200);
  assert.equal((await call('/api/catches', { cookie: here })).status, 401, 'the old token dies, in case it was stolen');
  assert.equal((await call('/api/catches', { cookie: other })).status, 401);
  assert.equal((await call('/api/2fa/setup', { body: { password: PASSWORD }, cookie: fresh })).status, 409);
});

test('2FA codes are rate limited at login', async () => {
  const cookie = await makeUser('2fb@example.com');
  const { data: { key } } = await call('/api/2fa/setup', { body: { password: PASSWORD }, cookie });
  await call('/api/2fa/enable', { body: { code: totpCode(fromBase32(key), Math.floor(clock.now / 30_000)) }, cookie });
  let last;
  for (let i = 0; i < 11; i++) last = await call('/api/login', { body: { email: '2fb@example.com', password: PASSWORD, code: '000000' } });
  assert.equal(last.status, 429);
});

function fromBase32(text) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of text) bits += chars.indexOf(ch).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}

test('deleting an account removes every row and needs the password', async () => {
  const cookie = await makeUser('gone@example.com');
  await call('/api/focus/start', { body: { minutes: 15 }, cookie });
  clock.now += 15 * 60_000;
  await call('/api/focus/complete', { body: {}, cookie });
  await call('/api/focus/start', { body: { minutes: 15 }, cookie });
  db.run('INSERT INTO wallets (user_id, coins) SELECT id, 5 FROM users');
  db.run("INSERT INTO unlocks (user_id, item, bought_at) SELECT id, 'fox', 1 FROM users");
  assert.equal((await call('/api/account/delete', { body: { password: 'nope' }, cookie })).status, 401);
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 1);
  const r = await call('/api/account/delete', { body: { password: PASSWORD }, cookie });
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get('set-cookie'), /Max-Age=0/);
  for (const table of ['users', 'sessions', 'focus', 'catches', 'tokens', 'recovery', 'wallets', 'unlocks']) assert.equal(db.get(`SELECT COUNT(*) n FROM ${table}`).n, 0, table);
  assert.equal((await call('/api/catches', { cookie })).status, 401);
});

test('purge removes expired data and stale unverified accounts', async () => {
  await call('/api/signup', { body: signupBody('stale@example.com') });
  await makeUser('kept@example.com');
  await db.app.purge(clock.now + 8 * 864e5);
  assert.deepEqual(db.all('SELECT email FROM users').map((u) => u.email), ['kept@example.com']);
  assert.equal(db.get('SELECT COUNT(*) n FROM attempts').n, 0);
  assert.equal(db.get('SELECT COUNT(*) n FROM tokens').n, 0);
});

test('no payment code or payment data remains', async () => {
  assert.equal((await call('/api/stripe/webhook', { raw: '{}', method: 'POST', origin: null })).status, 404);
  const cookie = await makeUser('free@example.com');
  const { user } = (await call('/api/me', { cookie })).data;
  assert.deepEqual(Object.keys(user).sort(), ['coins', 'email', 'prefs', 'twoFactor', 'unlocks']);
  assert.ok(!Object.keys(db.get('SELECT * FROM users')).some((k) => /supporter|public_ref|stripe/.test(k)));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const root = new URL('../', import.meta.url).pathname;
  for (const file of [...walk(path.join(root, 'public')).filter((f) => /\.(js|html|css)$/.test(f)), ...['server.js', 'db.js', '.env.example', 'README.md', 'SECURITY.md'].map((f) => path.join(root, f))]) {
    assert.ok(!/\bstripe\b|supporter|tip jar|tipUrl|leave a tip|\btips\b/i.test(fs.readFileSync(file, 'utf8')), `leftover in ${file}`);
  }
});

// --- Static files and headers ---
test('every response has strict security headers', async () => {
  for (const pathname of ['/', '/api/me', '/nope.html', '/legal/privacy.html']) {
    const { res } = await call(pathname);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.ok(!csp.includes('unsafe'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  }
  assert.equal((await call('/api/me')).res.headers.get('cache-control'), 'no-store');
});

test('static files cannot escape public/', async () => {
  const raw = (target) => new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: target }, (res) => { res.resume(); resolve(res.statusCode); });
  });
  for (const target of ['/../server.js', '/..%2fserver.js', '/%2e%2e/server.js', '/..%5cserver.js', '/legal/../../package.json', '/.env', '/%00', '/%E0%A4%A', '/fonts/', '/data/fishodoro.db', '/test/app.test.js', '/.hidden.js']) {
    assert.ok([404, 400].includes(await raw(target)), target);
  }
  assert.equal(await raw('/'), 200);
  assert.equal((await call('/', { method: 'DELETE', origin: null })).status, 405);
});

test('legal pages exist, contain operator details and escape them', async () => {
  const cfg = loadConfig({ OPERATOR_NAME: 'Fish <b>Co</b>', OPERATOR_ADDRESS: '1 Lake Rd', OPERATOR_EMAIL: 'hi@fish.example', GOVERNING_LAW: 'the laws of Atlantis', DATA_LOCATION: 'Testland' });
  const tempDb = await openTestDb();
  const app = http.createServer(createApp({ config: cfg, db: tempDb.app, mail: async () => {} }));
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  app.unref(); // A failed assertion must not leave the test run hanging.
  const at = `http://127.0.0.1:${app.address().port}`;
  for (const page of ['privacy', 'terms', 'refunds', 'cookies']) {
    const html = await (await fetch(`${at}/legal/${page}.html`)).text();
    assert.ok(html.includes('Fish &#60;b&#62;Co&#60;/b&#62;'), page);
    assert.ok(!html.includes('<b>Co'), page);
    assert.ok(!html.includes('{{'), page);
  }
  assert.ok((await (await fetch(`${at}/legal/terms.html`)).text()).includes('Atlantis'));
  const privacy = await (await fetch(`${at}/legal/privacy.html`)).text();
  assert.ok(privacy.includes('run in Testland') && privacy.includes('Privacy Commissioner of Canada'));
  for (const provider of ['Vercel', 'Turso', 'Brevo']) assert.ok(privacy.includes(provider), provider);
  assert.ok(!/legal basis|data controller|legitimate interest|contractual clauses/i.test(privacy), 'no GDPR-only framing');
  assert.equal([...privacy.matchAll(/<tr><td>/g)].length, 7);
  assert.equal([...privacy.matchAll(/<td>/g)].length, 21, 'every row keeps its three columns');
  const index = await (await fetch(at)).text();
  assert.ok(index.includes('1 Lake Rd') && !index.includes('{{'));
  app.close();
  tempDb.close();
});

// --- Shared logic ---
test('odds tables add up exactly, and rolls match them over 1M fish', () => {
  assert.equal(RARITIES.reduce((a, r) => a + r.odds, 0), 10000);
  assert.equal(SIZES.reduce((a, s) => a + s.odds, 0), 10000);
  const counts = {};
  const sizeCounts = {};
  const N = 1_000_000;
  for (let i = 0; i < N; i++) {
    const fish = rollFish(crypto.randomInt, 25);
    counts[fish.rarity] = (counts[fish.rarity] ?? 0) + 1;
    sizeCounts[fish.size] = (sizeCounts[fish.size] ?? 0) + 1;
    const size = SIZES.find((s) => s.id === fish.size);
    assert.ok(fish.weight >= size.min && fish.weight <= size.max);
  }
  const close = (actual, odds) => {
    const p = odds / 10000;
    assert.ok(Math.abs(actual / N - p) < 5 * Math.sqrt((p * (1 - p)) / N), `${actual} vs ${p}`);
  };
  for (const r of RARITIES) close(counts[r.id], r.odds);
  for (const s of SIZES) close(sizeCounts[s.id], s.odds);
});

test('longer sessions improve the odds: guarantees at 30, 45 and 60 minutes, and rarer tiers keep rising', () => {
  const ids = RARITIES.map((r) => r.id);
  const chance = (minutes, id) => rarityOdds(minutes).find((r) => r.id === id).odds;
  for (let minutes = 5; minutes <= 180; minutes++) {
    const table = rarityOdds(minutes);
    assert.equal(table.reduce((sum, r) => sum + r.odds, 0), 10000, `${minutes} adds up`);
    assert.ok(table.every((r) => r.odds >= 0), `${minutes} has no negative odds`);
    const floor = minutes >= 60 ? 'epic' : minutes >= 45 ? 'rare' : minutes >= 30 ? 'uncommon' : 'common';
    for (const r of table) if (ids.indexOf(r.id) < ids.indexOf(floor)) assert.equal(r.odds, 0, `${minutes} can't give ${r.id}`);
    assert.ok(chance(minutes, floor) > 0, `${minutes} can give ${floor}`);
    if (minutes > 5) for (const id of ['gold', 'black', 'cosmic']) assert.ok(chance(minutes, id) >= chance(minutes - 1, id), `${id} never drops at ${minutes}`);
  }
  assert.deepEqual(RARITIES.map((r) => chance(25, r.id)), RARITIES.map((r) => r.odds), '25 minutes is the published baseline');
  assert.deepEqual([29, 30, 44, 45, 59, 60].map(guaranteedRarity), [null, 'uncommon', 'uncommon', 'rare', 'rare', 'epic']);
  assert.ok(chance(29, 'common') > 0);
  assert.ok(chance(180, 'cosmic') > chance(60, 'cosmic') && chance(60, 'cosmic') > chance(30, 'cosmic'));
  assert.ok(chance(60, 'gold') > chance(45, 'gold') && chance(45, 'gold') > chance(30, 'gold'));
  // Rolls match the table for each length, over many fish.
  for (const minutes of [15, 30, 45, 60, 120]) {
    const counts = {};
    const N = 200_000;
    for (let i = 0; i < N; i++) { const f = rollFish(crypto.randomInt, minutes); counts[f.rarity] = (counts[f.rarity] ?? 0) + 1; }
    for (const r of rarityOdds(minutes)) {
      const p = r.odds / 10000;
      if (p === 0) assert.equal(counts[r.id] ?? 0, 0, `${minutes}: no ${r.id}`);
      else assert.ok(Math.abs((counts[r.id] ?? 0) / N - p) < 5 * Math.sqrt((p * (1 - p)) / N) + 1e-4, `${minutes}: ${r.id}`);
    }
  }
});

test('the server rolls with the real session length, and the guarantee holds through the API', async () => {
  const cookie = await makeUser('guarantee@example.com');
  const ids = RARITIES.map((r) => r.id);
  for (const [minutes, floor] of [[30, 'uncommon'], [45, 'rare'], [60, 'epic'], [90, 'epic']]) {
    for (let i = 0; i < 12; i++) {
      await call('/api/focus/start', { body: { minutes }, cookie });
      clock.now += minutes * 60_000;
      const { data } = await call('/api/focus/complete', { body: { minutes: 180, rarity: 'cosmic' }, cookie });
      assert.ok(ids.indexOf(data.fish.rarity) >= ids.indexOf(floor), `${minutes} min gave ${data.fish.rarity}`);
    }
  }
});

// --- Selling and the market ---
function giveFish(userId, rarity, size, weight) {
  return Number(db.get('INSERT INTO catches (user_id, species, rarity, size, weight, caught_at) VALUES (?, ?, ?, ?, ?, 1) RETURNING id', userId, 'koi', rarity, size, weight).id);
}
const coins = async (cookie) => (await call('/api/me', { cookie })).data.user.coins;

test('rarer and bigger fish always sell for more, and every catalog item has art', () => {
  const rarities = RARITIES.map((r) => r.id);
  for (const size of SIZES) {
    for (let i = 1; i < rarities.length; i++) assert.ok(fishPrice({ rarity: rarities[i], size: size.id, weight: size.min }) > fishPrice({ rarity: rarities[i - 1], size: size.id, weight: size.max }), `${rarities[i]} beats ${rarities[i - 1]} even when lighter`);
  }
  for (const rarity of rarities) {
    for (let i = 1; i < SIZES.length; i++) assert.ok(fishPrice({ rarity, size: SIZES[i].id, weight: SIZES[i].min }) > fishPrice({ rarity, size: SIZES[i - 1].id, weight: SIZES[i - 1].max }), `${SIZES[i].id} beats ${SIZES[i - 1].id}`);
    for (const size of SIZES) assert.ok(fishPrice({ rarity, size: size.id, weight: size.max }) > fishPrice({ rarity, size: size.id, weight: size.min }), 'heavier beats lighter');
  }
  assert.equal(fishPrice({ rarity: 'common', size: 'tiny', weight: 1 }), RARITY_VALUE.common * SIZE_MULTIPLIER.tiny);
  assert.equal(new Set(CATALOG.map((i) => i.id)).size, CATALOG.length);
  for (const item of CATALOG) { assert.ok(item.price > 0 && Number.isInteger(item.price)); assert.ok(hasSprite(item.id), `${item.id} has art`); }
});

test('selling pays the stored price once, and the browser cannot set the price', async () => {
  const cookie = await makeUser('seller@example.com');
  const { id } = db.get('SELECT id FROM users');
  const fish = giveFish(id, 'epic', 'huge', 800);
  const price = fishPrice({ rarity: 'epic', size: 'huge', weight: 800 });
  assert.equal(await coins(cookie), 0);
  const sold = await call('/api/sell', { body: { ids: [fish], price: 999999, rarity: 'cosmic' }, cookie });
  assert.equal(sold.status, 200);
  assert.deepEqual([sold.data.sold, sold.data.earned, sold.data.coins], [1, price, price]);
  assert.equal(db.get('SELECT COUNT(*) n FROM catches').n, 0);
  assert.equal((await call('/api/sell', { body: { ids: [fish] }, cookie })).status, 404, 'already sold');
  assert.equal(await coins(cookie), price);
});

test('parallel sales of one fish pay only once', async () => {
  const cookie = await makeUser('race-sell@example.com');
  const { id } = db.get('SELECT id FROM users');
  const fish = giveFish(id, 'gold', 'big', 200);
  const results = await Promise.all(Array.from({ length: 8 }, () => call('/api/sell', { body: { ids: [fish] }, cookie })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(await coins(cookie), fishPrice({ rarity: 'gold', size: 'big', weight: 200 }));
});

test("nobody can sell another player's fish, and bad sale requests are refused", async () => {
  const alice = await makeUser('alice-sell@example.com');
  const bob = await makeUser('bob-sell@example.com');
  const aliceId = db.get('SELECT id FROM users WHERE email = ?', 'alice-sell@example.com').id;
  const fish = giveFish(aliceId, 'cosmic', 'huge', 1000);
  assert.equal((await call('/api/sell', { body: { ids: [fish] }, cookie: bob })).status, 404);
  assert.equal(db.get('SELECT COUNT(*) n FROM catches').n, 1);
  assert.equal(await coins(bob), 0);
  for (const ids of [undefined, [], 'x', [1.5], ['1'], [fish, fish], Array.from({ length: 61 }, (_, i) => i + 1), [{ id: fish }]]) assert.equal((await call('/api/sell', { body: { ids }, cookie: alice })).status, 400, JSON.stringify(ids)?.slice(0, 30));
  assert.equal((await call('/api/sell', { body: { ids: [fish] } })).status, 401, 'needs a session');
  assert.equal((await call('/api/market/buy', { body: { item: 'fox' } })).status, 401);
  const mixed = await call('/api/sell', { body: { ids: [fish, 999999] }, cookie: alice });
  assert.equal(mixed.data.sold, 1, 'only owned fish count');
});

test('buying charges the catalog price once and refuses when coins run short', async () => {
  const cookie = await makeUser('buyer@example.com');
  const { id } = db.get('SELECT id FROM users');
  assert.equal((await call('/api/market/buy', { body: { item: 'fox' }, cookie })).status, 409, 'no wallet yet');
  db.run('INSERT INTO wallets (user_id, coins) VALUES (?, 299)', id);
  const short = await call('/api/market/buy', { body: { item: 'fox', price: 1 }, cookie });
  assert.equal(short.status, 409);
  assert.match(short.data.error, /enough coins/);
  assert.equal(await coins(cookie), 299);
  db.run('UPDATE wallets SET coins = 700 WHERE user_id = ?', id);
  const bought = await call('/api/market/buy', { body: { item: 'fox', price: 1 }, cookie });
  assert.deepEqual([bought.status, bought.data.coins, bought.data.unlocks], [200, 400, ['fox']]);
  const again = await call('/api/market/buy', { body: { item: 'fox' }, cookie });
  assert.equal(again.status, 409);
  assert.match(again.data.error, /already own/);
  assert.equal(await coins(cookie), 400, 'no double charge');
  for (const item of ['nope', '__proto__', 'constructor', 'cat', null, 5, {}]) assert.equal((await call('/api/market/buy', { body: { item }, cookie })).status, 400, String(item));
});

test('parallel purchases cannot overspend or double charge', async () => {
  const cookie = await makeUser('race-buy@example.com');
  const { id } = db.get('SELECT id FROM users');
  db.run('INSERT INTO wallets (user_id, coins) VALUES (?, 700)', id);
  const same = await Promise.all(Array.from({ length: 6 }, () => call('/api/market/buy', { body: { item: 'penguin' }, cookie })));
  assert.equal(same.filter((r) => r.status === 200).length, 1);
  assert.equal(await coins(cookie), 100);
  db.run('UPDATE wallets SET coins = 650 WHERE user_id = ?', id);
  const different = await Promise.all(['fox', 'piratehat', 'neonrod', 'wizardhat'].map((item) => call('/api/market/buy', { body: { item }, cookie })));
  const left = await coins(cookie);
  assert.ok(left >= 0 && different.some((r) => r.status === 200) && different.some((r) => r.status === 409), `left ${left}`);
  const spent = different.filter((r) => r.status === 200).length;
  assert.equal(db.get('SELECT COUNT(*) n FROM unlocks').n, 1 + spent);
});

test('locked items cannot be equipped from the browser, and owned ones can', async () => {
  const cookie = await makeUser('wear@example.com');
  const { id } = db.get('SELECT id FROM users');
  const tried = await call('/api/prefs', { body: { angler: 'astronaut', hat: 'crown', face: 'sunglasses', rod: 'goldrod' }, cookie });
  assert.deepEqual([tried.data.prefs.angler, tried.data.prefs.hat, tried.data.prefs.face, tried.data.prefs.rod], ['cat', 'none', 'none', 'none']);
  db.run('INSERT INTO wallets (user_id, coins) VALUES (?, 5000)', id);
  await call('/api/market/buy', { body: { item: 'crown' }, cookie });
  await call('/api/market/buy', { body: { item: 'robot' }, cookie });
  const worn = await call('/api/prefs', { body: { angler: 'robot', hat: 'crown', face: 'sunglasses' }, cookie });
  assert.deepEqual([worn.data.prefs.angler, worn.data.prefs.hat, worn.data.prefs.face], ['robot', 'crown', 'none']);
  assert.equal((await call('/api/me', { cookie })).data.user.prefs.angler, 'robot');
  assert.equal((await call('/api/prefs', { body: { hat: 'partyhat' }, cookie })).data.prefs.hat, 'none');
  db.run('DELETE FROM unlocks WHERE user_id = ?', id);
  assert.equal((await call('/api/me', { cookie })).data.user.prefs.angler, 'cat', 'a stored item that is no longer owned falls back');
  const exported = await call('/api/export', { cookie });
  assert.equal(exported.data.account.coins, await coins(cookie));
  assert.deepEqual(exported.data.account.unlocks, []);
});

test('password rules catch weak choices and allow good ones', () => {
  for (const bad of ['short', 'password1234', 'Password!!!!1234', 'aaaaaaaaaaaa', 'abcabcabcabc', '123412341234', 'qwertyuiop12', 'fishodoro2026!']) assert.ok(passwordProblem(bad), bad);
  assert.ok(passwordProblem('river.otter99xyz!', 'river.otter99@example.com'));
  assert.ok(passwordProblem('x'.repeat(5) + 'abcde'.repeat(30)));
  for (const good of [PASSWORD, 'correct horse staple 9', 'tR7#kL2$pQ9!']) assert.equal(passwordProblem(good), null, good);
});

test('.gitignore protects secrets and data from being committed', () => {
  const rules = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split('\n');
  for (const rule of ['node_modules/', 'data/', '.env', '.env.*', '!.env.example', '*.db']) assert.ok(rules.includes(rule), rule);
  assert.ok(!fs.existsSync(new URL('../public/.gitignore', import.meta.url)));
});

test('no secrets, inline scripts or third-party resources in public files', () => {
  const dir = new URL('../public/', import.meta.url).pathname;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const file of walk(dir).filter((f) => /\.(js|html|css)$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/sk_(live|test)_|whsec_[a-z0-9]{8}|BEGIN (RSA )?PRIVATE KEY/.test(text), `secret in ${file}`);
    assert.ok(!/\.innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/.test(text), `unsafe DOM call in ${file}`);
    assert.ok(!/localStorage\.setItem\([^)]*(token|sid|session)/i.test(text), `token in storage in ${file}`);
    if (file.endsWith('.html')) {
      assert.ok(!/<script(?![^>]*\ssrc=)/.test(text), `inline script in ${file}`);
      assert.ok(!/\son\w+=/.test(text), `inline handler in ${file}`);
      assert.ok(!/\sstyle=/.test(text), `inline style in ${file}`);
      assert.ok(!/<(script|link|img)[^>]+(src|href)="https?:/.test(text), `third-party resource in ${file}`);
    }
    if (file.endsWith('.css')) assert.ok(!/url\(['"]?https?:/.test(text), `third-party resource in ${file}`);
  }
});
