// All art is drawn from these grids, so there are no image files to license.
import { rarityOf, sizeOf, SPECIES } from './fish.js';

const OUTLINE = '#1a1c2c';

export const rect = (c, x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };

export function pixelLine(c, x0, y0, x1, y1, color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) rect(c, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, 1, 1, color);
}

function drawGrid(c, grid, x, y, palette, scale = 1) {
  grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      const color = palette[row[gx]];
      if (color) { c.fillStyle = color; c.fillRect(x + gx * scale, y + gy * scale, scale, scale); }
    }
  });
}

// --- Anglers: one head per character on a shared seated body. Arms and rod are drawn in code. ---
const HEADS = {
  cat: [
    '....kkkkkk....',
    '...kccccddk...',
    '.k.kccccddk.k.',
    'kakkccccddkkak',
    'kkccccccccccck',
    '.kaaaaaaaaaak.',
    '.kawaaaaawaak.',
    '.kaeaaaaaeaak.',
    '.kaaablbaaaak.',
    'kaaaaakaaaaaak',
    '.kkaaaaaaaakk.',
    '...kkkkkkkk...',
  ],
  kid: [
    '....kkkkkk....',
    '...kccccccck..',
    '..kcccccccccck',
    '.kccccccccccck',
    '.kkkkkkkkkkkk.',
    '.khhaaaaaaaak.',
    '.khawaaaawaak.',
    '.kaaeaaaaeaak.',
    '.kaaaaaaaaabk.',
    '.kaaaakkkaaak.',
    '..kkaaaaaakk..',
    '....kkkkkk....',
  ],
  frog: [
    '...kkkkkkkk...',
    '..kcccccccck..',
    '.kkkcccccckkk.',
    'kwwekccckwwek.',
    'kwwekaaakwwek.',
    '.kkkaaaaakkk..',
    '.kaaaaaaaaak..',
    'kaaaaaaaaaaak.',
    'kaakkkkkkkaak.',
    '.kaaaaaaaaak..',
    '.kcccccccck...',
    '..kkkkkkkk....',
  ],
  captain: [
    '...kkkkkkkk...',
    '..kccccccccck.',
    '.kcccdddccccck',
    '.kccccccccccck',
    '.kkkkkkkkkkkk.',
    '.kaaaaaaaaaak.',
    '.kaweaaaweaak.',
    '.kaaaaaaaaaak.',
    '.khhhhhhhhhhk.',
    'khhhhkkkhhhhhk',
    '.khhhhhhhhhhk.',
    '...kkhhhhkk...',
  ],
  fox: [
    '.kk........kk.',
    'kaak......kaak',
    'kaaakkkkkkaaak',
    'kaaaaaaaaaaaak',
    'kaaaaaaaaaaaak',
    '.kawaaaaawaak.',
    '.kaeaaaaaeaak.',
    '.kbbbaaaabbbk.',
    '..kbbbkkbbbk..',
    '...kbbbbbbk...',
    '....kkkkkk....',
    '..............',
  ],
  penguin: [
    '....kkkkkk....',
    '...kaaaaaak...',
    '..kaaaaaaaak..',
    '.kaaaaaaaaaak.',
    '.kaabbaabbaak.',
    '.kabwebbwebak.',
    '.kabbbbbbbbak.',
    '.kabbcccbbbak.',
    '.kabbbccbbbak.',
    '..kabbbbbbak..',
    '...kkkkkkkk...',
    '..............',
  ],
  robot: [
    '......kk......',
    '......kl......',
    '..kkkkkkkkkk..',
    '.kaaaaaaaaaak.',
    '.kaaaaaaaaaak.',
    '.kaweaaaaweak.',
    '.kaeeaaaaeeak.',
    '.kaaaaaaaaaak.',
    '.kabbbbbbbbak.',
    '.kabkbkbkbbak.',
    '.kkkkkkkkkkkk.',
    '..............',
  ],
  astronaut: [
    '....kkkkkk....',
    '..kkaaaaaakk..',
    '.kaaaaaaaaaak.',
    'kaaaaaaaaaaaak',
    'kaakkkkkkkkaak',
    'kaakcdddddkaak',
    'kaakddccddkaak',
    'kaakdddddckaak',
    'kaakkkkkkkkaak',
    'kaaaaaaaaaaaak',
    '.kkaaaaaaaakk.',
    '...kkkkkkkk...',
  ],
};

