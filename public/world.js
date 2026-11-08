import { drawCity } from './cities.js';
import { drawAngler, drawFish, FISH_H, FISH_W, pixelLine, RARITY_COLORS, rarityIndexOf, rect, RODS } from './sprites.js';
import { resolveSky } from './themes.js';
import { sfx } from './sfx.js';

export const W = 240;
export const H = 135;
const ROD = 32;
const rand = (i, salt = 0) => { const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return s - Math.floor(s); };
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => motionQuery.matches;

function dock(g, th, horizon) {
  const [top, side] = th.wood;
  rect(g, 0, horizon + 10, 92, 3, top);
  rect(g, 0, horizon + 13, 92, 2, side);
  for (let x = 0; x < 92; x += 6) rect(g, x, horizon + 10, 1, 3, side);
  for (const x of [6, 36, 66, 88]) { rect(g, x, horizon + 15, 3, 24, side); rect(g, x, horizon + 37, 3, 2, top); }
}

function tree(g, x, y, th) {
  rect(g, x + 4, y - 10, 3, 10, th.land[1]);
  for (const [dx, dy, w, h] of [[0, -22, 11, 6], [-2, -18, 15, 6], [-1, -13, 13, 4]]) rect(g, x + dx, y + dy, w, h, th.hill[1]);
  rect(g, x + 2, y - 21, 3, 3, th.hill[0]);
}

function riverbank(g, th, horizon) {
  const [grass, dirt] = th.land;
  for (let x = 0; x < 118; x++) {
    const top = horizon + 8 + Math.max(0, x - 94) * 0.9 + (x % 11 === 0 ? -1 : 0);
    rect(g, x, top, 1, H - top, dirt);
    rect(g, x, top, 1, 3, grass);
  }
  tree(g, 6, horizon + 9, th);
  // Tent
  for (let i = 0; i < 12; i++) rect(g, 38 - i, horizon - 4 + i, i * 2 + 1, 1, th.wood[0]);
  for (let i = 0; i < 6; i++) rect(g, 38 - Math.floor(i / 2), horizon + 2 + i, i + 1, 1, th.wood[1]);
}

function island(c, th, x, y) {
  const [grass, dirt] = th.land;
  rect(c, x, y, 76, 3, grass);
  for (let i = 0; i < 9; i++) rect(c, x + 2 + i * 3, y + 3 + i * 2, 72 - i * 6, 2, i % 3 ? dirt : th.wood[1]);
  rect(c, x + 68, y + 3, 3, 16, '#bfe6ff');
  tree(c, x + 6, y, th);
}

function boat(c, th, x, y, tilt) {
  const [top, side] = th.wood;
  for (let i = 0; i < 7; i++) {
    const inset = Math.floor(i * 0.9);
    rect(c, x + inset, y + i + Math.round(tilt * (i > 3 ? 0 : 1)), 50 - inset * 2, 1, i < 2 ? top : side);
  }
  rect(c, x - 1, y, 52, 1, top);
}

function campfire(c, x, y, t, lit) {
  rect(c, x - 3, y, 8, 2, '#5c3a21');
  const lick = still() ? 2 : 2 + Math.round(Math.abs(Math.sin(t * 9)) * 2);
  const size = lit ? 2 : 1;
  rect(c, x - size + 1, y - lick - size, size * 2 - 1, lick + size, '#ff8c2a');
  rect(c, x, y - lick, 1, lick, '#ffe066');
}

function blob(c, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) { const half = Math.round(Math.sqrt(r * r - y * y)); rect(c, cx - half, cy + y, half * 2 + 1, 1, color); }
}

// Bow on the left, so both sails stay behind the angler, who sits at the stern facing the bobber.
function sailboat(c, th, t, s, state, p) {
  const { y } = s;
  for (let i = 0; i < 8; i++) {
    const left = 22 + Math.round(i * i * 0.28);
    rect(c, left, y + i, 106 - Math.floor(i * 0.9) - left, 1, i === 0 ? th.wood[0] : i === 3 ? p.band : i < 3 ? p.hull : p.hullShade);
  }
  rect(c, 19, y - 1, 5, 1, p.hull);
  const mast = 50;
  for (let j = 0; j < 44; j++) { const w = Math.round(j * 0.5); rect(c, mast - w, y - 50 + j, w, 1, j % 11 === 10 ? p.sailShade : p.sail); } // Jib
  for (let j = 0; j < 42; j++) rect(c, mast + 2, y - 50 + j, Math.round(j * 0.45), 1, j % 10 === 9 ? p.sailShade : p.sail); // Mainsail
  rect(c, mast, y - 54, 2, 54, th.wood[1]);
  rect(c, mast + 2, y - 8, 20, 1, th.wood[1]); // Boom
  for (let i = 0; i < 6; i++) rect(c, mast + 2 + i, y - 55 + (still() ? 0 : Math.round(Math.sin(t * 7 - i * 0.8) * (i / 5))), 1, i < 4 ? 2 : 1, '#e53935');
}

