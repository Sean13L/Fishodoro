import { catalogItem, inSlot } from './market.js';
import { ADAPTIVE, SKY_IDS } from './themes.js';

export const ANGLERS = [['cat', 'Cat in a bucket hat'], ['kid', 'Kid in overalls'], ['frog', 'Frog in a raincoat'], ['captain', 'Old sea captain']];
export const SCENES = [['dock', 'Wooden dock on a lake'], ['boat', 'Rowboat on open sea'], ['river', 'Riverbank with campfire'], ['island', 'Tiny floating island']];
export const LAYOUTS = [['hero', 'Scene with panel below'], ['full', 'Full-screen world'], ['handheld', 'Handheld console']];
export const FOCUS_MINUTES = [15, 30, 45, 60];
export const MIN_FOCUS = 5;
export const MAX_FOCUS = 180;
export const isFocusLength = (v) => Number.isInteger(v) && v >= MIN_FOCUS && v <= MAX_FOCUS;

export const DEFAULT_PREFS = { angler: 'cat', scene: 'dock', layout: 'hero', sky: ADAPTIVE, focus: 30, volume: 60, muted: false, controlsOpen: true, footerOpen: true, hat: 'none', face: 'none', rod: 'none' };

const ids = (list) => list.map(([id]) => id);
const RULES = {
  angler: (v) => ids(ANGLERS).includes(v) || inSlot('angler').some((item) => item.id === v),
  hat: (v) => v === 'none' || inSlot('hat').some((item) => item.id === v),
  face: (v) => v === 'none' || inSlot('face').some((item) => item.id === v),
  rod: (v) => v === 'none' || inSlot('rod').some((item) => item.id === v),
  scene: (v) => ids(SCENES).includes(v),
  layout: (v) => ids(LAYOUTS).includes(v),
  sky: (v) => SKY_IDS.includes(v),
  focus: isFocusLength,
  volume: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  muted: (v) => typeof v === 'boolean',
  controlsOpen: (v) => typeof v === 'boolean',
  footerOpen: (v) => typeof v === 'boolean',
};

// Swaps anything from the market that isn't owned back to its default.
export function keepOwned(prefs, owned) {
  const out = { ...prefs };
  for (const key of ['angler', 'hat', 'face', 'rod']) if (catalogItem(out[key]) && !owned.includes(out[key])) out[key] = DEFAULT_PREFS[key];
  return out;
}

// Keeps only known keys with allowed values, so stored prefs can never hold arbitrary data.
export function cleanPrefs(input) {
  const out = { ...DEFAULT_PREFS };
  if (input && typeof input === 'object') {
    for (const key of Object.keys(RULES)) if (Object.hasOwn(input, key) && RULES[key](input[key])) out[key] = input[key];
  }
  return out;
}