const BODY = [
  '....kkkkkk....',
  '...kssssssk...',
  '..kssssssssk..',
  '..kssssssssk..',
  '..kssssssssk..',
  '..kppppppppkk.',
  '..kppppppppppk',
  '...kkkkkkkkppk',
  '..........kppk',
  '..........kffk',
  '..........kkk.',
];

export const ANGLER_LOOKS = {
  cat: { k: OUTLINE, a: '#f28c38', b: '#fff1d6', c: '#d8c07a', d: '#b89a55', w: '#ffffff', e: OUTLINE, l: '#ff8fa3', s: '#3f7fc4', p: '#2f5f9a', f: '#f28c38', arm: '#f28c38', lid: '#d2701f' },
  kid: { k: OUTLINE, a: '#f6c9a0', b: '#ef9a7a', c: '#e8d27a', h: '#7a4a24', w: '#ffffff', e: OUTLINE, s: '#e0533d', p: '#3f6fb5', f: '#5c3a21', arm: '#e0533d', lid: '#e0ad82' },
  frog: { k: OUTLINE, a: '#74c365', c: '#f5d02f', w: '#ffffff', e: OUTLINE, s: '#f5d02f', p: '#d9b416', f: '#74c365', arm: '#f5d02f', lid: '#74c365' },
  captain: { k: OUTLINE, a: '#eebb94', c: '#1f2a52', d: '#f5d02f', h: '#eef0f4', w: '#ffffff', e: OUTLINE, s: '#2a3a78', p: '#1f2a52', f: '#3a2a20', arm: '#2a3a78', lid: '#d8a27c' },
  fox: { k: OUTLINE, a: '#e8742a', b: '#fff1e0', w: '#ffffff', e: OUTLINE, s: '#3f8f5f', p: '#2f6f4a', f: '#3a2a20', arm: '#3f8f5f', lid: '#c95f1e' },
  penguin: { k: OUTLINE, a: '#2b2f3a', b: '#f4f5f8', c: '#f5a623', w: '#ffffff', e: OUTLINE, s: '#2b2f3a', p: '#f4f5f8', f: '#f5a623', arm: '#2b2f3a', lid: '#f4f5f8' },
  robot: { k: OUTLINE, a: '#9aa7b5', b: '#5f6b78', l: '#ff4d6d', w: '#7cf5e6', e: '#0f7f7a', s: '#7c8896', p: '#5f6b78', f: '#3c444d', arm: '#9aa7b5', lid: '#5f6b78' },
  astronaut: { k: OUTLINE, a: '#eef1f5', c: '#7cf5e6', d: '#1c2a4a', s: '#eef1f5', p: '#cfd6de', f: '#9aa7b5', arm: '#eef1f5', lid: '#eef1f5' },
};

// Cosmetics from the market. overlap is how many rows of a hat sit on top of the head.
const HATS = {
  flower: { overlap: 3, colors: { r: '#ff7ab8', y: '#ffe066' }, grid: ['.........rr...', '........ryyr..', '.........rr...'] },
  partyhat: { overlap: 2, colors: { r: '#ff4d9d', y: '#ffe066' }, grid: ['......rr......', '......rr......', '.....ryry.....', '....ryryyr....', '...ryrryyrr...'] },
  piratehat: { overlap: 2, colors: { k: OUTLINE, w: '#ffffff' }, grid: ['....kkkkkk....', '..kkkkkkkkkk..', '.kkkkkwwkkkkk.', 'kkkkkkwwkkkkkk', 'kkkkkkkkkkkkkk'] },
  wizardhat: { overlap: 2, colors: { p: '#6a3fc2', y: '#ffe066', k: OUTLINE }, grid: ['......pp......', '.....pppp.....', '....ppyppp....', '...ppppyppp...', '..pppppppppp..', 'kkkkkkkkkkkkkk'] },
  crown: { overlap: 2, colors: { y: '#f5c542', r: '#e53935', b: '#2f7fd6' }, grid: ['.y...y..y...y.', '.yy.yyyyyy.yy.', '.yyyyyyyyyyyy.', '.yryybyybyyry.'] },
};
const FACES = {
  mustache: { below: 3, colors: { k: '#3a2a20' }, grid: ['...kkk..kkk...', '..kk......kk..'] },
  sunglasses: { below: 0, colors: { k: OUTLINE, g: '#23233a' }, grid: ['kkkkkkkkkkkkkk', '.kggggkkggggk.', '..kggk..kggk..'] },
};
const EYE_ROW = { cat: 6, kid: 6, frog: 3, captain: 6, fox: 5, penguin: 5, robot: 5, astronaut: 5 };
export const RODS = { none: ['#2a1a10', '#8a5a34'], bamboorod: ['#3f6b2a', '#9fc45a'], neonrod: ['#ff4d9d', '#7cf5e6'], goldrod: ['#7a5a08', '#f5c542'] };
export const hasSprite = (id) => !!(HEADS[id] || HATS[id] || FACES[id] || RODS[id]);

