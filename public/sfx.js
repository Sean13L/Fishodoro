// All sounds are synthesized with WebAudio, so there are no audio files to license.
let ctx, master, noiseBuffer;
let volume = 0.6;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    noiseBuffer.getChannelData(0).forEach((_, i, data) => { data[i] = Math.random() * 2 - 1; });
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function applyVolume() { if (master) master.gain.value = muted ? 0 : volume * 0.5; }
export function setSound({ volume: v, muted: m }) { volume = v / 100; muted = m; applyVolume(); }

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function tone(midi, at, length, type = 'square', gain = 0.25, slideTo) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const start = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(hz(midi), start);
  if (slideTo) osc.frequency.linearRampToValueAtTime(hz(slideTo), start + length);
  env.gain.setValueAtTime(gain, start);
  env.gain.linearRampToValueAtTime(0, start + length);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + length);
}

function noise(at, length, gain = 0.25, cutoff = 2000) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  const start = ctx.currentTime + at;
  src.buffer = noiseBuffer;
  filter.frequency.value = cutoff;
  env.gain.setValueAtTime(gain, start);
  env.gain.linearRampToValueAtTime(0, start + length);
  src.connect(filter).connect(env).connect(master);
  src.start(start);
  src.stop(start + length);
}

// Plays notes one step apart; 0 is a rest.
const melody = (notes, step, type, gain) => notes.forEach((n, i) => n && tone(n, i * step, step * 1.1, type, gain));

// Each reveal is longer and fuller than the rarity below it. Indexed like RARITIES.
const FANFARES = [
  [72, 76, 79],
  [72, 76, 79, 84],
  [72, 76, 79, 84, 79, 84],
  [67, 72, 76, 79, 84, 88, 84, 88],
  [72, 72, 72, 76, 79, 84, 79, 84, 88, 91],
  [60, 63, 67, 72, 75, 79, 84, 87, 91, 84, 91, 96],
  [72, 79, 84, 88, 91, 96, 91, 96, 100, 96, 100, 103, 108, 103, 108],
];
const STEP = 0.11;

const play = (fn) => (...args) => { if (ctx) fn(...args); };

export const sfx = {
  cast: play(() => { noise(0, 0.25, 0.15, 3000); tone(84, 0, 0.3, 'triangle', 0.2, 60); }),
  splash: play(() => { noise(0, 0.35, 0.35, 1400); tone(60, 0, 0.12, 'triangle', 0.2, 80); }),
  reel: play(() => { for (let i = 0; i < 10; i++) tone(70 + (i % 2) * 5 + i, i * 0.08, 0.05, 'square', 0.12); }),
  focusEnd: play(() => melody([76, 0, 76, 0, 76, 84], 0.11, 'square', 0.28)),
  breakStart: play(() => melody([72, 69, 65, 64, 60], 0.15, 'triangle', 0.35)),
  breakEnd: play(() => melody([60, 64, 67, 72], 0.13, 'square', 0.22)),
  reveal: play((rarityIndex) => {
    const notes = FANFARES[rarityIndex];
    melody(notes, STEP, 'square', 0.22);
    if (rarityIndex >= 2) melody(notes.map((n) => n - 12), STEP, 'triangle', 0.3);
    if (rarityIndex >= 4) noise(notes.length * STEP, 0.5, 0.15, 6000);
  }),
};

export const fanfareMs = (rarityIndex) => FANFARES[rarityIndex].length * STEP * 1000;