// Wheelhouse at the back, angler on the low foredeck, smoke drifting off the stack.
function tugboat(c, th, t, s, state, p) {
  const { y } = s;
  for (let i = 0; i < 10; i++) {
    const left = 12 + Math.floor(i * 0.6);
    rect(c, left, y + i, 116 - Math.round(i * i * 0.16) - left, 1, i === 0 ? th.wood[0] : i < 5 ? p.red : i === 5 ? p.black : p.hullShade);
  }
  rect(c, 104, y - 3, 13, 3, p.red); rect(c, 104, y - 3, 13, 1, th.wood[0]); // Raised bow
  for (const x of [22, 42, 62, 82]) { rect(c, x, y + 2, 4, 4, '#1a1c2c'); rect(c, x + 1, y + 3, 2, 2, p.hullShade); } // Tyre fenders
  rect(c, 20, y - 9, 48, 9, p.hull); rect(c, 20, y - 10, 48, 1, th.wood[1]);
  for (const x of [25, 35, 45]) rect(c, x, y - 6, 3, 3, p.glass);
  rect(c, 61, y - 8, 5, 5, '#ff6a2a'); rect(c, 62, y - 7, 3, 3, p.hull); // Life ring
  rect(c, 28, y - 24, 30, 14, p.hull); rect(c, 26, y - 26, 34, 2, th.wood[1]);
  for (const x of [31, 39, 47]) rect(c, x, y - 21, 6, 5, p.glass);
  rect(c, 52, y - 34, 1, 8, th.wood[1]);
  const sweep = still() ? 4 : Math.round(Math.abs(Math.cos(t * 2)) * 4);
  rect(c, 52 - sweep, y - 35, sweep * 2 + 1, 1, p.black); // Radar
  rect(c, 36, y - 40, 8, 14, p.black); rect(c, 36, y - 38, 8, 3, p.red);
  for (let i = 0; i < 6; i++) {
    const life = still() ? i / 6 : (t * 0.3 + i / 6) % 1;
    c.globalAlpha = 0.75 * (1 - life);
    blob(c, 40 - life * 26, y - 43 - life * 28, Math.round(1 + life * 4), p.smoke);
  }
  c.globalAlpha = 1;
}

// A lashed log raft, with a lantern that lights up the water after dark.
function raft(c, th, t, s, state, p) {
  const { y } = s;
  const [top, side] = th.wood;
  if (p.dark) {
    const pulse = still() ? 0 : Math.sin(t * 9) * 0.03;
    c.globalAlpha = 0.12 + pulse; blob(c, 42, y - 21, 12, '#ffb04a');
    c.globalAlpha = 0.22 + pulse; blob(c, 42, y - 21, 6, '#ffb04a');
    c.globalAlpha = 0.4; for (let i = 0; i < 4; i++) rect(c, 41 - i, y + 9 + i * 2, 3 + i * 2, 1, '#ffb04a'); // Reflection
    c.globalAlpha = 1;
  }
  rect(c, 30, y, 74, 2, top);
  for (let x = 33; x < 104; x += 7) rect(c, x, y, 1, 2, side);
  for (let i = 0; i < 6; i++) { const inset = i === 0 || i === 5 ? 1 : 0; rect(c, 28 + inset, y + 2 + i, 78 - inset * 2, 1, i < 2 ? top : side); }
  for (let x = 36; x < 104; x += 9) rect(c, x, y + 4 + (x % 2), 4, 1, p.bark);
  rect(c, 105, y + 3, 3, 4, p.endGrain); rect(c, 106, y + 4, 1, 2, side);
  for (const x of [42, 70, 96]) rect(c, x, y + 1, 2, 7, p.rope);
  rect(c, 36, y - 28, 2, 28, side); rect(c, 36, y - 28, 8, 1, side); rect(c, 42, y - 27, 1, 2, '#1a1c2c');
  rect(c, 40, y - 25, 5, 7, '#1a1c2c');
  const flick = still() ? 0 : Math.max(0, Math.round(Math.sin(t * 11) + Math.sin(t * 7.3)));
  rect(c, 41, y - 24, 3, 5, '#ff8c2a');
  rect(c, 42, y - 23 + flick, 1, 3 - flick, '#ffe066');
  rect(c, 50, y - 6, 7, 6, p.bucket); rect(c, 50, y - 6, 7, 1, '#1a1c2c'); rect(c, 51, y - 3, 5, 1, p.bucketShade);
}

const lighthouseRock = (x, horizon) => {
  if (x < 46) return horizon - 4 + Math.round(Math.sin(x * 0.4) * 1.2);
  if (x < 60) return horizon - 4 + Math.round(((x - 46) * 10) / 14);
  if (x < 100) return horizon + 6 + (x % 9 === 0 ? -1 : 0);
  return horizon + 6 + Math.round((x - 100) * 0.9);
};

function lighthouse(g, th, horizon, p) {
  for (let x = 0; x < 118; x++) {
    const top = lighthouseRock(x, horizon);
    rect(g, x, top, 1, H - top, p.rock);
    rect(g, x, top, 1, 2, p.rockLight);
    for (let y = top + 3; y < H; y += 3) if (rand(x, y) < 0.18) rect(g, x, y, 2, 1, p.rockDark);
  }
  const base = horizon - 4, top = 24;
  for (let y = top; y < base; y++) {
    const half = Math.round(6 + ((y - top) / (base - top)) * 5);
    rect(g, 23 - half, y, half * 2 + 1, 1, Math.floor((y - top) / 8) % 2 ? p.band : p.hull);
    rect(g, 23 + half - 1, y, 2, 1, p.towerShade);
  }
  for (const y of [40, 58]) rect(g, 22, y, 3, 4, p.glass);
  rect(g, 21, base - 8, 5, 8, '#1a1c2c');
  rect(g, 18, 12, 11, 8, p.glass);
  for (const x of [18, 23, 28]) rect(g, x, 12, 1, 8, '#1a1c2c');
  rect(g, 14, 20, 19, 1, '#1a1c2c'); rect(g, 13, 22, 21, 2, '#1a1c2c');
  for (let x = 14; x < 33; x += 3) rect(g, x, 20, 1, 2, '#1a1c2c');
  for (let i = 0; i < 7; i++) rect(g, 23 - i, 5 + i, i * 2 + 1, 1, p.roof);
  rect(g, 23, 3, 1, 2, '#1a1c2c');
}

