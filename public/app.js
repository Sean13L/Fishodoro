import { api, createAccount } from './account.js';
import { fishName, fishWeight, rarityOf, RARITIES, rollFish, SIZES, sizeOf, SPECIES } from './fish.js';
import { ANGLERS, cleanPrefs, FOCUS_MINUTES, isFocusLength, LAYOUTS, MAX_FOCUS, MIN_FOCUS, SCENES } from './options.js';
import { fanfareMs, setSound, sfx, unlockAudio } from './sfx.js';
import { drawFish, FISH_H, FISH_W, fishImage, RARITY_COLORS, rarityIndexOf, rect } from './sprites.js';
import { ADAPTIVE, PACKS, THEMES } from './themes.js';
import { createWorld } from './world.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
const announce = (text) => { $('#live').textContent = text; };
// Opens the panel too, so a message is never hidden inside a collapsed one.
const notice = (text) => { $('#notice').textContent = text; if (text) $('#controls-panel').open = true; };

// --- Storage: only what the visitor allowed. Everything is wrapped because storage can be blocked. ---
const CONSENT = 'fish.consent', PREFS = 'fish.prefs', GUEST_FISH = 'fish.guest', TIMER = 'fish.timer';
const local = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Keeps working from memory. */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* Nothing to remove. */ } },
};
const readJson = (text, fallback) => { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } };
const allowsPrefs = () => local.get(CONSENT) === 'prefs';

let prefs = cleanPrefs(allowsPrefs() ? readJson(local.get(PREFS), {}) : {});
// Stored data can be stale or edited, so anything the game can't draw is dropped.
const validFish = (f) => !!f && RARITIES.some((r) => r.id === f.rarity) && SIZES.some((s) => s.id === f.size) && SPECIES.some((s) => s.id === f.species)
  && Number.isFinite(f.weight) && Number.isFinite(f.caught_at);
const storedFish = allowsPrefs() ? readJson(local.get(GUEST_FISH), []) : [];
let guestFish = Array.isArray(storedFish) ? storedFish.filter(validFish) : [];

const world = createWorld($('#world'));

// --- Applying the player's look ---
function applyTheme() {
  const { ui } = world.theme();
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries({ page: ui.page, plate: ui.plate, ink: ui.ink, accent: ui.accent, 'accent-ink': ui.accentInk, edge: ui.edge, focus: ui.focus })) root.setProperty(`--${name}`, value);
}

function applyPrefs() {
  document.body.dataset.layout = prefs.layout;
  world.configure(prefs);
  world.refreshSky();
  applyTheme();
  setSound(prefs);
  $('#sound-on').checked = !prefs.muted;
  $('#volume').value = prefs.volume;
  $('#volume').disabled = prefs.muted;
  document.querySelectorAll('input[name=focus]').forEach((r) => { r.checked = Number(r.value) === prefs.focus; });
  $('#focus-custom').value = FOCUS_MINUTES.includes(prefs.focus) ? '' : prefs.focus;
  $('#pick-sky').value = prefs.sky;
  for (const key of ['angler', 'scene', 'layout']) document.querySelectorAll(`input[name=${key}]`).forEach((r) => { r.checked = r.value === prefs[key]; });
  describeWorld();
}

// Only on load and sign-in: panel clicks update prefs themselves, so other settings must not reset them.
function syncPanels() {
  $('#controls-panel').open = prefs.controlsOpen;
  $('#footer-panel').open = prefs.footerOpen;
}

let saveTimer;
function setPrefs(change) {
  prefs = cleanPrefs({ ...prefs, ...change });
  applyPrefs();
  if (account.user()) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api('/api/prefs', prefs).catch(() => announce('Your settings could not be saved.')), 400);
  } else if (allowsPrefs()) {
    local.set(PREFS, JSON.stringify(prefs));
  }
  if (S.mode === 'idle') render();
}

