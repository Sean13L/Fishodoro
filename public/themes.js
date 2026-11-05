// Interface colors. Text always sits on an opaque plate, so contrast never depends on the sky.
const UI = {
  day: { page: '#5fb7e5', plate: '#fff4d6', ink: '#2b1d0e', accent: '#b93c08', accentInk: '#ffffff', edge: '#2b1d0e', focus: '#0b4fd6' },
  dusk: { page: '#7a3b69', plate: '#2d1b3d', ink: '#ffe9c7', accent: '#ffb347', accentInk: '#2d1b3d', edge: '#0f0816', focus: '#7fdcff' },
  night: { page: '#0a0d1f', plate: '#10142b', ink: '#e8ecff', accent: '#7fd3ff', accentInk: '#0b1026', edge: '#4a5488', focus: '#ffe066' },
  black: { page: '#000000', plate: '#0c0c0f', ink: '#f2f2f2', accent: '#f2f2f2', accentInk: '#0c0c0f', edge: '#55555f', focus: '#ffe066' },
  purple: { page: '#3b1a66', plate: '#24103f', ink: '#f3e8ff', accent: '#d8b4fe', accentInk: '#24103f', edge: '#0f0620', focus: '#ffe066' },
  cosmic: { page: '#0b0620', plate: '#120a2e', ink: '#e9f1ff', accent: '#7cf5e6', accentInk: '#120a2e', edge: '#5b45a8', focus: '#ffe066' },
  rain: { page: '#374151', plate: '#1f2937', ink: '#e5eef7', accent: '#93c5fd', accentInk: '#111827', edge: '#0d1420', focus: '#ffe066' },
  snow: { page: '#c7dcec', plate: '#f5fbff', ink: '#12263a', accent: '#1d4f82', accentInk: '#ffffff', edge: '#12263a', focus: '#b3245f' },
  blossom: { page: '#f7b7d2', plate: '#fff0f6', ink: '#4a1530', accent: '#b3245f', accentInk: '#ffffff', edge: '#4a1530', focus: '#0b4fd6' },
  autumn: { page: '#d98a3d', plate: '#fff1dc', ink: '#3b1f0b', accent: '#a8430b', accentInk: '#ffffff', edge: '#3b1f0b', focus: '#0b4fd6' },
  tropical: { page: '#2fc4b2', plate: '#eafff5', ink: '#063a33', accent: '#0b6e5f', accentInk: '#ffffff', edge: '#063a33', focus: '#b3245f' },
  blood: { page: '#3a0a10', plate: '#1c0508', ink: '#ffe4e1', accent: '#ff8a80', accentInk: '#1c0508', edge: '#6b1a22', focus: '#ffe066' },
  volcano: { page: '#4a1a06', plate: '#1f0d05', ink: '#ffe8d1', accent: '#ffab40', accentInk: '#1f0d05', edge: '#6e2c0d', focus: '#7fdcff' },
  green: { page: '#306230', plate: '#b5cf4a', ink: '#0f380f', accent: '#0f380f', accentInk: '#d6e88a', edge: '#0f380f', focus: '#0f380f' },
  arcade: { page: '#000000', plate: '#000000', ink: '#ffffff', accent: '#55ffff', accentInk: '#000000', edge: '#ff55ff', focus: '#ffff55' },
  sepia: { page: '#a78a5f', plate: '#f4e7cf', ink: '#3a2a14', accent: '#6b4a1f', accentInk: '#ffffff', edge: '#3a2a14', focus: '#0b4fd6' },
  vapor: { page: '#2d1459', plate: '#1a0b3a', ink: '#fdf0ff', accent: '#ff71ce', accentInk: '#1a0b3a', edge: '#01cdfe', focus: '#fffb96' },
};

