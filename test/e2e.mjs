// Full browser run: flows, keyboard, responsive layouts, accessibility scan.
// Usage: npm run test:e2e [screenshot-folder]   BROWSER=chrome|firefox|webkit
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, loadConfig, totpCode } from '../server.js';
import { openTestDb } from './helpers.js';

const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'fishodoro-e2e-'));
const engine = process.env.BROWSER || 'chrome';
const PW = 'gentle-river-otter-42';
const config = loadConfig({ APP_URL: 'http://localhost:4173', OPERATOR_NAME: 'Test Operator', OPERATOR_ADDRESS: '1 Test St', OPERATOR_EMAIL: 'hi@test.example', GOVERNING_LAW: 'Testland' });
const mails = [];
const db = await openTestDb();
const server = http.createServer(createApp({ config, db: db.app, mail: async (m) => { mails.push(m); }, minuteMs: 60 }));
await new Promise((r) => server.listen(4173, '127.0.0.1', r));
const browser = await (engine === 'firefox' ? firefox.launch() : engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
const problems = [];
const results = [];
const step = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 1500)}`); } };
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, ...opts });
  // The server runs a short clock so account sessions finish quickly. Browser-side timers keep
  // normal minutes here, so guest flows and breaks are driven by the page's fake clock instead.
  await ctx.route('**/api/me', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), minuteMs: 60000 } });
  });
  const page = await ctx.newPage();
  // WebKit reports this for its own built-in <select> internals and for Playwright's screenshots, on any page with a strict CSP.
  const ignorable = (t) => /40[0-9]|429/.test(t) || (engine === 'webkit' && /Refused to apply a stylesheet/.test(t));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !ignorable(m.text())) problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:4173/');
  await page.waitForTimeout(200);
  return { ctx, page };
}
const text = (page, s) => page.locator(s).innerText();

// --- Guest: nothing stored before a choice ---
const { ctx: gc, page: g } = await open();
await step('nothing is stored before the cookie choice', async () => {
  const keys = await g.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys, []);
  assert.equal((await gc.cookies()).length, 0);
  assert.equal(await g.locator('#cookie-banner').isVisible(), true);
});
await step('essential-only stores no preferences', async () => {
  await g.click('#cookies-essential');
  await g.check('input[name=focus][value="15"]', { force: true });
  assert.deepEqual(await g.evaluate(() => Object.keys(localStorage)), ['fish.consent']);
  assert.equal(await text(g, '#time'), '15:00');
});
await step('allowing preferences then saves them', async () => {
  await g.click('#cookie-settings');
  await g.click('#cookies-allow');
  await g.check('input[name=focus][value="30"]', { force: true });
  assert.ok((await g.evaluate(() => localStorage.getItem('fish.prefs'))).includes('"focus":30'));
});
await step('guest timer drives a full catch, using a sped-up clock', async () => {
  await g.clock.install();
  await g.clock.resume();
  await g.click('#go');
  await g.waitForFunction(() => document.querySelector('#mode').textContent === 'Focus');
  assert.equal(await text(g, '#go'), 'Pause');
  await g.waitForTimeout(1300);
  await g.screenshot({ path: `${out}/10-casting.png` });
  await g.clock.fastForward(30 * 60 * 1000 + 1000);
  await g.waitForSelector('#reveal[open]', { timeout: 8000 });
  await g.waitForTimeout(500);
  await g.screenshot({ path: `${out}/11-reveal.png` });
  assert.match(await text(g, '#reveal-note'), /device/);
  assert.match(await text(g, '#live'), /You caught a|Break started/);
  await g.click('#reveal [data-close]');
  await g.waitForFunction(() => document.querySelector('#mode').textContent === 'Break', null, { timeout: 8000 });
  const saved = await g.evaluate(() => JSON.parse(localStorage.getItem('fish.guest')));
  assert.equal(saved.length, 1);
  await g.clock.fastForward(5 * 60 * 1000 + 1000);
  await g.waitForFunction(() => document.querySelector('#mode').textContent === 'Ready to fish', null, { timeout: 5000 });
  assert.equal(await text(g, '#round'), 'Round 2 of 4');
});
await step('guest fish appear in the Tackle Box with alt text, and survive reload', async () => {
  await g.reload();
  await g.waitForTimeout(300);
  await g.click('[data-open=tackle]');
  await g.waitForSelector('#tackle-list img');
  assert.match(await g.locator('#tackle-list img').first().getAttribute('alt'), /Pixel art of a/);
  await g.locator('#tackle [data-close]').click();
});
await step('guest timer survives a reload, and pause holds', async () => {
  await g.click('#go');
  await g.waitForTimeout(400);
  await g.click('#go');
  const paused = await text(g, '#time');
  await g.reload();
  await g.waitForTimeout(400);
  assert.equal(await text(g, '#mode'), 'Paused');
  assert.equal(await text(g, '#time'), paused);
  await g.click('#stop');
  await g.waitForFunction(() => document.querySelector('#mode').textContent === 'Ready to fish');
});
await gc.close();

// --- Account flow ---
const { ctx: ac, page: a } = await open();
await a.click('#cookies-essential');
await step('signup blocks under-16s, and blocks a quick retry', async () => {
  await a.click('#account-button');
  const f = a.locator('#form-signup');
  await f.locator('[name=email]').fill('kid@example.com');
  await f.locator('[name=password]').fill(PW);
  await f.locator('[name=birthMonth]').selectOption('1');
  await f.locator('[name=birthYear]').selectOption('2015');
  await f.locator('[name=consent]').check();
  await f.locator('button').click();
  await a.waitForSelector('#signup-blocked:not([hidden])');
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 0);
  await a.evaluate(() => sessionStorage.clear());
  await a.reload();
  await a.waitForTimeout(200);
});
await step('consent box is unticked by default, and is required', async () => {
  await a.click('#account-button');
  const f = a.locator('#form-signup');
  assert.equal(await f.locator('[name=consent]').isChecked(), false);
  assert.equal(await f.locator('[name=birthYear]').inputValue(), '');
  await f.locator('[name=email]').fill('angler@example.com');
  await f.locator('[name=password]').fill(PW);
  await f.locator('[name=birthMonth]').selectOption('5');
  await f.locator('[name=birthYear]').selectOption('1990');
  await f.locator('button').click();
  await a.waitForTimeout(150);
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 0);
  await f.locator('[name=consent]').check();
  await a.fill('#form-signup [name=password]', 'password1234');
  assert.match(await text(a, '#signup-hint'), /too common/);
  await a.fill('#form-signup [name=password]', PW);
  await f.locator('button').click();
  await a.waitForFunction(() => /Check your email/.test(document.querySelector('#account-msg').textContent));
  assert.equal(mails.length, 1);
});
await step('email link verifies, and its token leaves the address bar', async () => {
  const link = mails[0].text.match(/http\S+#verify=\S+/)[0];
  await a.goto('about:blank');
  await a.goto(link);
  await a.waitForSelector('#form-verify:not([hidden])');
  assert.ok(!a.url().includes('verify'));
  await a.fill('#form-verify [name=password]', 'not-the-right-password');
  await a.locator('#form-verify button').click();
  await a.waitForFunction(() => /doesn't match/.test(document.querySelector('#account-msg').textContent));
  await a.fill('#form-verify [name=password]', PW);
  await a.locator('#form-verify button').click();
  await a.waitForFunction(() => /Email confirmed/.test(document.querySelector('#account-msg').textContent));
});
await step('sign in; the cookie is HttpOnly and storage holds no token', async () => {
  const f = a.locator('#form-login');
  await f.locator('[name=email]').fill('angler@example.com');
  await f.locator('[name=password]').fill(PW);
  await f.locator('button').first().click();
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Account');
  const [cookie] = (await ac.cookies()).filter((c) => c.name === 'sid');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Strict');
  const seen = await a.evaluate(() => document.cookie + JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  assert.ok(!seen.includes(cookie.value));
});
await step('server-side focus: full catch is saved, and survives a reload mid-session', async () => {
  await a.check('input[name=focus][value="15"]', { force: true });
  await a.waitForTimeout(500);
  await a.click('#go');
  await a.waitForFunction(() => document.querySelector('#mode').textContent === 'Focus');
  await a.reload();
  await a.waitForTimeout(150);
  assert.equal(await text(a, '#mode'), 'Focus');
  await a.waitForSelector('#reveal[open]', { timeout: 6000 });
  assert.match(await text(a, '#reveal-note'), /account/);
  assert.equal(db.get('SELECT COUNT(*) n FROM catches').n, 1);
  await a.click('#reveal [data-close]');
  await a.click('[data-open=tackle]');
  await a.waitForSelector('#tackle-list img');
  await a.waitForTimeout(100);
  await a.screenshot({ path: `${out}/12-tackle.png` });
  await a.locator('#tackle [data-close]').click();
  await a.waitForFunction(() => document.querySelector('#stop').textContent === 'Skip break', null, { timeout: 8000 });
  await a.click('#stop');
  assert.equal(await text(a, '#mode'), 'Ready to fish');
});
await step('a forged early claim from the browser console is rejected', async () => {
  const status = await a.evaluate(async () => {
    await fetch('/api/focus/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"minutes":60}' });
    const r = await fetch('/api/focus/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"rarity":"cosmic"}' });
    await fetch('/api/focus/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return r.status;
  });
  assert.equal(status, 409);
});
await step('customizing saves to the account and follows a new device', async () => {
  await a.click('[data-open=customize]');
  await a.selectOption('#pick-sky', 'cosmic');
  await a.locator('input[name=angler][value=frog]').check();
  await a.locator('input[name=scene][value=island]').check();
  await a.locator('input[name=layout][value=handheld]').check();
  await a.waitForTimeout(600);
  await a.screenshot({ path: `${out}/13-customize.png` });
  await a.locator('#customize [data-close]').click();
  await a.waitForTimeout(100);
  await a.screenshot({ path: `${out}/14-handheld.png` });
  await a.reload();
  await a.waitForTimeout(300);
  assert.equal(await a.evaluate(() => document.body.dataset.layout), 'handheld');
  assert.equal(await a.locator('#pick-sky').inputValue(), 'cosmic');
  assert.ok(!(await a.evaluate(() => Object.keys(localStorage))).includes('fish.prefs'));
});
await step('full-screen layout has no scrolling or overlap at desktop size', async () => {
  await a.evaluate(() => document.querySelector('input[name=layout][value=full]').click());
  await a.waitForTimeout(200);
  await a.screenshot({ path: `${out}/15-full.png` });
  const over = await a.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(over, false);
});
let tfaKey, recovery, recovery2, recovery3;
await step('2FA: enable through the UI, recovery codes appear once', async () => {
  await a.evaluate(() => document.querySelector('input[name=layout][value=hero]').click());
  await a.click('#account-button');
  await a.fill('#form-tfa-setup [name=password]', PW);
  await a.locator('#form-tfa-setup button').click();
  await a.waitForSelector('#tfa-enroll:not([hidden])');
  assert.match(await a.locator('#tfa-qr').getAttribute('src'), /^data:image\/gif/);
  assert.ok(await a.locator('#tfa-qr').getAttribute('alt'));
  tfaKey = await text(a, '#tfa-key');
  await a.screenshot({ path: `${out}/16-account.png` });
});
const secretBytes = (k) => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of k) bits += chars.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); };
const totp = () => totpCode(secretBytes(tfaKey), Math.floor(Date.now() / 30000));
await step('2FA: confirm, then sign-in asks for the code', async () => {
  await a.fill('#form-tfa-enable [name=code]', totp());
  await a.locator('#form-tfa-enable button').click();
  await a.waitForSelector('#tfa-codes:not([hidden])');
  assert.equal(await a.locator('#tfa-code-list li').count(), 8);
  [recovery, recovery2, recovery3] = await a.locator('#tfa-code-list li').allInnerTexts();
  await a.click('#logout');
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Sign in');
  await a.click('#account-button');
  await a.fill('#form-login [name=email]', 'angler@example.com');
  await a.fill('#form-login [name=password]', PW);
  await a.locator('#form-login button').first().click();
  await a.waitForSelector('#login-code:not([hidden])');
  assert.equal(db.get('SELECT COUNT(*) n FROM recovery').n, 8);
  await a.fill('#login-code input', '000000');
  await a.locator('#form-login button').first().click();
  await a.waitForFunction(() => /did not work/.test(document.querySelector('#account-msg').textContent));
  await a.fill('#login-code input', recovery);
  await a.locator('#form-login button').first().click();
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Account');
  assert.equal(db.get('SELECT COUNT(*) n FROM recovery').n, 7);
});
await step('no tip link or supporter badge anywhere in the page', async () => {
  assert.equal(await a.locator('#tip-section, #tip-link, #foot-tip, #user-supporter').count(), 0);
  assert.ok(!/\btip\b|stripe|supporter/i.test(await a.evaluate(() => document.body.textContent)));
});
await step('download my data returns only this account, with no secrets', async () => {
  const data = await a.evaluate(async () => { const r = await fetch('/api/export'); return { type: r.headers.get('content-disposition'), body: await r.json() }; });
  assert.match(data.type, /attachment/);
  assert.equal(data.body.account.email, 'angler@example.com');
  assert.ok(data.body.catches.length >= 1);
  assert.ok(!/pw_hash|totp_secret|argon2/.test(JSON.stringify(data.body)));
});
await step('session expiry mid-use shows a visible message and recovers', async () => {
  db.run('DELETE FROM sessions');
  await a.click('#go');
  await a.waitForFunction(() => /sign in/i.test(document.querySelector('#notice').textContent));
  await a.waitForTimeout(600);
  assert.match(await text(a, '#notice'), /sign in/i, 'the message must outlive the next timer tick');
  await a.reload();
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Sign in');
  await a.click('#account-button');
  await a.fill('#form-login [name=email]', 'angler@example.com');
  await a.fill('#form-login [name=password]', PW);
  await a.fill('#login-code input', recovery2).catch(() => {});
  await a.locator('#form-login button').first().click();
  await a.waitForSelector('#login-code:not([hidden])');
  await a.fill('#login-code input', recovery2);
  await a.locator('#form-login button').first().click();
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Account');
});
await step('delete account through the UI: needs password and 2FA, then wipes all rows', async () => {
  await a.click('#account-button');
  await a.fill('#form-delete [name=password]', 'wrong-password');
  await a.fill('#form-delete [name=code]', recovery3);
  await a.locator('#form-delete button').click();
  await a.waitForFunction(() => /incorrect/.test(document.querySelector('#account-msg').textContent));
  assert.equal(db.get('SELECT COUNT(*) n FROM users').n, 1);
  await a.fill('#form-delete [name=password]', PW);
  await a.fill('#form-delete [name=code]', recovery3);
  await a.locator('#form-delete button').click();
  await a.waitForFunction(() => /deleted/.test(document.querySelector('#account-msg').textContent));
  for (const t of ['users', 'sessions', 'catches', 'focus', 'tokens', 'recovery']) assert.equal(db.get(`SELECT COUNT(*) n FROM ${t}`).n, 0, t);
  assert.equal((await ac.cookies()).filter((c) => c.name === 'sid').length, 0);
});
await step('a reset link works while signed in, and signs you out', async () => {
  await a.reload();
  db.run('DELETE FROM attempts');
  await a.evaluate(() => sessionStorage.clear());
  await a.reload();
  await a.click('#account-button');
  const signup = a.locator('#form-signup');
  await signup.locator('[name=email]').fill('second@example.com');
  await signup.locator('[name=password]').fill(PW);
  await signup.locator('[name=birthMonth]').selectOption('5');
  await signup.locator('[name=birthYear]').selectOption('1990');
  await signup.locator('[name=consent]').check();
  await signup.locator('button').click();
  await a.waitForFunction(() => /Check your email/.test(document.querySelector('#account-msg').textContent));
  await a.goto('about:blank');
  await a.goto(mails.at(-1).text.match(/http\S+#verify=\S+/)[0]);
  await a.fill('#form-verify [name=password]', PW);
  await a.locator('#form-verify button').click();
  await a.waitForFunction(() => /Email confirmed/.test(document.querySelector('#account-msg').textContent));
  await a.fill('#form-login [name=email]', 'second@example.com');
  await a.fill('#form-login [name=password]', PW);
  await a.locator('#form-login button').first().click();
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Account');
  // Request a reset, then open its link while still signed in.
  const res = await fetch('http://localhost:4173/api/forgot', { method: 'POST', headers: { 'content-type': 'application/json', origin: config.origin }, body: JSON.stringify({ email: 'second@example.com' }) });
  assert.equal(res.status, 200);
  await a.goto('about:blank');
  await a.goto(mails.at(-1).text.match(/http\S+#reset=\S+/)[0]);
  await a.waitForSelector('#form-reset:not([hidden])');
  assert.equal(await a.locator('#view-user').isVisible(), false);
  const next = 'another-calm-lake-77';
  await a.fill('#form-reset [name=password]', next);
  await a.locator('#form-reset button').click();
  await a.waitForFunction(() => /Password updated/.test(document.querySelector('#account-msg').textContent));
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Sign in');
  assert.equal(await a.locator('#form-login').isVisible(), true);
  assert.equal(db.get('SELECT COUNT(*) n FROM sessions').n, 0);
  await a.fill('#form-login [name=email]', 'second@example.com');
  await a.fill('#form-login [name=password]', next);
  await a.locator('#form-login button').first().click();
  await a.waitForFunction(() => document.querySelector('#account-button').textContent === 'Account');
});
await ac.close();

// --- Second account: deletion, and a keyboard-only pass ---
const { ctx: kc, page: k } = await open();
await step('keyboard only: skip link, tab order, start, dialogs, Escape', async () => {
  await k.click('#cookies-essential');
  await k.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await k.reload();
  await k.waitForTimeout(200);
  // Safari's Tab skips links by default; Option+Tab is how its keyboard users reach them.
  await k.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
  assert.ok(await k.evaluate(() => document.activeElement.classList.contains('skip')), 'the skip link is the first stop');
  assert.ok((await k.evaluate(() => document.activeElement.getBoundingClientRect().top)) >= 0);
  await k.keyboard.press('Enter');
  await k.waitForTimeout(50);
  assert.equal(await k.evaluate(() => location.hash), '#controls');
  assert.equal(await k.evaluate(() => document.activeElement.id), 'controls', 'focus lands on the controls');
  const seen = [];
  for (let i = 0; i < 6; i++) { await k.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab'); seen.push(await k.evaluate(() => { const a = document.activeElement; return a.id || a.name || a.textContent; })); }
  assert.ok(seen.includes('go'), `tab order: ${seen}`);
  await k.focus('#go');
  await k.keyboard.press('Enter');
  await k.waitForFunction(() => document.querySelector('#mode').textContent === 'Focus');
  await k.keyboard.press('Space');
  await k.waitForFunction(() => document.querySelector('#mode').textContent === 'Paused');
  await k.focus('[data-open=guide]');
  await k.keyboard.press('Enter');
  assert.equal(await k.locator('#guide').evaluate((d) => d.open), true);
  assert.ok(await k.evaluate(() => document.querySelector('#guide').contains(document.activeElement)), 'focus moves into the dialog');
  await k.screenshot({ path: `${out}/17-guide.png` });
  await k.keyboard.press('Escape');
  assert.equal(await k.locator('#guide').evaluate((d) => d.open), false);
  assert.match(await k.evaluate(() => document.activeElement.textContent), /Guide/, 'focus returns to the opener');
});
await step('every control has an accessible name, and images have alt', async () => {
  const bad = await k.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a[href], input, select').forEach((n) => {
      const labelled = n.textContent.trim() || n.getAttribute('aria-label') || (n.labels && n.labels.length) || n.title;
      if (!labelled) out.push(n.outerHTML.slice(0, 80));
    });
    document.querySelectorAll('img').forEach((n) => { if (!n.hasAttribute('alt')) out.push(n.outerHTML.slice(0, 80)); });
    document.querySelectorAll('canvas').forEach((n) => { if (n.getAttribute('role') !== 'img') out.push(n.id); });
    return out;
  });
  assert.deepEqual(bad, []);
});
await kc.close();

// --- Reduced motion, phone widths, all layouts ---
await step('reduced motion: scene is static, and a catch still completes', async () => {
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.click('#cookies-essential');
  const a1 = await page.locator('#world').screenshot();
  await page.waitForTimeout(700);
  const a2 = await page.locator('#world').screenshot();
  assert.ok(a1.equals(a2), 'world stays still');
  await page.clock.install();
  await page.clock.resume();
  await page.click('#go');
  await page.waitForTimeout(150);
  await page.clock.fastForward(30 * 60 * 1000 + 1000);
  await page.waitForSelector('#reveal[open]', { timeout: 8000 });
  await ctx.close();
});
for (const layout of ['hero', 'full', 'handheld']) {
  for (const [w, h] of [[390, 844], [320, 640], [844, 390]]) {
    await step(`${layout} at ${w}x${h}: no sideways scroll, controls reachable`, async () => {
      const { ctx, page } = await open({ viewport: { width: w, height: h } });
      await page.click('#cookies-essential');
      await page.evaluate((l) => document.querySelector(`input[name=layout][value=${l}]`).click(), layout);
      await page.waitForTimeout(150);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(scroll <= 0, `overflow ${scroll}px`);
      await page.locator('#go').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#go').isVisible());
      const box = await page.locator('#go').boundingBox();
      assert.ok(box.height >= 44);
      const onTop = await page.evaluate(() => { const r = document.querySelector('#go').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e.id === 'go' || !!e.closest('#go')); });
      assert.ok(onTop, 'start button is covered');
      await page.screenshot({ path: `${out}/20-${layout}-${w}.png` });
      await ctx.close();
    });
  }
}
await step('fast test timer: a guest catch completes in real time when the server enables it', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await page.click('#cookies-essential');
  await page.waitForFunction(() => /fast test timer/.test(document.querySelector('#round').textContent));
  await page.click('#go');
  await page.waitForSelector('#reveal[open]', { timeout: 10000 });
  await ctx.close();
});
await step('a city sky changes with the clock, even while the page stays open', async () => {
  const { ctx, page } = await open();
  await page.click('#cookies-essential');
  const pick = (v) => page.evaluate((x) => { const s = document.querySelector('#pick-sky'); s.value = x; s.dispatchEvent(new Event('change')); }, v);
  const plate = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--plate'));
  await page.clock.install({ time: new Date('2026-06-15T16:59:30') });
  await page.clock.resume();
  await page.reload();
  await page.waitForTimeout(300);
  await pick('hongkong');
  await page.waitForTimeout(150);
  const afternoon = await plate();
  assert.equal(afternoon, '#fff4d6', 'daytime colours at 4:59 pm');
  await page.clock.fastForward(60 * 1000);
  await page.waitForFunction((before) => document.documentElement.style.getPropertyValue('--plate') !== before, afternoon, { timeout: 5000 });
  assert.equal(await plate(), '#2d1b3d', 'sunset colours at 5:00 pm, without a reload');
  await ctx.close();
});
await step('custom focus minutes: valid values apply and are remembered, bad ones are refused', async () => {
  const { ctx, page } = await open();
  await page.click('#cookies-allow');
  assert.equal(await text(page, '#time'), '30:00', 'the default is 30 minutes');
  await page.fill('#focus-custom', '37');
  await page.locator('#focus-custom').blur();
  assert.equal(await text(page, '#time'), '37:00');
  assert.equal(await page.locator('input[name=focus]:checked').count(), 0);
  await page.fill('#focus-custom', '2');
  await page.locator('#focus-custom').blur();
  assert.match(await text(page, '#notice'), /5 to 180/);
  assert.equal(await page.inputValue('#focus-custom'), '37', 'a bad value is undone');
  await page.reload();
  await page.waitForTimeout(250);
  assert.equal(await text(page, '#time'), '37:00', 'remembered after reload');
  await page.check('input[name=focus][value="45"]', { force: true });
  assert.equal(await page.inputValue('#focus-custom'), '');
  await page.click('#go');
  await page.waitForFunction(() => document.querySelector('#mode').textContent === 'Focus');
  assert.equal(await page.locator('#focus-custom').isDisabled(), true, 'locked while a session runs');
  await ctx.close();
});
await step('panels collapse by mouse and keyboard, are remembered, and legal links stay reachable', async () => {
  const { ctx, page } = await open();
  await page.click('#cookies-allow');
  for (const layout of ['hero', 'full', 'handheld']) {
    await page.evaluate((l) => document.querySelector(`input[name=layout][value=${l}]`).click(), layout);
    const boxes = await page.evaluate(() => ['#controls', 'footer', '#clock'].map((s) => document.querySelector(s).getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
    const overlap = ([a, b, c, d], [e, f, g, h]) => a < g && e < c && b < h && f < d;
    assert.ok(!overlap(boxes[0], boxes[1]) && !overlap(boxes[1], boxes[2]) && !overlap(boxes[0], boxes[2]), `${layout}: open panels and the clock must not overlap`);
    await page.click('#controls-panel summary');
    await page.click('#footer-panel summary');
    assert.equal(await page.locator('#go').isVisible(), false, `${layout}: controls hidden`);
    assert.equal(await page.locator('a[href="/legal/privacy.html"]').first().isVisible(), false, `${layout}: footer hidden`);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/50-collapsed-${layout}.png` });
    assert.ok(await page.locator('#footer-panel summary').isVisible(), `${layout}: legal toggle still visible`);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${layout}: no sideways scroll`);
    await page.locator('#footer-panel summary').focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('a[href="/legal/privacy.html"]').first().isVisible(), `${layout}: legal links reopen by keyboard`);
    await page.click('#controls-panel summary');
    assert.ok(await page.locator('#go').isVisible(), `${layout}: controls reopen`);
  }
  await page.click('#controls-panel summary');
  await page.waitForTimeout(80);
  await page.reload();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.querySelector('#controls-panel').open), false, 'remembered after reload');
  await page.evaluate(() => { const i = document.querySelector('#focus-custom'); i.value = '2'; i.dispatchEvent(new Event('change')); });
  assert.equal(await page.evaluate(() => document.querySelector('#controls-panel').open), true, 'a message reopens the panel');
  await ctx.close();
});
await step('every sound effect runs through WebAudio without errors, and respects mute', async () => {
  const { ctx, page } = await open();
  const counts = await page.evaluate(async () => {
    let started = 0;
    const real = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a) { started++; return real.apply(this, a); };
    const { sfx, unlockAudio, setSound } = await import('/sfx.js');
    unlockAudio();
    const out = {};
    for (const name of ['cast', 'splash', 'reel', 'focusEnd', 'breakStart', 'breakEnd']) { started = 0; sfx[name](); out[name] = started; }
    for (let i = 0; i < 7; i++) { started = 0; sfx.reveal(i); out[`reveal${i}`] = started; }
    let gain = null;
    const realConnect = GainNode.prototype.connect;
    GainNode.prototype.connect = function (d, ...r) { if (d instanceof AudioDestinationNode) gain = this; return realConnect.call(this, d, ...r); };
    return out;
  });
  assert.ok(counts.cast > 0 && counts.splash > 0 && counts.reel > 0 && counts.focusEnd > 0 && counts.breakStart > 0 && counts.breakEnd > 0, JSON.stringify(counts));
  for (let i = 1; i < 7; i++) assert.ok(counts[`reveal${i}`] >= counts[`reveal${i - 1}`], 'bigger fanfares for rarer fish');
  await ctx.close();
  const fresh = await browser.newContext();
  const m = await fresh.newPage();
  await m.addInitScript(() => {
    const realConnect = GainNode.prototype.connect;
    GainNode.prototype.connect = function (d, ...r) { if (d instanceof AudioDestinationNode) window.__master = this; return realConnect.call(this, d, ...r); };
  });
  await m.goto('http://localhost:4173/');
  await m.click('#cookies-essential');
  await m.waitForFunction(() => window.__master);
  assert.ok(await m.evaluate(() => window.__master.gain.value) > 0, 'audible by default');
  assert.equal(await m.evaluate(() => window.__master.context.state), 'running');
  await m.locator('#sound-on').uncheck();
  assert.equal(await m.evaluate(() => window.__master.gain.value), 0, 'mute silences the output');
  await m.locator('#sound-on').check();
  await m.locator('#volume').fill('20');
  await m.locator('#volume').dispatchEvent('change');
  const low = await m.evaluate(() => window.__master.gain.value);
  assert.ok(low > 0 && low < 0.2, `volume maps through: ${low}`);
  await fresh.close();
});
await step('capture reveal screenshots for all seven rarities', async () => {
  const { ctx, page } = await open({ viewport: { width: 760, height: 620 } });
  await page.click('#cookies-essential');
  await page.evaluate(() => {
    window.__real = crypto.getRandomValues;
  });
  await page.route('**/nothing', (r) => r.abort());
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'gold', 'black', 'cosmic'];
  const species = ['koi', 'manta', 'trout', 'anglerfish', 'swordfish', 'puffer', 'koi'];
  const sizes = ['small', 'medium', 'big', 'medium', 'huge', 'big', 'huge'];
  for (let i = 0; i < 7; i++) {
    await page.evaluate(async ({ rarity, species, size }) => {
      const { fishImage, drawFish } = await import('/sprites.js');
      const { fishName, rarityOf, sizeOf } = await import('/fish.js');
      const fish = { rarity, species, size, weight: 123 };
      const d = document.querySelector('#reveal');
      const c = document.querySelector('#reveal-fish').getContext('2d');
      const s = sizeOf(fish).scale;
      c.fillStyle = rarity === 'black' ? '#23232b' : rarity === 'cosmic' ? '#0b0620' : '#4a7fb0'; c.fillRect(0, 0, 120, 72);
      drawFish(c, fish, Math.round((120 - 18 * s) / 2), Math.round((72 - 10 * s) / 2), s, 1.1);
      document.querySelector('#reveal-name').textContent = fishName(fish);
      const [bg, fg] = rarityOf(fish).badge; const b = document.querySelector('#reveal-badge'); b.textContent = rarityOf(fish).name; b.style.background = bg; b.style.color = fg;
      if (!d.open) d.showModal();
    }, { rarity: rarities[i], species: species[i], size: sizes[i] });
    await page.waitForTimeout(60);
    await page.locator('#reveal').screenshot({ path: `${out}/40-${rarities[i]}.png` });
  }
  await ctx.close();
});
await step('edited browser storage cannot break the Tackle Box or timer, or inject markup', async () => {
  const { ctx, page } = await open();
  await page.click('#cookies-allow');
  await page.evaluate(() => {
    localStorage.setItem('fish.guest', JSON.stringify([{ rarity: 'nope' }, null, 7, { species: 'koi', rarity: 'gold', size: 'huge', weight: 5, caught_at: 1 }, { species: '<img src=x onerror=alert(1)>', rarity: 'gold', size: 'huge', weight: 5, caught_at: 1 }]));
    localStorage.setItem('fish.prefs', '{"sky":"<script>","layout":"\\"><img","volume":"loud"}');
    sessionStorage.setItem('fish.timer', '{"mode":"constructor","endsAt":"soon","left":null}');
  });
  await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await text(page, '#mode'), 'Ready to fish');
  await page.click('[data-open=tackle]');
  await page.waitForSelector('#tackle-list img');
  assert.equal(await page.locator('#tackle-list li').count(), 1);
  assert.equal(await page.evaluate(() => document.body.dataset.layout), 'hero');
  await ctx.close();
});
await step('customize sits beside the scene at desktop width', async () => {
  const { ctx, page } = await open();
  await page.click('#cookies-essential');
  await page.click('[data-open=customize]');
  const box = await page.locator('#customize').boundingBox();
  assert.ok(box.x + box.width > 1050 && box.x > 600, JSON.stringify(box));
  await ctx.close();
});
await step('accessibility scan (axe, WCAG 2.2 AA) finds nothing on any screen', async () => {
  const { ctx, page } = await open({ viewport: { width: 1100, height: 900 } });
  const violations = [];
  const scan = async (label) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    for (const v of r.violations) violations.push(`${label}: ${v.id} [${v.impact}] ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  };
  await scan('main with cookie banner');
  await page.click('#cookies-essential');
  const skies = await page.evaluate(async () => (await import('/themes.js')).SKY_IDS);
  for (const sky of skies) {
    await page.evaluate((v) => { const s = document.querySelector('#pick-sky'); s.value = v; s.dispatchEvent(new Event('change')); }, sky);
    await scan(`main, ${sky} sky`);
  }
  for (const sky of ['day', 'night', 'handheld']) {
    await page.evaluate((v) => { const s = document.querySelector('#pick-sky'); s.value = v; s.dispatchEvent(new Event('change')); }, sky);
    for (const name of ['tackle', 'customize', 'guide', 'account']) {
      await page.click(`[data-open=${name}]`);
      await page.waitForTimeout(40);
      await scan(`${name} dialog, ${sky} sky`);
      await page.evaluate((n) => document.querySelector(`#${n}`).close(), name);
    }
  }
  for (const layout of ['full', 'handheld']) {
    await page.evaluate((l) => document.querySelector(`input[name=layout][value=${l}]`).click(), layout);
    await scan(`main, ${layout} layout`);
  }
  for (const name of ['privacy', 'terms', 'refunds', 'cookies']) {
    await page.goto(`http://localhost:4173/legal/${name}.html`);
    await scan(`${name} page`);
  }
  await ctx.close();
  assert.deepEqual(violations, []);
});
await step('legal pages load with no CSP issues', async () => {
  const { ctx, page } = await open();
  for (const name of ['privacy', 'terms', 'refunds', 'cookies']) {
    await page.goto(`http://localhost:4173/legal/${name}.html`);
    assert.ok((await text(page, 'h1')).length > 3);
    assert.ok((await text(page, 'main')).includes('Test Operator') || name === 'x');
  }
  await page.screenshot({ path: `${out}/30-legal.png` });
  await ctx.close();
});
console.log(results.join('\n'));
console.log('\nbrowser problems:', problems.length ? problems : 'none');
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`${engine}: ${results.length - fails} of ${results.length} passed. Screenshots: ${out}`);
await browser.close();
server.close();
db.close();
process.exitCode = fails || problems.length ? 1 : 0;