// (x, y) is the seat point: the sprite's bottom-left corner.
export function drawAngler(c, kind, x, y, { eyesClosed = false, t = 0, hat, face } = {}) {
  const look = ANGLER_LOOKS[kind] ?? ANGLER_LOOKS.cat;
  const palette = eyesClosed ? { ...look, e: look.lid, w: look.lid } : look;
  if (kind === 'cat') {
    for (let i = 0; i < 6; i++) rect(c, x + 1 - i, y - 3 + Math.round(Math.sin(t * 3 + i * 0.7) * (i / 4)), 2, 2, i === 5 ? look.b : look.a);
  }
  drawGrid(c, BODY, x, y - BODY.length, palette);
  const headTop = y - BODY.length - 11;
  drawGrid(c, HEADS[kind] ?? HEADS.cat, x, headTop, palette);
  if (FACES[face]) drawGrid(c, FACES[face].grid, x, headTop + (EYE_ROW[kind] ?? 6) + FACES[face].below - (FACES[face].below ? 0 : 1), FACES[face].colors);
  if (HATS[hat]) drawGrid(c, HATS[hat].grid, x, headTop - HATS[hat].grid.length + HATS[hat].overlap, HATS[hat].colors);
  return { hand: { x: x + 15, y: y - 7 }, shoulder: { x: x + 8, y: y - 9 }, top: y - BODY.length - 11, arm: look.arm, outline: OUTLINE };
}

