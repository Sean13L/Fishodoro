import { passwordProblem } from './password.js';

const $ = (s) => document.querySelector(s);
const NOTE_KEY = 'fish.noSignup';

export async function api(path, body) {
  const options = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let res;
  try { res = await fetch(path, options); } catch { throw Object.assign(new Error("Can't reach the server. Check your connection and try again."), { status: 0, data: {} }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status, data });
  return data;
}

// hooks: onAuth(user) after sign-in or sign-out, isBusy() when a timer is running.
export function createAccount({ onAuth, isBusy, announce }) {
  const dialog = $('#account');
  const msg = $('#account-msg');
  let user = null;
  let resetToken = '';
  let verifyToken = '';

  const say = (text) => { msg.textContent = text; if (text) { msg.scrollIntoView({ block: 'nearest' }); announce(text); } };
  const formData = (form) => Object.fromEntries(new FormData(form));
  const show = (el, on) => { el.hidden = !on; };

  // Every form follows the same path: stop the browser submit, disable, call, report.
  function wire(selector, run) {
    const form = $(selector);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('button:not([type=button])');
      button.disabled = true;
      say('');
      try { await run(formData(form), form); } catch (err) { handleError(err, form); } finally { button.disabled = false; }
    });
  }

  function handleError(err, form) {
    if (err.data?.need2fa && form.id === 'form-login') show($('#login-code'), true);
    if (err.data?.underAge) {
      try { sessionStorage.setItem(NOTE_KEY, '1'); } catch { /* Only a soft block on retrying. */ }
      refresh();
    }
    if (err.status === 401 && err.message === 'Please sign in.') { setUser(null); onAuth(null); }
    say(err.message);
  }

  function liveHint(input, hint, emailInput) {
    input.addEventListener('input', () => { hint.textContent = passwordProblem(input.value, emailInput?.value ?? user?.email ?? '') ?? 'Looks good.'; });
  }

  function refresh() {
    const signedIn = !!user;
    show($('#view-guest'), !signedIn);
    show($('#view-user'), signedIn);
    show($('#guest-warning'), isBusy());
    let blocked = false;
    try { blocked = !!sessionStorage.getItem(NOTE_KEY); } catch { /* Storage may be unavailable. */ }
    show($('#form-signup'), !blocked);
    show($('#signup-blocked'), blocked);
    $('#account-button').textContent = signedIn ? 'Account' : 'Sign in';
    if (!signedIn) return;
    $('#user-email').textContent = user.email;
    $('#tfa-status').textContent = user.twoFactor ? '2FA is on.' : '2FA is off. It adds a code from an authenticator app when you sign in.';
    show($('#form-tfa-setup'), !user.twoFactor && $('#tfa-enroll').hidden);
    show($('#form-tfa-disable'), user.twoFactor);
    document.querySelectorAll('.tfa-only').forEach((el) => show(el, user.twoFactor));
  }

  const setUser = (next) => { user = next; refresh(); };

  // Fill the birth selects with no pre-selected answer, so the screen doesn't suggest an age.
  const month = $('[name=birthMonth]');
  const year = $('[name=birthYear]');
  month.add(new Option('Choose', ''));
  year.add(new Option('Choose', ''));
  for (let m = 1; m <= 12; m++) month.add(new Option(new Date(Date.UTC(2000, m - 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' }), String(m)));
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 110; y--) year.add(new Option(String(y), String(y)));

  liveHint($('#form-signup [name=password]'), $('#signup-hint'), $('#form-signup [name=email]'));
  liveHint($('#form-reset [name=password]'), $('#reset-hint'));

  wire('#form-login', async ({ email, password, code }, form) => {
    const { user: next } = await api('/api/login', { email, password, code: code || undefined });
    form.reset();
    show($('#login-code'), false);
    setUser(next);
    onAuth(next);
    dialog.close();
    announce('Signed in.');
  });

  wire('#form-signup', async ({ email, password, birthMonth, birthYear, consent }, form) => {
    const problem = passwordProblem(password, email);
    if (problem) { say(problem); return; }
    const { message } = await api('/api/signup', { email, password, birthMonth: Number(birthMonth), birthYear: Number(birthYear), consent: consent === 'on' });
    form.reset();
    $('#signup-hint').textContent = '';
    say(message);
  });

  wire('#form-forgot', async ({ email }, form) => {
    say((await api('/api/forgot', { email })).message);
    form.reset();
  });

  wire('#form-reset', async ({ password }, form) => {
    const { message } = await api('/api/reset', { token: resetToken, password });
    resetToken = '';
    form.reset();
    showGuestForm('#form-login');
    if (user) { setUser(null); onAuth(null); } // A reset ends every session, including this one.
    say(message);
  });

  wire('#form-verify', async ({ password }, form) => {
    const { message } = await api('/api/verify', { token: verifyToken, password });
    verifyToken = '';
    form.reset();
    showGuestForm('#form-login');
    say(message);
  });

  wire('#form-password', async ({ current, next, code }, form) => {
    say((await api('/api/password', { current, next, code })).message);
    form.reset();
  });

  wire('#form-tfa-setup', async ({ password }, form) => {
    const { key, qr } = await api('/api/2fa/setup', { password });
    $('#tfa-qr').src = qr;
    $('#tfa-key').textContent = key;
    form.reset();
    show(form, false);
    show($('#tfa-enroll'), true);
    show($('#tfa-codes'), false);
    $('#form-tfa-enable [name=code]').focus();
  });

  wire('#form-tfa-enable', async ({ code }, form) => {
    const { recoveryCodes } = await api('/api/2fa/enable', { code });
    $('#tfa-code-list').replaceChildren(...recoveryCodes.map((value) => {
      const li = document.createElement('li');
      li.textContent = value;
      return li;
    }));
    form.reset();
    show($('#tfa-enroll'), false);
    show($('#tfa-codes'), true);
    user = { ...user, twoFactor: true };
    refresh();
    say('2FA is on.');
  });

  wire('#form-tfa-disable', async ({ password, code }, form) => {
    say((await api('/api/2fa/disable', { password, code })).message);
    form.reset();
    show($('#tfa-codes'), false);
    user = { ...user, twoFactor: false };
    refresh();
  });

  wire('#form-delete', async ({ password, code }, form) => {
    const { message } = await api('/api/account/delete', { password, code });
    form.reset();
    setUser(null);
    onAuth(null);
    say(message);
  });

  $('#logout').addEventListener('click', async () => {
    try {
      await api('/api/logout', {});
      setUser(null);
      onAuth(null);
      dialog.close();
      announce('Signed out.');
    } catch (err) { say(err.message); }
  });

  $('#show-forgot').addEventListener('click', () => {
    show($('#form-forgot'), true);
    $('#form-forgot [name=email]').focus();
  });

  // A link can arrive while signed in, so its form is shown whichever view is active.
  function showGuestForm(selector) {
    show($('#view-guest'), true);
    show($('#view-user'), false);
    for (const id of ['#form-login', '#form-signup', '#form-forgot', '#form-reset', '#form-verify']) show($(id), false);
    show($(selector), true);
    if (selector === '#form-login') refresh();
    $(`${selector} input`).focus();
  }

  // Email links use the URL fragment, so tokens never reach server logs.
  async function handleLink() {
    const hash = location.hash.slice(1);
    const [key, value] = hash.split('=');
    if (!['verify', 'reset', 'forgot', 'account'].includes(key)) return;
    history.replaceState(null, '', location.pathname);
    dialog.showModal();
    if (key === 'verify') {
      verifyToken = value;
      showGuestForm('#form-verify');
    } else if (key === 'reset') {
      resetToken = value;
      showGuestForm('#form-reset');
    } else if (key === 'forgot' && !user) {
      show($('#form-forgot'), true);
    }
  }

  return { setUser, refresh, handleLink, user: () => user };
}