// After dark the lamp sweeps a beam across the sky. Waves break on the rocks either way.
function lighthouseFront(c, th, t, s, state, p) {
  if (p.dark) {
    const phase = t * 0.8;
    const reach = Math.cos(phase);
    const dir = reach < 0 ? -1 : 1;
    const length = Math.abs(reach) * 160;
    for (let d = 4; d < length; d++) {
      const half = 1 + Math.floor(d * 0.07);
      c.globalAlpha = 0.4 * (1 - d / 170);
      rect(c, 23 + dir * d, 16 - half, 1, half * 2 + 1, '#ffeaa0');
    }
    c.globalAlpha = Math.sin(phase) > 0.85 ? 0.5 : 0;
    blob(c, 23, 16, 6, '#fff3b0');
    c.globalAlpha = 1;
  }
  if (still()) return;
  const cycle = t / 3.2;
  const n = Math.floor(cycle);
  const k = (cycle - n) / 0.6;
  if (k > 1) return;
  for (let i = 0; i < 14; i++) {
    const vx = (rand(i, n) - 0.35) * 20 * p.sea;
    const vy = (14 + rand(i, n + 1) * 14) * p.sea;
    rect(c, 106 + vx * k, s.y + 4 - vy * k + 28 * k * k, 1, 1, i % 3 ? p.foam : '#ffffff');
  }
}