function describeWorld() {
  const name = (list, id) => list.find(([key]) => key === id)[1];
  const activity = { idle: 'waiting to cast', cast: 'casting a line', wait: 'watching the bobber', bite: 'feeling a bite', reel: 'reeling in a fish', reveal: 'holding up a fresh catch', break: 'taking a nap' }[world.state()];
  $('#world').setAttribute('aria-label', `Pixel art: ${name(ANGLERS, prefs.angler)} ${activity}. ${name(SCENES, prefs.scene)}, ${world.theme().name} sky.`);
}

// --- Timer. Modes: idle, focus, paused, reeling, stuck (claim failed), break, breakPaused ---
const S = { mode: 'idle', endsAt: 0, left: 0, minutes: prefs.focus, round: 1, startedAt: 0, spokenMinute: 0, fish: null };
let queue = [];
let minuteMs = 60000; // The server shortens this only under its local-only fast test timer.
const after = (ms, fn) => queue.push({ at: Date.now() + ms, fn });
const isBusy = () => S.mode !== 'idle';

const owner = () => (account.user() ? 'user' : 'guest');
function persistTimer() {
  try {
    sessionStorage.setItem(TIMER, JSON.stringify({ mode: S.mode, endsAt: S.endsAt, left: S.left, minutes: S.minutes, round: S.round, startedAt: S.startedAt, owner: owner() }));
  } catch { /* Timer still works, it just won't survive a reload. */ }
}
function loadTimer() {
  try {
    const saved = readJson(sessionStorage.getItem(TIMER), null);
    return saved && [saved.endsAt, saved.left, saved.minutes].every(Number.isFinite) && LABELS[saved.mode] ? saved : null;
  } catch { return null; }
}

const LABELS = {
  idle: ['Ready to fish', 'Start fishing'], focus: ['Focus', 'Pause'], paused: ['Paused', 'Resume'], reeling: ['Fish on!', 'Reeling…'],
  stuck: ['Fish on the line', 'Reel it in'], break: ['Break', 'Pause'], breakPaused: ['Break paused', 'Resume'],
};

const breakMinutes = () => (S.round === 4 ? 15 : S.minutes >= 45 ? 10 : 5);
const format = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function render() {
  const { mode } = S;
  const running = mode === 'focus' || mode === 'break';
  const left = running ? S.endsAt - Date.now() : mode === 'paused' || mode === 'breakPaused' ? S.left : mode === 'idle' ? prefs.focus * minuteMs : 0;
  const text = format(left);
  $('#time').textContent = text;
  $('#mode').textContent = LABELS[mode][0];
  $('#go').textContent = LABELS[mode][1];
  $('#go').disabled = mode === 'reeling';
  const stop = $('#stop');
  stop.hidden = mode === 'idle' || mode === 'reeling' || mode === 'stuck';
  stop.textContent = mode === 'break' || mode === 'breakPaused' ? 'Skip break' : 'Give up';
  $('#round').textContent = `Round ${S.round} of 4${minuteMs < 60000 ? ' (fast test timer)' : ''}`;
  document.querySelectorAll('input[name=focus]').forEach((r) => { r.disabled = mode !== 'idle'; });
  $('#focus-custom').disabled = mode !== 'idle';
  document.title = mode === 'idle' ? 'Fishodoro' : `${text} ${LABELS[mode][0]} · Fishodoro`;
}

function setMode(mode, worldState) {
  S.mode = mode;
  notice('');
  if (worldState) world.set(worldState);
  persistTimer();
  describeWorld();
  render();
}

async function startFocus() {
  $('#go').disabled = true;
  try {
    if (account.user()) {
      const { active } = await api('/api/focus/start', { minutes: prefs.focus });
      beginFocus(active.minutes, active.remainingMs, active.startedAt);
    } else {
      beginFocus(prefs.focus, prefs.focus * minuteMs, Date.now());
    }
    sfx.cast();
    announce(`Focus started: ${S.minutes} minutes.`);
  } catch (err) {
    notice(err.message);
    $('#go').disabled = false;
  }
}