// --- Fish: k outline, b body, l belly, d fins, e eye, w eye shine ---
const FISH = {
  minnow: [
    '..................',
    '..................',
    '.......kkkk.......',
    'k....kkbbbbkkk....',
    'kk..kbbbbbbbwekk..',
    'kdkkbbbbbbbbbbbbk.',
    'kdkklllllllllllk..',
    'kk..kkllllllkkk...',
    'k.....kkkkkk......',
    '..................',
  ],
  perch: [
    '......k.k.k.......',
    '.....kdkdkdk......',
    '....kddddddddk....',
    'k..kbbdbbdbbbbkk..',
    'kkkbbbdbbdbbbwekk.',
    'kdkbbbdbbdbbbbbbk.',
    'kkkllllllllllllk..',
    'k..kllllllllkkk...',
    '....kkdkkdkk......',
    '.....kk..kk.......',
  ],
  bass: [
    '.....kkkkkkk......',
    '....kdddddddk.....',
    'k..kbbbbbbbbbkkk..',
    'kkkbbbbbbbbbbbbwk.',
    'kdkbbdbbdbbbbbbek.',
    'kdkbbbbbbbbbbkkkkk',
    'kkklllllllllllllk.',
    'k..kllllllllllkk..',
    '....kkkdddkkkk....',
    '.......kkk........',
  ],
  trout: [
    '.......kkk........',
    '.....kkdddkk......',
    'k...kbbbbbbbkkk...',
    'kk.kbdbbbdbbbwekk.',
    'kdkbbbbdbbbbdbbbbk',
    'kdkddddddddddddddk',
    'kk.klllllllllllkk.',
    'k...kkllllllkkk...',
    '......kdkkdk......',
    '.......k..k.......',
  ],
  catfish: [
    '........kk........',
    '.......kddk.......',
    'k...kkkbbbbbkkkk..',
    'kk.kbbbbbbbbbbwekk',
    'kdkbbbbbbbbbbbbbbk',
    'kdkllllllllllllldd',
    'kk.kllllllllllkkd.',
    'k...kkkkkkkkkk.d..',
    '......kdk.kdk.....',
    '.......k...k......',
  ],
  puffer: [
    '....k..k..k..k....',
    '.....kkkkkkkkk....',
    '.k..kbbdbbdbbbk...',
    'kdkkbdbbbbbbbbwek.',
    'kddkbbbbdbbbbbbek.',
    'kdkkbbdbbbbdbbbkk.',
    '.k..klllllllllk...',
    '.....klllllllk....',
    '.....kkkkkkkkk....',
    '....k..k..k..k....',
  ],
  angelfish: [
    '.........k........',
    '........kdk.......',
    '.......kddk.......',
    '..k..kkbdbbkk.....',
    '.kdkkbbdbbbbwek...',
    '.kddbbbdbbbbbbk...',
    '.kdkkllllllllkk...',
    '..k..kklllkkk.....',
    '.......kddk.......',
    '.........kk.......',
  ],
  koi: [
    '.......kkkk.......',
    '.....kkddbbkk.....',
    'kk..kbbdddbbbkkk..',
    'kdk.kbbbbbbddbwek.',
    'kddkbddbbbdddbbbk.',
    'kddkbdddbbbbbbbbk.',
    'kdk.klllllllllkkkk',
    'kk...kkllllllk..k.',
    '.......kdkkdk.....',
    '........k..k......',
  ],
  eel: [
    '..................',
    '..................',
    '.................',
    '..kkk.....kkkkk...',
    '.kbbbk...kbbbbwek.',
    'kbbdbbkkkbbdbbbbbk',
    'kbk.kbdbbbbk.kllkk',
    'kk...klllllk..kk..',
    '......kkkkk.......',
    '..................',
  ],
  manta: [
    '.......kkkk.......',
    '.....kkbbbbkk.....',
    '...kkbbbbbbbbkk.ek',
    '.kkbbbbdbbdbbbbkbk',
    'kbbbbbbbbbbbbbwebk',
    '.kkbbbbdbbdbbbbkbk',
    '...kkbbbbbbbbkk.ek',
    '.....kkbbbbkk.....',
    'kkkkkkkkkkk.......',
    '..................',
  ],
  swordfish: [
    '......kk..........',
    '.....kddk.........',
    'k...kddddkk.......',
    'kk.kbbbbbbbbkk....',
    'kdkbbbbbbbbbbwek..',
    'kdkbbbbbbbbbbbbkkk',
    'kk.klllllllllkkkkk',
    'k...kkkkkkkkk.....',
    '.....kdk..........',
    '......k...........',
  ],
  anglerfish: [
    '.........kkkkk....',
    '........k....kll..',
    '......kkkk...kll..',
    'k...kkbbbbkk......',
    'kk.kbbbbbwebk.....',
    'kdkbbbbbbbbbbkkkk.',
    'kdkbbbbbbbbkwkwkk.',
    'kk.kbbbbbbbbbkkkk.',
    'k...kkllllllkk....',
    '......kkkkkk......',
  ],
};

const NATURAL = {
  minnow: { b: '#9fb4c2', l: '#dfe8ee', d: '#75909f' },
  perch: { b: '#a8b84a', l: '#e8e0a8', d: '#c86a2a' },
  bass: { b: '#5d8a4a', l: '#d8dca0', d: '#3f6a38' },
  trout: { b: '#7c9a7a', l: '#ecd8c8', d: '#d8667a' },
  catfish: { b: '#7a6a58', l: '#cfc4b0', d: '#54473a' },
  puffer: { b: '#c9b35a', l: '#f4eccf', d: '#8f7a30' },
  angelfish: { b: '#e8dca0', l: '#fff6d8', d: '#4a4a58' },
  koi: { b: '#f4efe6', l: '#ffffff', d: '#e2562f' },
  eel: { b: '#5f6a4a', l: '#a8ac80', d: '#454e35' },
  manta: { b: '#4f6078', l: '#c4d0dc', d: '#35445a' },
  swordfish: { b: '#4a6fa5', l: '#d4dce8', d: '#2f4d7d' },
  anglerfish: { b: '#5a4a5f', l: '#fff27a', d: '#3f3345' },
};
const BRIGHT = [{ b: '#4cc9f0', l: '#caf0f8', d: '#0a7bb0' }, { b: '#ff7a59', l: '#ffe0d2', d: '#c74420' }, { b: '#7ae582', l: '#dcffe0', d: '#2a9d4f' }, { b: '#ffd166', l: '#fff4cf', d: '#d68c1c' }];
const JEWEL = [{ b: '#c026d3', l: '#f5c6fb', d: '#7a1085' }, { b: '#0ea5a5', l: '#b6f5f0', d: '#066a70' }, { b: '#2563eb', l: '#bfd4ff', d: '#1438a0' }, { b: '#dc2640', l: '#ffc4cc', d: '#8e1024' }];