// horizon: y of the waterline. seat(t, sea): the angler's seat point, rocking harder on rough water. bobX: where the bobber lands.
const rock = (t, speed, amount, sea) => (still() ? 0 : Math.round(Math.sin(t * speed) * amount * sea));
const SCENES = {
  dock: { horizon: 78, hills: true, bobX: 176, seat: () => ({ x: 72, y: 88 }), still: dock },
  boat: {
    horizon: 72, hills: false, bobX: 182,
    seat: (t, sea) => ({ x: 60, y: 98 + rock(t, 1.4, 1.5, sea) }),
    front: (c, th, t, s) => boat(c, th, 46, s.y, 0),
  },
  river: {
    horizon: 76, hills: true, bobX: 180, waterFrom: 124, seat: () => ({ x: 78, y: 84 }), still: riverbank,
    front: (c, th, t, s, state) => campfire(c, 60, 84, t, state === 'break'),
  },
  island: {
    horizon: 108, hills: false, bobX: 170,
    seat: (t) => ({ x: 48, y: 72 + rock(t, 0.9, 1.5, 1) }),
    front: (c, th, t, s) => island(c, th, 14, s.y),
  },
  sailboat: { horizon: 70, hills: false, bobX: 184, seat: (t, sea) => ({ x: 74, y: 96 + rock(t, 1.1, 2, sea) }), front: sailboat },
  tugboat: { horizon: 74, hills: false, bobX: 192, seat: (t, sea) => ({ x: 86, y: 100 + rock(t, 0.8, 1.2, sea) }), front: tugboat },
  raft: { horizon: 76, hills: false, bobX: 180, seat: (t, sea) => ({ x: 62, y: 94 + rock(t, 1.7, 1.5, sea) }), front: raft },
  lighthouse: { horizon: 80, hills: false, bobX: 186, waterFrom: 100, seat: () => ({ x: 72, y: 86 }), still: lighthouse, front: lighthouseFront },
};

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, k) => `#${hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
const brightness = (hex) => { const [r, g, b] = hexRgb(hex); return r * 0.3 + g * 0.59 + b * 0.11; };

// Colours for boats, rocks and water effects, worked out once per sky. Painted things take on a little of the sky's colour.
function scenePalette(th) {
  const tint = (hex, k = 0.3) => mix(hex, th.sky[1], k);
  const fx = th.fx;
  return {
    dark: brightness(th.sky[0]) < 70,
    rainy: fx.includes('rain'),
    sea: fx.includes('lightning') ? 2 : fx.includes('rain') ? 1.5 : fx.includes('fog') || fx.includes('snow') ? 0.6 : 1,
    foam: mix(th.water[0], '#ffffff', 0.5),
    crestShade: mix(th.water[th.water.length - 1], '#000000', 0.15),
    deep: mix(th.water[th.water.length - 1], '#000000', 0.4),
    leaper: mix(th.water[th.water.length - 1], '#000000', 0.5),
    sail: tint('#f4efe2', 0.25), sailShade: tint('#d4ccb8'),
    hull: tint('#ece8de'), hullShade: tint('#8f8a80'), towerShade: tint('#9c978c'),
    band: tint('#c0392b', 0.25), red: tint('#b8322a', 0.25), black: tint('#26262e', 0.2), roof: tint('#7a1f1f', 0.2),
    glass: brightness(th.sky[0]) < 70 ? '#ffe9a8' : tint('#a8d8f0', 0.2),
    smoke: tint('#c9c9c9'),
    rock: tint('#6b6d75'), rockLight: tint('#8d8f96'), rockDark: tint('#45474e'),
    bark: mix(th.wood[1], '#000000', 0.25), endGrain: mix(th.wood[0], '#ffe9b0', 0.4), rope: tint('#e3d3a0'),
    bucket: tint('#8f9aa6'), bucketShade: tint('#6c7682'),
  };
}

function paintSky(g, th, horizon) {
  const bands = th.sky.length;
  const size = horizon / bands;
  th.sky.forEach((color, i) => {
    rect(g, 0, i * size, W, Math.ceil(size), color);
    if (!i) return;
    for (let x = 0; x < W; x += 2) { rect(g, x, i * size, 1, 1, th.sky[i - 1]); rect(g, x + 1, i * size + 2, 1, 1, th.sky[i - 1]); }
  });
}

function paintCelestial(g, th) {
  const cele = th.cele;
  if (!cele) return;
  const disc = (cx, cy, r, color) => {
    for (let y = -r; y <= r; y++) { const half = Math.round(Math.sqrt(r * r - y * y)); rect(g, cx - half, cy + y, half * 2 + 1, 1, color); }
  };
  const { x, y, color, kind } = cele;
  if (kind === 'sun') {
    if (cele.rays) for (let i = 0; i < 8; i++) pixelLine(g, x + Math.cos(i * 0.785) * 12, y + Math.sin(i * 0.785) * 12, x + Math.cos(i * 0.785) * 15, y + Math.sin(i * 0.785) * 15, color);
    disc(x, y, cele.stripes ? 16 : 8, color);
    if (cele.stripes) for (let i = 0; i < 4; i++) rect(g, x - 16, y + 3 + i * 3, 33, 1, th.sky[2]);
  } else if (kind === 'moon') {
    disc(x, y, cele.big ? 11 : 7, color);
    if (!cele.big) disc(x + 3, y - 2, 5, th.sky[0]);
    else { rect(g, x - 4, y - 3, 3, 2, '#a02020'); rect(g, x + 3, y + 3, 4, 3, '#a02020'); }
  } else if (kind === 'planet') {
    disc(x, y, 8, color);
    rect(g, x - 13, y, 27, 1, '#ffe0f5');
    rect(g, x - 3, y - 3, 3, 2, '#d868b8');
  } else if (kind === 'twin') {
    disc(x, y, 7, color);
    disc(x + 22, y + 8, 4, cele.second);
  }
}

function paintBackground(g, th, scene) {
  const { horizon } = scene;
  paintSky(g, th, horizon);
  if (th.fx.includes('rainbow')) {
    ['#e53935', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#7e57c2'].forEach((color, i) => {
      const r = 86 - i * 2;
      for (let a = 0; a < 3.2; a += 0.012) rect(g, 130 + Math.cos(a) * r, horizon + 6 - Math.sin(a) * r, 1, 1, color);
    });
  }
  if (th.fx.includes('volcano')) {
    for (let x = 0; x < 80; x++) rect(g, 150 + x, horizon - Math.min(x, 80 - x) * 0.8, 1, Math.min(x, 80 - x) * 0.8, th.hill[1]);
    rect(g, 184, horizon - 32, 12, 2, '#ff6a10');
    rect(g, 187, horizon - 34, 6, 2, '#ffd24d');
  }
  paintCelestial(g, th);
  const depth = H - horizon;
  th.water.forEach((color, i) => rect(g, 0, horizon + (i * depth) / th.water.length, W, Math.ceil(depth / th.water.length), color));
}

// In front of stars and clouds, so a star never shines through a hill or a building. Returns blinking tower lights.
function paintScenery(g, th, scene, pal) {
  const { horizon } = scene;
  g.clearRect(0, 0, W, H);
  const beacons = th.city ? drawCity(g, th, horizon) : [];
  if (scene.hills && !th.city) {
    for (let x = 0; x < W; x++) {
      const far = 13 + Math.sin(x * 0.03) * 7 + Math.sin(x * 0.07 + 1) * 3;
      const near = 6 + Math.sin(x * 0.05 + 2) * 4;
      rect(g, x, horizon - far, 1, far, th.hill[1]);
      rect(g, x, horizon - near, 1, near, th.hill[0]);
    }
  }
  scene.still?.(g, th, horizon, pal);
  return beacons;
}

function drawClouds(c, th, t, horizon) {
  if (!th.cloud) return;
  for (let i = 0; i < 4; i++) {
    const x = ((rand(i) * 300 + t * (2 + i)) % 300) - 40;
    const y = 8 + rand(i, 1) * Math.max(horizon - 50, 10);
    rect(c, x, y + 3, 28, 4, th.cloud);
    rect(c, x + 5, y, 16, 4, th.cloud);
    rect(c, x + 9, y - 2, 8, 2, th.cloud);
  }
}

// Weather falls in front of the scenery. Everything else stays behind it, up in the sky.
const WEATHER = new Set(['rain', 'snow', 'petals', 'leaves', 'embers', 'fireflies', 'fog', 'lightning']);

const FX = {
  clouds: drawClouds,
  stars(c, th, t, horizon) {
    for (let i = 0; i < 70; i++) {
      const twinkle = still() ? 1 : Math.sin(t * (1 + rand(i, 2) * 2) + i);
      if (twinkle > -0.5) rect(c, rand(i) * W, rand(i, 1) * (horizon - 3), 1, 1, i % 7 ? '#ffffff' : '#ffe9a8');
    }
  },
  nebula(c, th, t, horizon) {
    c.globalAlpha = 0.28;
    for (let i = 0; i < 26; i++) rect(c, 30 + rand(i, 5) * 130, 8 + rand(i, 6) * (horizon * 0.5), 8 + rand(i, 7) * 22, 2 + rand(i, 8) * 7, i % 2 ? '#ff6ad5' : '#6a7dff');
    c.globalAlpha = 1;
  },
  birds(c, th, t, horizon) {
    const color = '#1a1c2c';
    for (let i = 0; i < 3; i++) {
      const x = ((rand(i, 3) * 300 + t * 6) % 300) - 30;
      const y = horizon * 0.35 + i * 7;
      const flap = Math.sin(t * 6 + i) > 0 ? 1 : 0;
      rect(c, x - 2, y - flap, 2, 1, color);
      rect(c, x + 1, y - flap, 2, 1, color);
      rect(c, x, y, 1, 1, color);
    }
  },
  rain(c, th, t) {
    for (let i = 0; i < 80; i++) {
      const x = (rand(i) * 280 - t * 30) % 280;
      const y = (rand(i, 1) * H + t * 120) % H;
      const px = x < 0 ? x + 280 : x;
      rect(c, px, y, 1, 3, '#b8d4ec');
      rect(c, px - 1, y + 3, 1, 2, '#b8d4ec');
    }
  },
  snow(c, th, t) { drift(c, t, 60, 10, 12, ['#ffffff'], 1); },
  petals(c, th, t) { drift(c, t, 30, 8, 14, ['#ffb7d5', '#ffe0ec'], 2); },
  leaves(c, th, t) { drift(c, t, 24, 12, 15, ['#e0702a', '#f0b03a', '#b84a1f'], 2); },
  embers(c, th, t) {
    for (let i = 0; i < 36; i++) {
      const y = H - ((rand(i, 1) * H + t * (8 + rand(i, 3) * 10)) % H);
      rect(c, rand(i) * W + Math.sin(t + i) * 4, y, 1, 1, i % 3 ? '#ff8c2a' : '#ffd24d');
    }
  },
  fireflies(c, th, t, horizon) {
    for (let i = 0; i < 10; i++) {
      if (Math.sin(t * 2 + i * 3) > 0.2 || still()) rect(c, rand(i) * W + Math.sin(t * 0.5 + i) * 8, horizon - 16 + rand(i, 1) * 22 + Math.cos(t * 0.7 + i) * 3, 1, 1, '#e8ff7a');
    }
  },
  fog(c, th, t) {
    c.globalAlpha = 0.4;
    for (let i = 0; i < 7; i++) {
      const x = ((rand(i) * 340 + t * (2 + i)) % 340) - 100;
      rect(c, x, 30 + i * 15, 130 + rand(i, 2) * 80, 8, '#e8ecec');
    }
    c.globalAlpha = 1;
  },
  aurora(c, th, t, horizon) {
    c.globalAlpha = 0.5;
    for (let x = 0; x < W; x += 2) {
      const wave = Math.sin(x * 0.04 + (still() ? 0 : t * 0.6)) * 8 + Math.sin(x * 0.11 + 1) * 4;
      const top = horizon * 0.2 + wave;
      rect(c, x, top, 2, 20 + Math.sin(x * 0.07) * 8, x % 8 ? '#3dffb0' : '#8affd8');
      rect(c, x, top + 18, 2, 12, '#7a5cff');
    }
    c.globalAlpha = 1;
  },
  meteors(c, th, t, horizon) {
    const cycle = t / 3.1;
    const n = Math.floor(cycle);
    const life = cycle - n;
    if (still() || life > 0.3) return;
    const x = rand(n, 9) * W;
    const y = rand(n, 10) * horizon * 0.4;
    const k = life / 0.3;
    pixelLine(c, Math.round(x - k * 40), Math.round(y + k * 18), Math.round(x - k * 40 + 10), Math.round(y + k * 18 - 5), '#ffffff');
  },
  // One flash every 9 seconds stays well under the WCAG limit of three per second.
  lightning(c, th, t) {
    if (still() || t % 9 > 0.12) return;
    c.globalAlpha = 0.45;
    rect(c, 0, 0, W, H, '#ffffff');
    c.globalAlpha = 1;
    const seed = Math.floor(t / 9);
    let x = 40 + rand(seed) * 160;
    let y = 0;
    while (y < 70) { const nx = x + (rand(y, seed) - 0.5) * 18; pixelLine(c, Math.round(x), y, Math.round(nx), y + 10, '#ffffe0'); x = nx; y += 10; }
  },
};

function drift(c, t, count, fall, sway, colors, size) {
  for (let i = 0; i < count; i++) {
    const y = (rand(i, 1) * H + t * (fall + rand(i, 2) * fall)) % H;
    const x = (rand(i) * W + Math.sin(t * 0.8 + i) * sway + t * 4) % W;
    rect(c, x, y, size, size === 2 && i % 2 ? 1 : size, colors[i % colors.length]);
  }
}

const canvasBuffer = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

// Maps every pixel to the theme's limited palette by brightness, for the retro skies.
function applyRamp(c, ramp) {
  const parsed = ramp.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const image = c.getImageData(0, 0, W, H);
  const a = image.data;
  for (let i = 0; i < a.length; i += 4) {
    const [r, g, b] = parsed[Math.min(parsed.length - 1, Math.floor(((a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) / 256) * parsed.length))];
    a[i] = r; a[i + 1] = g; a[i + 2] = b;
  }
  c.putImageData(image, 0, 0);
}

const lerp = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));

export function createWorld(canvas) {
  const c = canvas.getContext('2d', { willReadFrequently: true });
  const bg = canvasBuffer(W, H);
  const bgc = bg.getContext('2d');
  const scenery = canvasBuffer(W, H);
  const sceneryC = scenery.getContext('2d');
  let beacons = [];
  c.imageSmoothingEnabled = false;
  let hat = 'none', face = 'none', rod = 'none';
  let angler = 'cat', scene = SCENES.dock, sceneId = 'dock', skyId = 'adaptive', skyTime = 'clock', theme = null, pal = null;
  let state = 'idle', since = 0, fish = null, playedSplash = true;

  function repaint() {
    theme = resolveSky(skyId, undefined, skyTime);
    pal = scenePalette(theme);
    paintBackground(bgc, theme, scene);
    beacons = paintScenery(sceneryC, theme, scene, pal);
  }

  // Sets the colour once for a whole batch of single pixels, given as flat [x, y, x, y, ...] pairs.
  const plot = (points, color) => { c.fillStyle = color; for (let i = 0; i < points.length; i += 2) c.fillRect(points[i], points[i + 1], 1, 1); };
  const ring = (cx, cy, r, color) => {
    const points = [];
    const steps = Math.max(8, Math.round(r * 4));
    for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; points.push(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.35)); }
    plot(points, color);
  };

  // A point on open water, clear of the boats on the left and of the bobber, with room for something `margin` wide.
  function openSpot(seed, margin) {
    const zones = [[116 + margin, scene.bobX - 18 - margin], [scene.bobX + 18 + margin, W - margin]].filter(([a, b]) => b > a);
    let k = rand(seed, 61) * zones.reduce((n, [a, b]) => n + b - a, 0);
    for (const [a, b] of zones) { if (k < b - a) return a + k; k -= b - a; }
    return W - margin;
  }

  // Rows of wave crests, closer together and smaller toward the horizon, rolling in alternate directions.
  function drawSwell(t, th) {
    const { horizon } = scene;
    const depth = H - horizon;
    const rows = Math.max(3, Math.round(depth / 8));
    const from = scene.waterFrom ?? 0;
    for (let r = 0; r < rows; r++) {
      const k = (r + 0.5) / rows;
      const y = Math.round(horizon + 3 + k ** 1.5 * (depth - 6));
      const length = 12 + k * 30;
      const height = (0.6 + k * 1.6) * pal.sea;
      const drift = rand(r, 51) * 300 + t * (3 + k * 9) * (r % 2 ? 1 : -0.7);
      const crest = [], cap = [], shade = [];
      for (let x = from; x < W; x++) {
        const s = Math.sin(((x + drift) / length) * Math.PI * 2 + Math.sin(x * 0.023 + r * 1.7 + t * 0.35) * 1.4);
        if (s < 0.45) continue;
        const top = y - Math.round(((s - 0.45) / 0.55) * height);
        (s > 0.93 ? cap : crest).push(x, top);
        if (k > 0.4) shade.push(x, top + 1);
      }
      plot(shade, pal.crestShade); plot(crest, th.water[0]); plot(cap, pal.foam);
    }
  }

  // Rings spreading where something touched the water. Rain makes many small ones.
  function drawRipples(t) {
    const { horizon } = scene;
    const from = scene.waterFrom ?? 0;
    const count = pal.rainy ? 16 : 4;
    for (let i = 0; i < count; i++) {
      const cycle = t / (1.6 + rand(i, 41) * 2.4) + rand(i, 42);
      const n = Math.floor(cycle);
      const life = cycle - n;
      c.globalAlpha = 0.7 * (1 - life);
      ring(from + rand(i * 31 + n, 43) * (W - from), horizon + 3 + rand(i * 17 + n, 44) * (H - horizon - 6), 1 + life * (pal.rainy ? 4 : 7), pal.foam);
    }
    c.globalAlpha = 1;
  }

  // Now and then a fish leaps clear of the water, leaving a ring where it left and where it landed.
  function drawLeaper(t) {
    const n = Math.floor(t / 7);
    const age = t - n * 7;
    if (rand(n, 71) < 0.4 || age > 2.8) return;
    const { horizon } = scene;
    const dir = rand(n, 72) < 0.5 ? -1 : 1;
    const hop = 14 + rand(n, 74) * 8;
    const x0 = openSpot(n, 4) - (dir * hop) / 2;
    const y0 = Math.round(horizon + 5 + rand(n, 73) * (H - horizon) * 0.35);
    for (const [x, start] of [[x0, 0], [x0 + dir * hop, 1]]) {
      const life = (age - start) / 1.6;
      if (life < 0 || life > 1) continue;
      c.globalAlpha = 0.8 * (1 - life);
      ring(x, y0 + 1, 2 + life * 6, pal.foam);
      c.globalAlpha = 1;
    }
    if (age > 1) return;
    const x = Math.round(x0 + dir * hop * age);
    const y = Math.round(y0 - Math.sin(age * Math.PI) * (10 + hop * 0.3));
    const tilt = Math.cos(age * Math.PI) * 1.5;
    for (let j = -3; j <= 2; j++) rect(c, x + dir * j, y - Math.round((tilt * j) / 3), 1, 2, pal.leaper);
    rect(c, x - dir * 4, y + Math.round((tilt * 4) / 3) - 1, 1, 4, pal.leaper);
    if (age < 0.2 || age > 0.8) {
      const at = age < 0.2 ? x0 : x0 + dir * hop;
      const k = age < 0.2 ? age / 0.2 : (age - 0.8) / 0.2;
      for (let i = 0; i < 5; i++) rect(c, at + (i - 2) * (1 + k * 2), y0 - Math.sin(k * Math.PI) * (3 + (i % 2) * 3), 1, 1, pal.foam);
    }
  }

  // A whirlpool opens every 40 seconds, spins for a while, then closes again.
  function drawWhirlpool(t, th) {
    const n = Math.floor(t / 40);
    const age = t - n * 40 - 5;
    if (age < 0 || age > 15) return;
    const grow = Math.min(1, age / 2.5, (15 - age) / 2.5);
    const { horizon } = scene;
    const r = Math.min(13, (H - horizon) * 0.4) * grow;
    const x = openSpot(n + 500, 13);
    const y = Math.round(horizon + (H - horizon) * 0.55);
    const ry = Math.max(1, Math.round(r * 0.15));
    c.globalAlpha = 0.55 * grow;
    for (let dy = -ry; dy <= ry; dy++) { const half = Math.round(r * 0.45 * Math.sqrt(1 - (dy / ry) ** 2)); rect(c, x - half, y + dy, half * 2 + 1, 1, pal.deep); }
    c.globalAlpha = 1;
    for (let arm = 0; arm < 3; arm++) {
      const points = [];
      for (let k = 0.12; k <= 1; k += 0.025) {
        const a = arm * 2.094 + k * 5.5 - t * 2.4;
        points.push(Math.round(x + Math.cos(a) * r * k), Math.round(y + Math.sin(a) * r * k * 0.38));
      }
      plot(points, arm ? th.water[0] : pal.foam);
    }
  }

  function drawWater(t, th) {
    const { horizon } = scene;
    drawSwell(t, th);
    for (let i = 0; i < 14; i++) {
      const y = horizon + 2 + rand(i, 1) * (H - horizon - 4);
      const from = scene.waterFrom ?? 0;
      const x = from + (rand(i) * (W - from) + Math.sin(t * 0.6 + i) * 7 + W) % (W - from);
      rect(c, x, y, 3 + rand(i, 2) * 8, 1, th.water[0]);
    }
    if (th.city) {
      for (let i = 0; i < 26; i++) {
        const shimmer = still() ? 0 : Math.round(Math.sin(t * 1.6 + i) * 1.5);
        rect(c, rand(i, 7) * W + shimmer, horizon + 1 + rand(i, 8) * 20, 2 + rand(i, 9) * 3, 1, th.glow);
      }
    }
    if (th.cele) {
      const cx = th.cele.x;
      for (let y = horizon + 2; y < H - 4; y += 4) rect(c, cx - 4 + Math.round(Math.sin(t * 2 + y) * 2), y, 8 - (y % 3), 1, th.cele.color);
    }
    // Motion only: with reduced motion the water keeps its still wave crests and nothing else.
    if (!still()) {
      drawRipples(t);
      drawWhirlpool(t, th);
      drawLeaper(t);
    }
    if (state === 'wait' || state === 'bite' || state === 'cast') {
      c.globalAlpha = 0.35;
      for (let i = 0; i < 3; i++) {
        const dir = i % 2 ? 1 : -1;
        const x = W / 2 + 40 + Math.sin(t * (0.25 + i * 0.1) + i * 2) * 60;
        const y = horizon + 16 + i * 9 + Math.sin(t * 0.6 + i) * 2;
        const flip = Math.cos(t * (0.25 + i * 0.1) + i * 2) * dir;
        rect(c, x, y, 12 - i * 2, 4, '#0b1026');
        rect(c, x + (flip > 0 ? -3 : 12 - i * 2), y + 1, 3, 2, '#0b1026');
      }
      c.globalAlpha = 1;
    }
  }

  function drawRodAndLine(pose, t, age, seat) {
    const { hand, arm, outline } = pose;
    let angle = 62, bend = 0, bobber = null, slack = 3;
    const target = { x: scene.bobX, y: scene.horizon + 12 + (still() ? 0 : Math.round(Math.sin(t * 2.4))) };
    if (state === 'cast') {
      angle = age < 0.3 ? lerp(62, 118, age / 0.3) : lerp(118, 40, (age - 0.3) / 0.25);
      if (age > 0.4) {
        const k = Math.min(1, (age - 0.4) / 0.6);
        bobber = { x: lerp(hand.x + 16, target.x, k), y: lerp(hand.y - 26, target.y, k) - Math.sin(k * Math.PI) * 30 };
        slack = 0;
      }
    } else if (state === 'wait') {
      angle = 40; bobber = target;
    } else if (state === 'bite') {
      angle = 32 + (still() ? 0 : Math.sin(t * 24) * 3); bend = 5; slack = 0;
      bobber = { x: target.x, y: target.y + 6 };
    } else if (state === 'reel') {
      angle = lerp(32, 72, age / 1.1); bend = 9; slack = 0;
    } else if (state === 'reveal') {
      angle = 72; bend = 2;
    }
    const rad = (angle * Math.PI) / 180;
    const tip = { x: Math.round(hand.x + Math.cos(rad) * ROD), y: Math.round(hand.y - Math.sin(rad) * ROD + bend) };
    for (let i = 0; i < ROD; i++) {
      const k = i / ROD;
      const px = hand.x + (tip.x - hand.x) * k;
      const py = hand.y + (tip.y - hand.y) * k + Math.sin(k * Math.PI) * -bend * 0.4;
      rect(c, px, py, 1, 1, RODS[rod]?.[i < 7 ? 0 : 1] ?? '#8a5a34');
    }
    pixelLine(c, pose.shoulder.x, pose.shoulder.y, hand.x, hand.y, arm);
    pixelLine(c, pose.shoulder.x, pose.shoulder.y + 1, hand.x, hand.y + 1, arm);
    rect(c, hand.x, hand.y, 2, 2, outline);

    let lineEnd = bobber;
    if (state === 'reel' || state === 'reveal') lineEnd = fishPosition(age, seat, tip);
    else if (!bobber) { bobber = { x: tip.x, y: tip.y + 9 + (still() ? 0 : Math.round(Math.sin(t * 2))) }; lineEnd = bobber; }
    for (let i = 0; i <= 28; i++) {
      const k = i / 28;
      const px = tip.x + (lineEnd.x - tip.x) * k;
      const py = tip.y + (lineEnd.y - tip.y) * k + Math.sin(k * Math.PI) * slack;
      rect(c, px, py, 1, 1, '#f4f4f4');
    }
    if (bobber) {
      rect(c, bobber.x - 1, bobber.y - 2, 3, 2, '#e53935');
      rect(c, bobber.x - 1, bobber.y, 3, 2, '#ffffff');
      if (state === 'wait' && !still() && Math.floor(t * 1.3) % 2) { rect(c, bobber.x - 5, bobber.y + 3, 2, 1, '#ffffff'); rect(c, bobber.x + 4, bobber.y + 3, 2, 1, '#ffffff'); }
    }
    if (state === 'bite' && !still()) {
      for (let i = 0; i < 6; i++) rect(c, target.x + Math.cos(i * 1.05) * (3 + (t * 20) % 8), target.y + 5 + Math.sin(i * 1.05) * 2, 1, 1, '#ffffff');
    }
    return tip;
  }

  function fishPosition(age, seat, tip) {
    const start = { x: scene.bobX, y: scene.horizon + 10 };
    if (state === 'reveal') return { x: seat.x + 26, y: Math.max(14, seat.y - 54) + (still() ? 0 : Math.round(Math.sin(age * 3) * 2)) };
    const k = Math.min(1, age / 1.1);
    const end = { x: seat.x + 26, y: Math.max(14, seat.y - 54) };
    return { x: lerp(start.x, end.x, k), y: lerp(start.y, end.y, k) - Math.sin(k * Math.PI) * 16 };
  }

  function drawBurst(t, age, pos) {
    if (!fish || still()) return;
    const tier = rarityIndexOf(fish);
    const colors = RARITY_COLORS[fish.rarity];
    const count = [10, 14, 22, 32, 50, 60, 90][tier];
    if (tier >= 5 && age < 2.5) { c.globalAlpha = Math.min(0.55, age); rect(c, 0, 0, W, H, tier === 5 ? '#000000' : '#1a0b45'); c.globalAlpha = 1; }
    if (tier >= 3 && age < 0.15) { c.globalAlpha = 0.6; rect(c, 0, 0, W, H, tier === 5 ? '#ff4d6d' : colors[0]); c.globalAlpha = 1; }
    const cx = pos.x + FISH_W / 2;
    const cy = pos.y + FISH_H / 2;
    for (let i = 0; i < count; i++) {
      const speed = 12 + rand(i) * (18 + tier * 8);
      const life = (age * (0.6 + rand(i, 1) * 0.6) + rand(i, 2) * 0.3) % 1.6;
      const angle = rand(i, 3) * Math.PI * 2;
      rect(c, cx + Math.cos(angle) * speed * life, cy + Math.sin(angle) * speed * life + life * life * 10, 1 + (i % 3 === 0 ? 1 : 0), 1, colors[i % colors.length]);
    }
    if (tier === 6) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.6;
        const len = 14 + Math.sin(t * 3 + i) * 5;
        pixelLine(c, Math.round(cx + Math.cos(a) * 9), Math.round(cy + Math.sin(a) * 9), Math.round(cx + Math.cos(a) * len), Math.round(cy + Math.sin(a) * len), colors[i % colors.length]);
      }
    }
  }

  function draw(ms) {
    const clock = ms / 1000;
    const t = still() ? 0 : clock;
    const age = clock - since;
    if (state === 'cast' && !playedSplash && age >= 1) { playedSplash = true; if (age < 3) sfx.splash(); }
    if (state === 'cast' && age >= 1.1) { state = 'wait'; since = clock; }

    c.drawImage(bg, 0, 0);
    const th = theme;
    const { horizon } = scene;
    drawWater(t, th);
    for (const name of th.fx) if (!WEATHER.has(name)) FX[name]?.(c, th, t, horizon);
    c.drawImage(scenery, 0, 0);
    if (still() || Math.sin(t * 2.5) > 0) for (const [x, y] of beacons) rect(c, x, y - 1, 1, 1, '#ff3b30');
    for (const name of th.fx) if (WEATHER.has(name)) FX[name]?.(c, th, t, horizon);

    const seat = scene.seat(t, pal.sea);
    scene.front?.(c, th, t, seat, state, pal);
    const eyesClosed = state === 'break' || (!still() && t % 4 < 0.14);
    const pose = drawAngler(c, angler, seat.x, seat.y, { eyesClosed, t, hat, face });
    const tip = drawRodAndLine(pose, t, age, seat);
    if (state === 'bite') {
      rect(c, seat.x + 5, pose.top - 12, 3, 7, '#ffffff'); rect(c, seat.x + 5, pose.top - 3, 3, 2, '#ffffff');
      rect(c, seat.x + 6, pose.top - 12, 1, 7, '#e53935'); rect(c, seat.x + 6, pose.top - 3, 1, 2, '#e53935');
    }
    if (state === 'break' && !still()) {
      const z = (t * 0.6) % 1;
      c.globalAlpha = 1 - z;
      const zx = seat.x + 15 + z * 10, zy = pose.top - z * 12;
      rect(c, zx, zy, 3, 1, '#ffffff'); rect(c, zx + 1, zy + 1, 1, 1, '#ffffff'); rect(c, zx, zy + 2, 3, 1, '#ffffff');
      c.globalAlpha = 1;
    }
    if ((state === 'reel' || state === 'reveal') && fish) {
      const pos = fishPosition(age, seat, tip);
      const place = { x: Math.round(pos.x - FISH_W / 2), y: Math.round(pos.y) };
      if (state === 'reveal') drawBurst(t, age, place);
      drawFish(c, fish, place.x, place.y, 1, t);
    }
    if (th.ramp) applyRamp(c, th.ramp);
  }

  function frame(ms) {
    if (!document.hidden) draw(ms);
    requestAnimationFrame(frame);
  }

  repaint();
  requestAnimationFrame(frame);

  return {
    configure({ angler: a, scene: s, sky, skyTime: time, hat: h, face: f, rod: r }) {
      angler = a; hat = h; face = f; rod = r;
      if (s !== sceneId || sky !== skyId || time !== skyTime) {
        sceneId = s; skyId = sky; skyTime = time; scene = SCENES[s] ?? SCENES.dock;
        repaint();
      }
    },
    refreshSky: repaint,
    theme: () => theme,
    set(next, nextFish = fish) {
      state = next;
      since = performance.now() / 1000;
      fish = nextFish;
      if (next === 'cast') playedSplash = false;
    },
    state: () => state,
  };
}