function beginFocus(minutes, remainingMs, startedAt) {
  S.minutes = minutes;
  S.startedAt = startedAt;
  S.endsAt = Date.now() + remainingMs;
  S.spokenMinute = 0;
  setMode('focus', 'cast');
}

function finishFocus() {
  sfx.focusEnd();
  announce('Focus complete. You have a bite!');
  setMode('reeling', 'bite');
  claim();
}

// Claims at the moment the bite starts, so a reload during the animation can't lose the fish.
async function claim() {
  setMode('reeling');
  const started = Date.now();
  try {
    let fish;
    if (account.user()) {
      ({ fish } = await api('/api/focus/complete', {}));
    } else {
      fish = rollFish((n) => Math.floor(Math.random() * n));
      guestFish.unshift({ ...fish, caught_at: Date.now() });
      if (allowsPrefs()) local.set(GUEST_FISH, JSON.stringify(guestFish));
    }
    after(1300 - (Date.now() - started), () => {
      sfx.reel();
      world.set('reel', fish);
      describeWorld();
      after(1100, () => reveal(fish));
    });
  } catch (err) {
    if (err.status === 409) { after(err.data.retryAfterMs + 150, claim); return; }
    if (err.status === 404) { announce('This fish was already reeled in, maybe in another tab.'); toIdle(); return; }
    // Nothing is lost: the session stays claimable on the server for a day.
    setMode('stuck');
    notice(err.status === 401 ? 'Sign in to reel in your fish.' : err.message);
  }
}

function reveal(fish) {
  const tier = rarityIndexOf(fish);
  world.set('reveal', fish);
  describeWorld();
  sfx.reveal(tier);
  announce(`You caught a ${fishName(fish)}, ${fishWeight(fish)}.`);
  showRevealDialog(fish, tier);
  after(fanfareMs(tier) + 700, startBreak);
}

function startBreak() {
  const minutes = breakMinutes();
  S.endsAt = Date.now() + minutes * minuteMs;
  S.spokenMinute = 0;
  sfx.breakStart();
  announce(`Break started: ${minutes} minutes.`);
  setMode('break', 'break');
}

function finishBreak(silent = false) {
  if (!silent) { sfx.breakEnd(); announce('Break over. Ready for another cast?'); }
  S.round = S.round === 4 ? 1 : S.round + 1;
  toIdle();
}

function toIdle() {
  queue = [];
  setMode('idle', 'idle');
}

function pauseOrResume() {
  if (S.mode === 'focus' || S.mode === 'break') {
    S.left = S.endsAt - Date.now();
    setMode(S.mode === 'focus' ? 'paused' : 'breakPaused');
  } else {
    S.endsAt = Date.now() + S.left;
    setMode(S.mode === 'paused' ? 'focus' : 'break');
  }
}

$('#go').addEventListener('click', () => {
  unlockAudio();
  if (S.mode === 'idle') startFocus();
  else if (S.mode === 'stuck') claim();
  else pauseOrResume();
});

$('#stop').addEventListener('click', async () => {
  if (S.mode === 'break' || S.mode === 'breakPaused') { finishBreak(true); return; }
  if (!confirm('Stop this session? You won\'t get a fish for it.')) return;
  try {
    if (account.user()) await api('/api/focus/cancel', {});
    announce('Session stopped.');
    toIdle();
  } catch (err) { notice(err.message); }
});

let lastHour = new Date().getHours();
function tick() {
  const now = Date.now();
  const due = queue.filter((job) => job.at <= now);
  queue = queue.filter((job) => job.at > now);
  due.forEach((job) => job.fn());
  if (S.mode === 'focus' || S.mode === 'break') {
    const left = S.endsAt - now;
    if (left <= 0) { if (S.mode === 'focus') finishFocus(); else finishBreak(); return; }
    const minute = Math.ceil(left / minuteMs);
    if (minute !== S.spokenMinute) {
      if (S.spokenMinute && minute % 5 === 0) announce(`${minute} minutes left.`);
      S.spokenMinute = minute;
    }
  }
  render();
  if (prefs.sky === ADAPTIVE && new Date().getHours() !== lastHour) {
    lastHour = new Date().getHours();
    world.refreshSky();
    applyTheme();
    describeWorld();
  }
}

