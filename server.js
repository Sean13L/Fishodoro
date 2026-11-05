import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-generator';
import { openDb } from './db.js';
import { RARITIES, rollFish } from './public/fish.js';
import { cleanPrefs, FOCUS_MINUTES } from './public/options.js';
import { MAX_PASSWORD, passwordProblem } from './public/password.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SESSION_MS = 30 * DAY;
const TOKEN_MS = 30 * MINUTE;
const CLAIM_WINDOW_MS = DAY;
const CONSENT_VERSION = '2026-11-04';
const MIN_AGE_MONTHS = 16 * 12;
const MAX_BODY = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
};

const CSP = ["default-src 'none'", "script-src 'self'", "worker-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join('; ');

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const safeEqual = (a, b) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// --- Passwords: Argon2id with OWASP's recommended minimum parameters ---
const ARGON = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const argon2 = (message, nonce, params) => new Promise((resolve, reject) =>
  crypto.argon2('argon2id', { message, nonce, ...params }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password) {
  const nonce = crypto.randomBytes(16);
  const key = await argon2(password, nonce, ARGON);
  return `argon2id$${ARGON.memory}$${ARGON.passes}$${nonce.toString('base64url')}$${key.toString('base64url')}`;
}

async function checkPassword(stored, password) {
  const [, memory, passes, nonce, key] = stored.split('$');
  const actual = await argon2(password, Buffer.from(nonce, 'base64url'), { ...ARGON, memory: +memory, passes: +passes });
  return crypto.timingSafeEqual(actual, Buffer.from(key, 'base64url'));
}

// --- TOTP (RFC 6238) ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  return bits ? out + B32[(value << (5 - bits)) & 31] : out;
}

export function totpCode(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(msg).digest();
  const offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// --- Configuration: production refuses to start with anything missing ---
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production) {
    const required = ['APP_URL', 'APP_SECRET', 'OPERATOR_NAME', 'OPERATOR_ADDRESS', 'OPERATOR_EMAIL', 'GOVERNING_LAW', 'MAIL_API_URL', 'MAIL_API_KEY', 'MAIL_FROM'];
    const missing = required.filter((key) => !env[key]);
    if (missing.length) throw new Error(`Missing required settings: ${missing.join(', ')}`);
    if (env.APP_SECRET.length < 32) throw new Error('APP_SECRET must be at least 32 characters.');
    if (new URL(env.APP_URL).protocol !== 'https:') throw new Error('APP_URL must use https in production.');
  }
  const appUrl = new URL(env.APP_URL || 'http://localhost:3000');
  const fastTimer = env.FAST_TEST_TIMER === '1';
  if (fastTimer && (production || !['localhost', '127.0.0.1'].includes(appUrl.hostname))) throw new Error('FAST_TEST_TIMER is for local testing only.');
  return {
    production,
    origin: appUrl.origin,
    secure: appUrl.protocol === 'https:',
    secret: env.APP_SECRET || 'development-only-secret-do-not-deploy',
    trustProxy: env.TRUST_PROXY === '1',
    minuteMs: fastTimer ? 1000 : MINUTE,
    mail: { url: env.MAIL_API_URL, key: env.MAIL_API_KEY, from: env.MAIL_FROM },
    operator: {
      OPERATOR_NAME: env.OPERATOR_NAME || '[Operator name not configured]',
      OPERATOR_ADDRESS: env.OPERATOR_ADDRESS || '[Operator address not configured]',
      OPERATOR_EMAIL: env.OPERATOR_EMAIL || '[Contact email not configured]',
      GOVERNING_LAW: env.GOVERNING_LAW || '[Governing law not configured]',
    },
  };
}

