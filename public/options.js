import { ADAPTIVE, SKY_IDS } from './themes.js';

export const ANGLERS = [['cat', 'Cat in a bucket hat'], ['kid', 'Kid in overalls'], ['frog', 'Frog in a raincoat'], ['captain', 'Old sea captain']];
export const SCENES = [['dock', 'Wooden dock on a lake'], ['boat', 'Rowboat on open sea'], ['river', 'Riverbank with campfire'], ['island', 'Tiny floating island']];
export const LAYOUTS = [['hero', 'Scene with panel below'], ['full', 'Full-screen world'], ['handheld', 'Handheld console']];
export const FOCUS_MINUTES = [15, 25, 45, 60];

export const DEFAULT_PREFS = { angler: 'cat', scene: 'dock', layout: 'hero', sky: ADAPTIVE, focus: 25, volume: 60, muted: false };

const ids = (list) => list.map(([id]) => id);
const RULES = {
  angler: (v) => ids(ANGLERS).includes(v),
  scene: (v) => ids(SCENES).includes(v),
  layout: (v) => ids(LAYOUTS).includes(v),
  sky: (v) => SKY_IDS.includes(v),
  focus: (v) => FOCUS_MINUTES.includes(v),
  volume: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  muted: (v) => typeof v === 'boolean',
};

// Keeps only known keys with allowed values, so stored prefs can never hold arbitrary data.
export function cleanPrefs(input) {
  const out = { ...DEFAULT_PREFS };
  if (input && typeof input === 'object') {
    for (const key of Object.keys(RULES)) if (Object.hasOwn(input, key) && RULES[key](input[key])) out[key] = input[key];
  }
  return out;
}