new Worker('/timer-worker.js').onmessage = tick;

// Picks the session back up after a reload, sign-in or returning later.
async function resume() {
  queue = [];
  const saved = loadTimer();
  const mine = saved?.owner === owner() ? saved : null;
  if (mine) S.round = [1, 2, 3, 4].includes(mine.round) ? mine.round : 1;
  if (account.user()) {
    let active = null;
    try { ({ active } = await api('/api/focus/active')); } catch { /* Falls through to idle. */ }
    if (active) {
      const same = mine && mine.startedAt === active.startedAt && (mine.mode === 'focus' || mine.mode === 'paused');
      S.minutes = active.minutes;
      S.startedAt = active.startedAt;
      S.spokenMinute = 0;
      S.endsAt = same && mine.mode === 'focus' ? Math.max(mine.endsAt, Date.now() + active.remainingMs) : Date.now() + active.remainingMs;
      if (same && mine.mode === 'paused') { S.left = mine.left; setMode('paused', 'wait'); }
      else setMode('focus', 'wait');
      return;
    }
  } else if (mine && (mine.mode === 'focus' || mine.mode === 'paused')) {
    Object.assign(S, { minutes: mine.minutes, startedAt: mine.startedAt, endsAt: mine.endsAt, left: mine.left, spokenMinute: 0 });
    setMode(mine.mode, 'wait');
    return;
  }
  if (mine && (mine.mode === 'break' || mine.mode === 'breakPaused')) {
    Object.assign(S, { minutes: mine.minutes, endsAt: mine.endsAt, left: mine.left, spokenMinute: 0 });
    setMode(mine.mode, 'break');
    return;
  }
  setMode('idle', 'idle');
}

// --- Reveal dialog ---
let revealRun = 0;
function showRevealDialog(fish, tier) {
  const dialog = $('#reveal');
  const size = sizeOf(fish);
  const [bg, fg] = rarityOf(fish).badge;
  const badge = $('#reveal-badge');
  $('#reveal-name').textContent = fishName(fish);
  badge.textContent = rarityOf(fish).name;
  badge.style.background = bg;
  badge.style.color = fg;
  $('#reveal-weight').textContent = fishWeight(fish);
  $('#reveal-note').textContent = account.user() ? 'Saved to your account.' : allowsPrefs() ? 'Saved on this device.' : 'Kept until you reload this page.';
  dialog.dataset.tier = tier;
  dialog.classList.remove('pop');
  void dialog.offsetWidth;
  dialog.classList.add('pop');
  $('#reveal-fish').setAttribute('aria-label', `${fishName(fish)}, ${fishWeight(fish)}`);
  if (!dialog.open) dialog.showModal();

  const canvas = $('#reveal-fish');
  const c = canvas.getContext('2d');
  const run = ++revealRun;
  const colors = RARITY_COLORS[fish.rarity];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const x = Math.round((canvas.width - FISH_W * size.scale) / 2);
  const y = Math.round((canvas.height - FISH_H * size.scale) / 2);
  const started = performance.now();
  const noise = (i, salt) => { const s = Math.sin(i * 91.7 + salt * 47.3) * 9631.17; return s - Math.floor(s); };
  (function frame(ms) {
    if (run !== revealRun || !dialog.open) return;
    const t = still ? 0 : (ms - started) / 1000;
    rect(c, 0, 0, canvas.width, canvas.height, tier === 5 ? '#23232b' : tier === 6 ? '#0b0620' : '#4a7fb0');
    if (!still) {
      for (let i = 0; i < 6 + tier * 8; i++) {
        const life = (t * (0.3 + noise(i, 1) * 0.4) + noise(i, 2)) % 1;
        const angle = noise(i, 3) * Math.PI * 2;
        rect(c, 60 + Math.cos(angle) * life * 62, 36 + Math.sin(angle) * life * 38, 1, 1, colors[i % colors.length]);
      }
    }
    drawFish(c, fish, x, y, size.scale, t);
    requestAnimationFrame(frame);
  })(started);
}