// Sends through any HTTP API that accepts { from, to, subject, text } with a bearer key.
export function httpMailer(config) {
  return async ({ to, subject, text }) => {
    if (!config.mail.url) { console.log(`[dev mail] To: ${to}\nSubject: ${subject}\n${text}\n`); return; }
    const res = await fetch(config.mail.url, {
      method: 'POST',
      // Resend rejects requests without a User-Agent, so it's set rather than left to the runtime.
      headers: { authorization: `Bearer ${config.mail.key}`, 'content-type': 'application/json', 'user-agent': 'Fishodoro/1.0' },
      body: JSON.stringify({ from: config.mail.from, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Mail provider returned ${res.status}`);
  };
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createApp({ config, db, now = Date.now, mail = httpMailer(config), minuteMs = config.minuteMs }) {
  const hmac = (value) => crypto.createHmac('sha256', config.secret).update(value).digest('base64url');
  const totpKey = crypto.createHmac('sha256', config.secret).update('totp-key').digest();
  const dummyHash = hashPassword(newToken());
  const cookieName = config.secure ? '__Host-sid' : 'sid';
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Strict${config.secure ? '; Secure' : ''}`;

  const encrypt = (text) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', totpKey, iv);
    const body = Buffer.concat([cipher.update(text), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
  };
  const decrypt = (blob) => {
    const [iv, tag, body] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', totpKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  };

  // Records the attempt before any slow work, so parallel requests can't slip past the limit.
  function attempt(key, max, windowMs) {
    const hashed = hmac(key);
    const { n, first } = db.get('SELECT COUNT(*) n, MIN(at) first FROM attempts WHERE key = ? AND at > ?', hashed, now() - windowMs);
    if (n >= max) fail(429, 'Too many attempts. Please wait and try again.', { retryAfter: Math.ceil((first + windowMs - now()) / 1000) });
    db.run('INSERT INTO attempts (key, at) VALUES (?, ?)', hashed, now());
  }
  // Same limit, but for work to skip silently, so the response doesn't change.
  const allowed = (...args) => {
    try { attempt(...args); return true; } catch (err) { if (err instanceof HttpError) return false; throw err; }
  };
  // Caps account emails per address, so nobody can use this site to flood someone's inbox.
  const mayEmail = (email) => allowed(`mail:${email}`, 3, HOUR);
  const clearAttempts = (key) => db.run('DELETE FROM attempts WHERE key = ?', hmac(key));

  const asEmail = (value) => {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
    return email;
  };
  const asPassword = (value) => {
    if (typeof value !== 'string' || !value || value.length > MAX_PASSWORD) fail(401, 'Incorrect email or password.');
    return value;
  };
  const asToken = (value) => {
    if (typeof value !== 'string' || !/^[\w-]{20,100}$/.test(value)) fail(400, 'That link is not valid. Please request a new one.');
    return value;
  };

  const footer = () => `\n\n--\nFishodoro only sends security emails like this one. There are no marketing emails, so there is nothing to unsubscribe from.`
    + `\nYou can delete your account and all its data at any time: ${config.origin}/#account`
    + `\n${config.operator.OPERATOR_NAME}, ${config.operator.OPERATOR_ADDRESS}`;
  // Not awaited: a response must take the same time whether or not an address has an account.
  const send = (to, subject, text) => mail({ to, subject, text: text + footer() }).catch((err) => console.error('Email failed:', err.message));

  function issueToken(userId, kind) {
    const token = newToken();
    db.tx(() => {
      db.run('DELETE FROM tokens WHERE user_id = ? AND kind = ?', userId, kind);
      db.run('INSERT INTO tokens (hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, kind, now() + TOKEN_MS);
    });
    return token;
  }
  const useToken = (token, kind) => {
    const row = db.get('DELETE FROM tokens WHERE hash = ? AND kind = ? AND expires_at > ? RETURNING user_id', sha256(token), kind, now());
    return row?.user_id ?? fail(400, 'That link has expired or was already used. Please request a new one.');
  };
  // Tokens travel in the URL fragment, which never reaches server logs or Referer headers.
  const sendVerify = (user) => send(user.email, 'Confirm your Fishodoro email',
    `Confirm your email to start saving fish:\n${config.origin}/#verify=${issueToken(user.id, 'verify')}\n\nThis link expires in 30 minutes. If you didn't sign up, you can ignore this email.`);

  function startSession(res, userId) {
    const token = newToken();
    db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, now() + SESSION_MS);
    res.setHeader('Set-Cookie', `${cookieName}=${token}; ${cookieAttrs}; Max-Age=${SESSION_MS / 1000}`);
  }
  const endSession = (res) => res.setHeader('Set-Cookie', `${cookieName}=; ${cookieAttrs}; Max-Age=0`);

  function sessionUser(req) {
    const pair = (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([name]) => name === cookieName);
    if (!pair?.[1]) return {};
    const tokenHash = sha256(pair[1]);
    const user = db.get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', tokenHash, now());
    return user ? { user, tokenHash } : {};
  }

  // Accepts a 6-digit TOTP code (never the same one twice) or a single-use recovery code.
  function checkSecondFactor(user, code) {
    const value = typeof code === 'string' ? code.trim().toLowerCase() : '';
    if (/^\d{6}$/.test(value)) {
      const secret = decrypt(user.totp_secret);
      const current = Math.floor(now() / 30_000);
      for (const counter of [current - 1, current, current + 1]) {
        if (counter > user.totp_last && safeEqual(totpCode(secret, counter), value)) {
          db.run('UPDATE users SET totp_last = ? WHERE id = ?', counter, user.id);
          return true;
        }
      }
      return false;
    }
    return /^[a-f0-9-]{16,24}$/.test(value)
      && !!db.get('DELETE FROM recovery WHERE hash = ? AND user_id = ? RETURNING 1 ok', sha256(value.replaceAll('-', '')), user.id);
  }

  // Sensitive actions must re-prove the password and, when enabled, the second factor.
  async function reauth(user, body) {
    attempt(`reauth:${user.id}`, 10, 15 * MINUTE);
    if (typeof body.password !== 'string' || body.password.length > MAX_PASSWORD || !(await checkPassword(user.pw_hash, body.password))) fail(401, 'That password is incorrect.');
    if (user.totp_enabled && !checkSecondFactor(user, body.code)) fail(401, 'That 2FA code did not work.', { need2fa: true });
    clearAttempts(`reauth:${user.id}`);
  }

  function activeFocus(userId) {
    const row = db.get('SELECT minutes, started_at FROM focus WHERE user_id = ?', userId);
    if (!row) return null;
    const duration = row.minutes * minuteMs;
    if (row.started_at + duration + CLAIM_WINDOW_MS < now()) {
      db.run('DELETE FROM focus WHERE user_id = ?', userId);
      return null;
    }
    return { minutes: row.minutes, startedAt: row.started_at, remainingMs: Math.max(0, row.started_at + duration - now()) };
  }

  const publicUser = (u) => ({
    email: u.email,
    twoFactor: !!u.totp_enabled,
    prefs: cleanPrefs(JSON.parse(u.prefs)),
  });

  // Every route needs a session unless it's explicitly marked open.
  const open = (fn) => Object.assign(fn, { open: true });
  const routes = {
    'GET /api/me': open(({ user }) => ({ user: user ? publicUser(user) : null, minuteMs })),

    'POST /api/signup': open(async ({ body, ip }) => {
      const email = asEmail(body.email);
      if (body.consent !== true) fail(400, 'Please accept the Terms and Privacy Policy to continue.');
      const year = body.birthYear, month = body.birthMonth;
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1900) fail(400, 'Please enter your birth month and year.');
      // Used for this check only and never stored. Strictly greater, so 16 full years have passed.
      const today = new Date(now());
      if ((today.getUTCFullYear() - year) * 12 + (today.getUTCMonth() + 1 - month) <= MIN_AGE_MONTHS) {
        fail(403, 'Sorry, you need to be 16 or older to create an account. You can keep fishing as a guest, which stores nothing about you on our servers.', { underAge: true });
      }
      const problem = passwordProblem(body.password, email);
      if (problem) fail(400, problem);
      attempt(`signup:${ip}`, 10, HOUR);
      const pwHash = await hashPassword(body.password);
      const existing = db.get('SELECT id FROM users WHERE email = ?', email);
      if (existing) {
        if (mayEmail(email)) send(email, 'You already have a Fishodoro account', `Someone tried to sign up with this email. You already have an account, so nothing changed.\n\nForgot your password? Reset it here:\n${config.origin}/#forgot`);
      } else {
        const { lastInsertRowid: id } = db.run('INSERT INTO users (email, pw_hash, created_at, consent_version, consent_at) VALUES (?, ?, ?, ?, ?)',
          email, pwHash, now(), CONSENT_VERSION, now());
        if (mayEmail(email)) sendVerify({ id, email });
      }
      return { message: 'Check your email for the next step.' };
    }),

    // Asks for the password too. Otherwise someone could sign up with a victim's email and
    // a password of their own, then wait for the victim to click the link and activate it.
    'POST /api/verify': open(async ({ body, ip }) => {
      attempt(`verify:${ip}`, 20, HOUR);
      const token = asToken(body.token);
      const row = db.get('SELECT u.pw_hash FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ? AND t.kind = ? AND t.expires_at > ?', sha256(token), 'verify', now());
      if (!row) fail(400, 'That link has expired or was already used. Sign in to get a new one.');
      if (typeof body.password !== 'string' || body.password.length > MAX_PASSWORD || !(await checkPassword(row.pw_hash, body.password))) fail(401, "That password doesn't match this account.");
      db.run('UPDATE users SET verified = 1 WHERE id = ?', useToken(token, 'verify'));
      return { message: 'Email confirmed. You can sign in now.' };
    }),

    'POST /api/login': open(async ({ body, ip, res }) => {
      const email = asEmail(body.email);
      const password = asPassword(body.password);
      attempt(`login-ip:${ip}`, 30, 15 * MINUTE);
      attempt(`login-acct:${email}`, 10, 15 * MINUTE);
      const user = db.get('SELECT * FROM users WHERE email = ?', email);
      // Unknown emails still pay for a hash, so timing doesn't reveal which accounts exist.
      const matches = await checkPassword(user?.pw_hash ?? await dummyHash, password);
      if (!user || !matches) fail(401, 'Incorrect email or password.');
      if (!user.verified) {
        if (mayEmail(email)) sendVerify(user);
        fail(403, 'Please confirm your email first. Check your inbox for the link.');
      }
      if (user.totp_enabled) {
        if (!body.code) fail(401, 'Enter the code from your authenticator app.', { need2fa: true });
        if (!checkSecondFactor(user, body.code)) fail(401, 'That code did not work.', { need2fa: true });
      }
      clearAttempts(`login-acct:${email}`);
      startSession(res, user.id);
      return { user: publicUser(user) };
    }),

    'POST /api/logout': ({ res, tokenHash }) => {
      db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      endSession(res);
      return {};
    },

    'POST /api/forgot': open(({ body, ip }) => {
      const email = asEmail(body.email);
      attempt(`forgot-ip:${ip}`, 10, HOUR);
      attempt(`forgot-acct:${email}`, 3, HOUR);
      const user = db.get('SELECT id, email FROM users WHERE email = ?', email);
      if (user) {
        send(user.email, 'Reset your Fishodoro password',
          `Choose a new password here:\n${config.origin}/#reset=${issueToken(user.id, 'reset')}\n\nThis link expires in 30 minutes. If you didn't ask for this, you can ignore this email.`);
      }
      return { message: 'If that address has an account, a reset link is on its way.' };
    }),

    'POST /api/reset': open(async ({ body, ip }) => {
      attempt(`reset:${ip}`, 10, HOUR);
      const token = asToken(body.token);
      const owner = db.get('SELECT u.email FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ? AND t.kind = ?', sha256(token), 'reset');
      const problem = passwordProblem(body.password, owner?.email);
      if (problem) fail(400, problem);
      const pwHash = await hashPassword(body.password);
      const userId = useToken(token, 'reset');
      db.tx(() => {
        db.run('UPDATE users SET pw_hash = ?, verified = 1 WHERE id = ?', pwHash, userId);
        db.run('DELETE FROM sessions WHERE user_id = ?', userId);
        db.run('DELETE FROM tokens WHERE user_id = ?', userId);
      });
      return { message: 'Password updated. You can sign in now.' };
    }),

    'POST /api/password': async ({ body, user, tokenHash }) => {
      await reauth(user, { ...body, password: body.current });
      const problem = passwordProblem(body.next, user.email);
      if (problem) fail(400, problem);
      const pwHash = await hashPassword(body.next);
      db.tx(() => {
        db.run('UPDATE users SET pw_hash = ? WHERE id = ?', pwHash, user.id);
        db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, tokenHash);
        db.run('DELETE FROM tokens WHERE user_id = ?', user.id);
      });
      return { message: 'Password updated. Your other devices were signed out.' };
    },

    'POST /api/2fa/setup': async ({ body, user }) => {
      if (user.totp_enabled) fail(409, '2FA is already on.');
      await reauth(user, body);
      const secret = crypto.randomBytes(20);
      db.run('UPDATE users SET totp_secret = ? WHERE id = ?', encrypt(secret), user.id);
      const key = base32(secret);
      const uri = `otpauth://totp/Fishodoro:${encodeURIComponent(user.email)}?secret=${key}&issuer=Fishodoro`;
      const qr = qrcode(0, 'M');
      qr.addData(uri);
      qr.make();
      return { key, qr: qr.createDataURL(4, 8) };
    },

    'POST /api/2fa/enable': ({ body, user }) => {
      if (user.totp_enabled || !user.totp_secret) fail(409, 'Start 2FA setup first.');
      attempt(`2fa-enable:${user.id}`, 10, 15 * MINUTE);
      if (!/^\d{6}$/.test(String(body.code ?? '').trim()) || !checkSecondFactor(user, body.code)) fail(400, 'That code did not work.');
      const codes = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString('hex'));
      db.tx(() => {
        db.run('UPDATE users SET totp_enabled = 1 WHERE id = ?', user.id);
        db.run('DELETE FROM recovery WHERE user_id = ?', user.id);
        for (const code of codes) db.run('INSERT INTO recovery (hash, user_id) VALUES (?, ?)', sha256(code), user.id);
      });
      return { recoveryCodes: codes };
    },

    'POST /api/2fa/disable': async ({ body, user }) => {
      if (!user.totp_enabled) fail(409, '2FA is already off.');
      await reauth(user, body);
      db.tx(() => {
        db.run('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last = 0 WHERE id = ?', user.id);
        db.run('DELETE FROM recovery WHERE user_id = ?', user.id);
      });
      return { message: '2FA is off.' };
    },

    'POST /api/prefs': ({ body, user }) => {
      const prefs = cleanPrefs(body);
      db.run('UPDATE users SET prefs = ? WHERE id = ?', JSON.stringify(prefs), user.id);
      return { prefs };
    },

    'GET /api/focus/active': ({ user }) => ({ active: activeFocus(user.id) }),

    'POST /api/focus/start': ({ body, user }) => {
      if (!FOCUS_MINUTES.includes(body.minutes)) fail(400, 'Pick one of the focus lengths.');
      const active = activeFocus(user.id);
      if (active) return { active };
      db.run('INSERT INTO focus (user_id, minutes, started_at) VALUES (?, ?, ?)', user.id, body.minutes, now());
      return { active: activeFocus(user.id) };
    },

    'POST /api/focus/cancel': ({ user }) => {
      db.run('DELETE FROM focus WHERE user_id = ?', user.id);
      return {};
    },

    // The server alone checks the time and rolls the fish, so a catch can't be forged from the browser.
    'POST /api/focus/complete': ({ user }) => {
      const active = activeFocus(user.id);
      if (!active) fail(404, 'There is no focus session to reel in.');
      if (active.remainingMs > 0) fail(409, 'That session is not finished yet.', { retryAfterMs: active.remainingMs });
      const fish = rollFish(crypto.randomInt);
      db.tx(() => {
        db.run('DELETE FROM focus WHERE user_id = ?', user.id);
        db.run('INSERT INTO catches (user_id, species, rarity, size, weight, caught_at) VALUES (?, ?, ?, ?, ?, ?)',
          user.id, fish.species, fish.rarity, fish.size, fish.weight, now());
      });
      return { fish };
    },

    'GET /api/catches': ({ url, user }) => {
      const rarity = url.searchParams.get('rarity');
      if (rarity && !RARITIES.some((r) => r.id === rarity)) fail(400, 'Unknown rarity.');
      const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
      const limit = 60;
      const catches = rarity
        ? db.all('SELECT id, species, rarity, size, weight, caught_at FROM catches WHERE user_id = ? AND rarity = ? AND id < ? ORDER BY id DESC LIMIT ?', user.id, rarity, before, limit)
        : db.all('SELECT id, species, rarity, size, weight, caught_at FROM catches WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?', user.id, before, limit);
      const counts = Object.fromEntries(db.all('SELECT rarity, COUNT(*) n FROM catches WHERE user_id = ? GROUP BY rarity', user.id).map((r) => [r.rarity, r.n]));
      return { catches, counts, more: catches.length === limit };
    },

    'GET /api/export': ({ user, res }) => {
      res.setHeader('Content-Disposition', 'attachment; filename="fishodoro-data.json"');
      return {
        account: { email: user.email, createdAt: user.created_at, consentVersion: user.consent_version, consentAt: user.consent_at, twoFactor: !!user.totp_enabled, prefs: JSON.parse(user.prefs) },
        catches: db.all('SELECT species, rarity, size, weight, caught_at FROM catches WHERE user_id = ? ORDER BY id', user.id),
      };
    },

    'POST /api/account/delete': async ({ body, user, res }) => {
      await reauth(user, body);
      db.run('DELETE FROM users WHERE id = ?', user.id); // Foreign keys cascade to every other table.
      db.run('DELETE FROM attempts WHERE key = ?', hmac(`login-acct:${user.email}`));
      endSession(res);
      return { message: 'Your account and all its data have been deleted.' };
    },
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { chunks.length = 0; reject(new HttpError(413, 'That request is too large.')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  async function handleApi(req, res, url) {
    res.setHeader('Cache-Control', 'no-store');
    const ip = (config.trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim()) || req.socket.remoteAddress;
    const write = req.method !== 'GET';
    let result;
    try {
      const fn = Object.hasOwn(routes, `${req.method} ${url.pathname}`) ? routes[`${req.method} ${url.pathname}`] : fail(404, 'Not found.');
      let body = {};
      if (write) {
        // SameSite=Strict is the first CSRF layer; these checks are the second.
        if (req.headers.origin !== config.origin) fail(403, 'Request blocked.');
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) fail(415, 'Send JSON.');
        try { body = JSON.parse(await readBody(req)); } catch (err) { if (err instanceof HttpError) throw err; fail(400, 'Invalid request.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid request.');
      }
      const { user, tokenHash } = sessionUser(req);
      if (!fn.open && !user) fail(401, 'Please sign in.');
      result = await fn({ req, res, url, body, user, tokenHash, ip });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const known = err instanceof HttpError;
      if (!known) console.error(err);
      if (res.headersSent) { res.destroy(); return; }
      if (err.extra?.retryAfter) res.setHeader('Retry-After', err.extra.retryAfter);
      if (err.status === 413) res.setHeader('Connection', 'close');
      res.writeHead(known ? err.status : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: known ? err.message : 'Something went wrong. Please try again.', ...(known ? err.extra : {}) }));
    }
  }

  async function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); };
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return notFound(); }
    if (rel === '/') rel = '/index.html';
    const file = path.resolve(PUBLIC, `.${rel}`);
    const type = MIME[path.extname(file)];
    if (!type || !file.startsWith(PUBLIC + path.sep) || rel.includes('\0') || rel.split('/').some((s) => s.startsWith('.'))) return notFound();
    let data;
    try { data = await fs.readFile(file); } catch { return notFound(); }
    if (path.extname(file) === '.html') {
      data = Buffer.from(data.toString().replace(/\{\{(\w+)\}\}/g, (all, key) => (Object.hasOwn(config.operator, key) ? escapeHtml(config.operator[key]) : all)));
    }
    const etag = `"${sha256(data).slice(0, 22)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  return async function handler(req, res) {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    let url;
    try { url = new URL(req.url, 'http://local'); } catch { res.writeHead(400); res.end(); return; }
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(req, res, url).catch((err) => { console.error(err); res.destroy(); });
  };
}

export function startServer(env = process.env) {
  const config = loadConfig(env);
  const db = openDb(env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'fishodoro.db'));
  db.purge(Date.now());
  setInterval(() => db.purge(Date.now()), HOUR).unref();
  const server = http.createServer(createApp({ config, db }));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  const port = Number(env.PORT) || 3000;
  const host = env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Fishodoro is running at http://${host}:${port}`));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
