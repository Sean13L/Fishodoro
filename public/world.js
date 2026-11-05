import { drawCity } from './cities.js';
import { drawAngler, drawFish, FISH_H, FISH_W, pixelLine, RARITY_COLORS, rarityIndexOf, rect } from './sprites.js';
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

// horizon: y of the waterline. seat(t): the angler's seat point. bobX: where the bobber lands.
const SCENES = {
  dock: { horizon: 78, hills: true, bobX: 176, seat: () => ({ x: 72, y: 88 }), still: dock },
  boat: {
    horizon: 72, hills: false, bobX: 182,
    seat: (t) => ({ x: 60, y: 98 + (still() ? 0 : Math.round(Math.sin(t * 1.4) * 1.5)) }),
    front: (c, th, t, s) => boat(c, th, 46, s.y, 0),
  },
  river: {
    horizon: 76, hills: true, bobX: 180, waterFrom: 124, seat: () => ({ x: 78, y: 84 }), still: riverbank,
    front: (c, th, t, s, state) => campfire(c, 60, 84, t, state === 'break'),
  },
  island: {
    horizon: 108, hills: false, bobX: 170,
    seat: (t) => ({ x: 48, y: 72 + (still() ? 0 : Math.round(Math.sin(t * 0.9) * 1.5)) }),
    front: (c, th, t, s) => island(c, th, 14, s.y),
  },
};

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
function paintScenery(g, th, scene) {
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
  scene.still?.(g, th, horizon);
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
  let angler = 'cat', scene = SCENES.dock, sceneId = 'dock', skyId = 'adaptive', theme = null;
  let state = 'idle', since = 0, fish = null, playedSplash = true;

  function repaint() {
    theme = resolveSky(skyId);
    paintBackground(bgc, theme, scene);
    beacons = paintScenery(sceneryC, theme, scene);
  }

  function drawWater(t, th) {
    const { horizon } = scene;
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
      rect(c, px, py, 1, 1, i < 7 ? '#2a1a10' : '#8a5a34');
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

    const seat = scene.seat(t);
    scene.front?.(c, th, t, seat, state);
    const eyesClosed = state === 'break' || (!still() && t % 4 < 0.14);
    const pose = drawAngler(c, angler, seat.x, seat.y, { eyesClosed, t });
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
    configure({ angler: a, scene: s, sky }) {
      angler = a;
      if (s !== sceneId || sky !== skyId) {
        sceneId = s; skyId = sky; scene = SCENES[s] ?? SCENES.dock;
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