// World colors shared between skies, overridden per theme below.
const LAND = {
  day: { hill: ['#6fb36a', '#4f9460'], land: ['#5cae4f', '#8a5a34'], wood: ['#a9713f', '#7a4d2a'], cloud: '#ffffff' },
  night: { hill: ['#1d2c4d', '#16223f'], land: ['#27405a', '#2a2238'], wood: ['#4f3d4f', '#352a3d'], cloud: null },
  dusk: { hill: ['#5b3a6b', '#432b57'], land: ['#4f5a4a', '#5c3a3a'], wood: ['#7a4a3f', '#54322f'], cloud: '#ffc8a8' },
};

const T = (id, name, pack, ui, base, sky, water, cele, fx, extra = {}) =>
  ({ id, name, pack, ui: UI[ui], ...LAND[base], sky, water, cele, fx, ...extra });

export const THEMES = [
  T('dawn', 'Dawn', 'Times of day', 'dusk', 'dusk', ['#3b4a8c', '#a06a9e', '#f4a68c', '#ffd9a0'], ['#8a7fb0', '#5f5f99', '#454a80'], { kind: 'sun', x: 55, y: 62, color: '#ffe2a8' }, ['birds']),
  T('day', 'Day', 'Times of day', 'day', 'day', ['#4aa8e8', '#6dbdf0', '#93d2f5', '#bde5f8'], ['#3fa0d0', '#2d86bd', '#206ca3'], { kind: 'sun', x: 200, y: 22, color: '#fff06a' }, ['clouds', 'birds']),
  T('sunset', 'Sunset', 'Times of day', 'dusk', 'dusk', ['#3f2a6e', '#8c3b78', '#e4604e', '#ffb24d'], ['#c9604f', '#8c3f61', '#54305e'], { kind: 'sun', x: 190, y: 60, color: '#ffd24d' }, ['clouds']),
  T('night', 'Night', 'Times of day', 'night', 'night', ['#0b1033', '#141c4f', '#1e2a68', '#2a3a80'], ['#1b2860', '#141e4c', '#0e1639'], { kind: 'moon', x: 198, y: 24, color: '#f4f1c9' }, ['stars', 'fireflies']),
  T('sunny', 'Sunny Sky', 'Skies', 'day', 'day', ['#1f8ef1', '#3aa4f5', '#62bbf8', '#92d3fb'], ['#27b6d6', '#1798bd', '#0e7ba3'], { kind: 'sun', x: 200, y: 20, color: '#ffe93b', rays: true }, ['clouds']),
  T('black', 'Black Sky', 'Skies', 'black', 'night', ['#000000', '#030305', '#07070c', '#0c0c14'], ['#0c0c14', '#07070c', '#030305'], { kind: 'moon', x: 198, y: 24, color: '#d8d8d8' }, ['stars'], { hill: ['#101018', '#0a0a10'], land: ['#2a2a35', '#1a1a22'], wood: ['#55555f', '#3a3a44'] }),
  T('purple', 'Purple Sky', 'Skies', 'purple', 'night', ['#2a0f57', '#4a1a8c', '#7b35c2', '#b26ae0'], ['#6a2fb0', '#4a1f88', '#2f1260'], { kind: 'moon', x: 198, y: 24, color: '#f2d9ff' }, ['stars', 'clouds'], { hill: ['#3a1a6e', '#2c1257'], land: ['#3c2a7a', '#3a1f55'], wood: ['#5f3f88', '#432b66'], cloud: '#c79af0' }),
  T('cosmic', 'Cosmic Sky', 'Skies', 'cosmic', 'night', ['#050218', '#160a3f', '#3b1470', '#7a2a90'], ['#28125c', '#180a40', '#0b0624'], { kind: 'planet', x: 196, y: 26, color: '#ff9de2' }, ['stars', 'nebula', 'meteors'], { hill: ['#1e0f4a', '#150a38'], land: ['#2a1a66', '#1e1045'], wood: ['#4a2f80', '#33205c'] }),

  T('rain', 'Rain', 'Weather', 'rain', 'day', ['#5a6878', '#6d7b8a', '#808d9b', '#97a3af'], ['#566878', '#435564', '#334350'], null, ['clouds', 'rain'], { hill: ['#55786a', '#47665b'], land: ['#4d7a55', '#5f4a38'], wood: ['#7a5c44', '#5a4333'], cloud: '#4c5866' }),
  T('storm', 'Thunderstorm', 'Weather', 'rain', 'night', ['#14182a', '#20263c', '#2e354e', '#40475f'], ['#262d42', '#1b2133', '#121726'], null, ['clouds', 'rain', 'lightning'], { cloud: '#2a2f42' }),
  T('snow', 'Snowfall', 'Weather', 'snow', 'day', ['#aebfcf', '#c0cfdc', '#d2dde7', '#e4ecf2'], ['#8fb0c4', '#789cb3', '#5f859e'], null, ['clouds', 'snow'], { hill: ['#e4eef5', '#cfdde8'], land: ['#f2f7fb', '#8d7a6a'], wood: ['#8d7058', '#6b5442'], cloud: '#f0f4f8' }),
  T('fog', 'Fog', 'Weather', 'rain', 'day', ['#9aa5a8', '#aab3b5', '#bac1c2', '#cacfcf'], ['#8f9ba0', '#7c898f', '#6a777e'], null, ['fog'], { hill: ['#8d9c98', '#7f8e8a'], land: ['#6f8a74', '#6b5e50'], wood: ['#7d6957', '#5f5043'], cloud: null }),
  T('rainbow', 'Rainbow', 'Weather', 'day', 'day', ['#58b4ea', '#7cc6f0', '#a2d8f5', '#c8e9f8'], ['#3fa0d0', '#2d86bd', '#206ca3'], { kind: 'sun', x: 30, y: 22, color: '#fff06a' }, ['clouds', 'rainbow']),

  T('blossom', 'Cherry Blossom', 'Seasons', 'blossom', 'day', ['#8fc8ee', '#b5d8f0', '#f2cfe0', '#fbdde8'], ['#7fb8d8', '#6aa0c8', '#5688b0'], { kind: 'sun', x: 200, y: 22, color: '#fff3b0' }, ['clouds', 'petals'], { hill: ['#f4a6c8', '#e58cb4'], land: ['#7dbb6a', '#8a5a44'] }),
  T('autumn', 'Golden Autumn', 'Seasons', 'autumn', 'day', ['#7fa8c9', '#a8c0c9', '#e6cfa0', '#f5d98c'], ['#5e93a8', '#4c7c92', '#3b667c'], { kind: 'sun', x: 200, y: 26, color: '#ffd76a' }, ['leaves'], { hill: ['#d9822b', '#b85f1f'], land: ['#c49a3a', '#7a4a2a'], cloud: '#fff2d9' }),
  T('winter', 'Deep Winter', 'Seasons', 'night', 'night', ['#10203f', '#1f3a66', '#3a618f', '#6f94b8'], ['#3f6585', '#2e4f6e', '#1f3a57'], { kind: 'moon', x: 198, y: 24, color: '#e8f4ff' }, ['stars', 'snow'], { hill: ['#c4d8e8', '#a3bdd1'], land: ['#dceaf5', '#4d4a58'], wood: ['#5d5868', '#46414f'] }),
  T('tropical', 'Tropical Summer', 'Seasons', 'tropical', 'day', ['#19b5e5', '#3fcbe8', '#7fe0e8', '#c0f2e0'], ['#19d3c5', '#0fb5ad', '#0a8f95'], { kind: 'sun', x: 200, y: 20, color: '#fff23b', rays: true }, ['clouds', 'birds'], { hill: ['#2fae5f', '#1f8f4f'], land: ['#f0d98a', '#c9a35f'] }),

  T('aurora', 'Aurora', 'Fantasy', 'night', 'night', ['#06122a', '#0a1f3f', '#113355', '#1a4a66'], ['#14405a', '#0e2f47', '#082035'], { kind: 'moon', x: 205, y: 20, color: '#eaffff' }, ['stars', 'aurora']),
  T('bloodmoon', 'Blood Moon', 'Fantasy', 'blood', 'night', ['#14030a', '#2e0812', '#551020', '#7f1a2a'], ['#551020', '#3a0a16', '#20050c'], { kind: 'moon', x: 198, y: 26, color: '#e53935', big: true }, ['stars'], { hill: ['#2a0a12', '#1e060c'], land: ['#33101a', '#240a10'], wood: ['#4f1f28', '#35141b'] }),
  T('volcano', 'Volcano Glow', 'Fantasy', 'volcano', 'night', ['#1a0a0a', '#3f1208', '#8a2c08', '#e66a10'], ['#a33c0c', '#6e2408', '#3d1206'], null, ['embers', 'volcano'], { hill: ['#2a1410', '#1e0e0a'], land: ['#33221c', '#241610'], wood: ['#55332a', '#3a221c'] }),
  T('twinmoons', 'Twin Moons', 'Fantasy', 'cosmic', 'night', ['#0d1440', '#1c2466', '#33408f', '#5a68b5'], ['#2a3680', '#1d2660', '#121843'], { kind: 'twin', x: 188, y: 26, color: '#f4f1c9', second: '#a8e6ff' }, ['stars'], { hill: ['#26306e', '#1c2558'], land: ['#2e3f7a', '#262050'] }),
  T('meteor', 'Meteor Shower', 'Fantasy', 'night', 'night', ['#040818', '#0a1230', '#121d48', '#1d2c60'], ['#16224f', '#0f183c', '#090f2a'], null, ['stars', 'meteors', 'meteors']),

  T('handheld', 'Handheld Green', 'Retro palettes', 'green', 'day', ['#4aa8e8', '#6dbdf0', '#93d2f5', '#bde5f8'], ['#3fa0d0', '#2d86bd', '#206ca3'], { kind: 'sun', x: 200, y: 22, color: '#ffffff' }, ['clouds'], { ramp: ['#0f380f', '#306230', '#8bac0f', '#d6e88a'] }),
  T('arcade', '4-Color Arcade', 'Retro palettes', 'arcade', 'day', ['#1f8ef1', '#3aa4f5', '#62bbf8', '#92d3fb'], ['#27b6d6', '#1798bd', '#0e7ba3'], { kind: 'sun', x: 200, y: 22, color: '#ffffff' }, ['clouds'], { ramp: ['#000000', '#ff55ff', '#55ffff', '#ffffff'] }),
  T('sepia', 'Sepia', 'Retro palettes', 'sepia', 'day', ['#4aa8e8', '#6dbdf0', '#93d2f5', '#bde5f8'], ['#3fa0d0', '#2d86bd', '#206ca3'], { kind: 'sun', x: 200, y: 22, color: '#fff06a' }, ['clouds', 'birds'], { ramp: ['#2e1f0e', '#5f4526', '#8f7248', '#b89d70', '#d9c49c', '#f4e7cf'] }),
  T('vaporwave', 'Neon Vaporwave', 'Retro palettes', 'vapor', 'night', ['#1a0b3a', '#4b1a7a', '#c0267e', '#ff71ce'], ['#b967ff', '#7a35c2', '#01cdfe'], { kind: 'sun', x: 120, y: 46, color: '#fffb96', stripes: true }, ['stars'], { hill: ['#2e1270', '#220c58'], land: ['#05ffa1', '#3a1a80'], wood: ['#b967ff', '#7a35c2'] }),
];

export const ADAPTIVE = 'adaptive';
export const SKY_IDS = [ADAPTIVE, ...THEMES.map((t) => t.id)];
export const PACKS = [...new Set(THEMES.map((t) => t.pack))];

// Uses the browser's local clock. The time zone is never sent to the server.
export function adaptiveId(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
}

export const resolveSky = (id, hour = new Date().getHours()) =>
  THEMES.find((t) => t.id === (id === ADAPTIVE ? adaptiveId(hour) : id)) ?? THEMES[1];