// --- Dialogs ---
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open]');
  if (opener) {
    const name = opener.dataset.open;
    if (name === 'tackle') openTackle();
    if (name === 'account') account.refresh();
    $(`#${name}`).showModal();
  }
  if (event.target.closest('[data-close]')) event.target.closest('dialog').close();
});

// --- Tackle Box ---
let tacklePage = [];
function fishCard(fish) {
  const [bg, fg] = rarityOf(fish).badge;
  const badge = el('span', { className: 'badge', textContent: rarityOf(fish).name });
  badge.style.background = bg;
  badge.style.color = fg;
  const when = new Date(fish.caught_at);
  return el('li', {},
    el('img', { src: fishImage(fish), alt: `Pixel art of a ${fishName(fish)}` }),
    el('strong', { textContent: fishName(fish) }),
    badge,
    el('span', { className: 'weight', textContent: fishWeight(fish) }),
    el('time', { dateTime: when.toISOString(), textContent: when.toLocaleDateString() }));
}

function fillFilter(counts) {
  const select = $('#tackle-filter');
  const value = select.value;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  select.replaceChildren(new Option(`All fish (${total})`, ''), ...RARITIES.map((r) => new Option(`${r.name} (${counts[r.id] ?? 0})`, r.id)));
  select.value = value;
}

async function loadTackle(more = false) {
  const list = $('#tackle-list');
  const rarity = $('#tackle-filter').value;
  const button = $('#tackle-more');
  if (!account.user()) {
    const counts = {};
    guestFish.forEach((f) => { counts[f.rarity] = (counts[f.rarity] ?? 0) + 1; });
    fillFilter(counts);
    const shown = guestFish.filter((f) => !rarity || f.rarity === rarity);
    list.replaceChildren(...shown.map(fishCard));
    button.hidden = true;
    $('#tackle-note').textContent = allowsPrefs()
      ? 'Guest fish stay on this device and can\'t be moved to an account.'
      : 'Guest fish last until you reload, because preferences aren\'t allowed on this device. They can\'t be moved to an account.';
    if (!shown.length) list.replaceChildren(el('li', { textContent: 'Nothing here yet. Finish a focus session to catch a fish.' }));
    return;
  }
  const before = more && tacklePage.length ? `&before=${tacklePage.at(-1).id}` : '';
  try {
    const { catches, counts, more: hasMore } = await api(`/api/catches?rarity=${encodeURIComponent(rarity)}${before}`);
    tacklePage = more ? [...tacklePage, ...catches] : catches;
    fillFilter(counts);
    $('#tackle-note').textContent = '';
    if (more) list.append(...catches.map(fishCard));
    else if (catches.length) list.replaceChildren(...catches.map(fishCard));
    else list.replaceChildren(el('li', { textContent: 'Nothing here yet. Finish a focus session to catch a fish.' }));
    button.hidden = !hasMore;
  } catch (err) {
    $('#tackle-note').textContent = err.message;
  }
}
const openTackle = () => loadTackle();
$('#tackle-filter').addEventListener('change', () => loadTackle());
$('#tackle-more').addEventListener('click', () => loadTackle(true));