const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };

function fishPalette(fish, t) {
  const index = SPECIES.findIndex((s) => s.id === fish.species);
  const base = { k: OUTLINE, e: OUTLINE, w: '#ffffff' };
  switch (fish.rarity) {
    case 'uncommon': return { ...base, ...BRIGHT[index % BRIGHT.length] };
    case 'rare': return { ...base, ...JEWEL[index % JEWEL.length] };
    case 'epic': return { ...base, ...JEWEL[index % JEWEL.length], k: Math.sin(t * 4) > 0 ? '#ff8bf0' : '#b65cff' };
    case 'gold': return { ...base, b: '#f5c542', l: '#fff0a0', d: '#c98a14', k: '#6e4a06' };
    case 'black': return { k: '#f2f2f2', e: '#ff4d6d', w: '#0a0a0c', b: '#0a0a0c', l: '#1c1c22', d: '#2c2c36' };
    case 'cosmic': return { k: '#7cf5e6', e: '#ffffff', w: '#120a2e', b: '#1a0b45', l: '#2a1466', d: '#4a1f8c' };
    default: return { ...base, ...NATURAL[fish.species] };
  }
}

// Draws one fish facing right. t animates shimmer and starfield; pass 0 for a still image.
export function drawFish(c, fish, x, y, scale, t = 0, flip = false) {
  const grid = FISH[fish.species] ?? FISH.minnow;
  const palette = fishPalette(fish, t);
  const shimmer = Math.floor(t * 12);
  grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      const key = row[gx];
      let color = palette[key];
      if (!color) continue;
      const body = key === 'b' || key === 'l' || key === 'd';
      if (fish.rarity === 'gold' && body && (gx + gy + shimmer) % 14 < 2) color = '#fffbe6';
      if (fish.rarity === 'cosmic' && body) {
        const h = hash(gx, gy);
        if (h > 0.82) color = Math.sin(t * 5 + h * 40) > -0.3 ? '#ffffff' : '#7cf5e6';
        else if (h > 0.68) color = '#ff9de2';
      }
      c.fillStyle = color;
      c.fillRect(x + (flip ? row.length - 1 - gx : gx) * scale, y + gy * scale, scale, scale);
    }
  });
}

export const FISH_W = 18;
export const FISH_H = 10;

// A still image for the inventory, cached because each combination always looks the same.
const images = new Map();
export function fishImage(fish) {
  const key = `${fish.species}|${fish.rarity}|${fish.size}`;
  if (!images.has(key)) {
    const scale = sizeOf(fish).scale;
    const canvas = document.createElement('canvas');
    canvas.width = FISH_W * scale;
    canvas.height = FISH_H * scale;
    drawFish(canvas.getContext('2d'), fish, 0, 0, scale);
    images.set(key, canvas.toDataURL());
  }
  return images.get(key);
}

// A still picture for the market, showing the angler wearing the item.
export function anglerImage({ kind = 'cat', hat, face, rod = 'none' }) {
  const canvas = document.createElement('canvas');
  canvas.width = 28;
  canvas.height = 32;
  const c = canvas.getContext('2d');
  drawAngler(c, kind, 3, 30, { hat, face });
  const [grip, tip] = RODS[rod] ?? RODS.none;
  pixelLine(c, 18, 23, 21, 15, grip);
  pixelLine(c, 21, 15, 26, 2, tip);
  return canvas.toDataURL();
}

export const RARITY_COLORS = {
  common: ['#ffffff'], uncommon: ['#7ae582', '#ffffff'], rare: ['#4cc9f0', '#ffffff'], epic: ['#ff8bf0', '#b65cff'],
  gold: ['#ffd24d', '#fff4b0', '#ffffff'], black: ['#ffffff', '#8a8a95', '#ff4d6d'], cosmic: ['#7cf5e6', '#ff9de2', '#ffffff', '#b65cff'],
};
export const rarityIndexOf = (fish) => ['common', 'uncommon', 'rare', 'epic', 'gold', 'black', 'cosmic'].indexOf(rarityOf(fish).id);