// --- Customize ---
function radios(fieldsetId, name, list) {
  $(fieldsetId).append(...list.map(([id, label]) => {
    const input = el('input', { type: 'radio', name, value: id });
    input.addEventListener('change', () => setPrefs({ [name]: id }));
    return el('label', { className: 'choice' }, input, el('span', { textContent: label }));
  }));
}
radios('#pick-angler', 'angler', ANGLERS);
radios('#pick-scene', 'scene', SCENES);
radios('#pick-layout', 'layout', LAYOUTS);
const skySelect = $('#pick-sky');
skySelect.append(new Option("Adaptive (follows your device's clock)", ADAPTIVE));
for (const pack of PACKS) {
  const group = el('optgroup', { label: pack });
  group.append(...THEMES.filter((t) => t.pack === pack).map((t) => new Option(t.name, t.id)));
  skySelect.append(group);
}
skySelect.addEventListener('change', () => setPrefs({ sky: skySelect.value }));

document.querySelectorAll('input[name=focus]').forEach((r) => r.addEventListener('change', () => setPrefs({ focus: Number(r.value) })));
$('#focus-custom').addEventListener('change', (e) => {
  const minutes = Number(e.target.value);
  if (e.target.value !== '' && isFocusLength(minutes)) { setPrefs({ focus: minutes }); return; }
  if (e.target.value !== '') notice(`Use whole minutes from ${MIN_FOCUS} to ${MAX_FOCUS}.`);
  applyPrefs();
});
for (const [id, key] of [['#controls-panel', 'controlsOpen'], ['#footer-panel', 'footerOpen']]) {
  $(id).addEventListener('toggle', (e) => { if (prefs[key] !== e.target.open) setPrefs({ [key]: e.target.open }); });
}
$('#sound-on').addEventListener('change', (e) => { unlockAudio(); setPrefs({ muted: !e.target.checked }); });
$('#volume').addEventListener('change', (e) => { unlockAudio(); setPrefs({ volume: Number(e.target.value) }); sfx.breakEnd(); });
addEventListener('pointerdown', unlockAudio, { once: true });

// --- Guide (always shows the real table the game rolls from) ---
const percent = (odds) => `${odds / 100}%`;
const row = (...cells) => el('tr', {}, ...cells.map((text) => el('td', { textContent: text })));
$('#odds-rarity').append(...RARITIES.map((r) => row(r.name, percent(r.odds))));
$('#odds-size').append(...SIZES.map((s) => row(s.name, percent(s.odds), `${s.min / 10}–${s.max / 10} lb`)));
$('#odds-species').textContent = `${SPECIES.map((s) => s.name).join(', ')}. Each is equally likely.`;

// --- Cookie choices: both buttons look the same, and neither is pre-selected ---
function chooseCookies(choice) {
  local.set(CONSENT, choice);
  if (choice === 'prefs') {
    local.set(PREFS, JSON.stringify(prefs));
    local.set(GUEST_FISH, JSON.stringify(guestFish));
  } else {
    local.remove(PREFS);
    local.remove(GUEST_FISH);
  }
  $('#cookie-banner').hidden = true;
  announce(choice === 'prefs' ? 'Preferences allowed.' : 'Essential cookies only.');
}
$('#cookies-allow').addEventListener('click', () => chooseCookies('prefs'));
$('#cookies-essential').addEventListener('click', () => chooseCookies('essential'));
$('#cookie-settings').addEventListener('click', () => {
  $('#cookie-banner').hidden = false;
  $('#cookies-allow').focus();
});
$('#cookie-banner').hidden = !!local.get(CONSENT);

// --- Accounts ---
const account = createAccount({
  isBusy,
  announce,
  async onAuth(user) {
    if (user) {
      prefs = user.prefs;
      applyPrefs();
      syncPanels();
    }
    S.round = 1;
    await resume();
  },
});

// --- Start ---
applyPrefs();
syncPanels();
render();
(async function boot() {
  try {
    const { user, minuteMs: serverMinute } = await api('/api/me');
    minuteMs = serverMinute;
    account.setUser(user);
    if (user) { prefs = user.prefs; applyPrefs(); syncPanels(); }
  } catch {
    account.setUser(null);
    announce("Can't reach the server, so you're fishing as a guest for now.");
  }
  await resume();
  await account.handleLink();
})();
