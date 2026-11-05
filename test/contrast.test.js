import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RARITIES } from '../public/fish.js';
import { ADAPTIVE, adaptiveId, resolveSky, SKY_IDS, THEMES } from '../public/themes.js';

const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every theme meets WCAG AA for text and focus rings', () => {
  for (const { id, ui } of THEMES) {
    assert.ok(ratio(ui.ink, ui.plate) >= 4.5, `${id}: ink on plate is ${ratio(ui.ink, ui.plate).toFixed(2)}`);
    assert.ok(ratio(ui.accentInk, ui.accent) >= 4.5, `${id}: accent button is ${ratio(ui.accentInk, ui.accent).toFixed(2)}`);
    assert.ok(ratio(ui.focus, ui.plate) >= 3, `${id}: focus ring is ${ratio(ui.focus, ui.plate).toFixed(2)}`);
    assert.ok(ratio(ui.accent, ui.plate) >= 3, `${id}: selected control vs plate is ${ratio(ui.accent, ui.plate).toFixed(2)}`);
  }
});

test('rarity badges and legal page colors meet WCAG AA', () => {
  for (const { id, badge: [bg, fg] } of RARITIES) assert.ok(ratio(bg, fg) >= 4.5, `${id}: ${ratio(bg, fg).toFixed(2)}`);
  assert.ok(ratio('#2b1d0e', '#fff4d6') >= 4.5);
});

test('all requested skies exist, with unique ids', () => {
  assert.equal(new Set(SKY_IDS).size, SKY_IDS.length);
  for (const id of ['dawn', 'day', 'sunset', 'night', 'sunny', 'black', 'purple', 'cosmic', 'rain', 'storm', 'snow', 'fog', 'rainbow', 'blossom', 'autumn', 'winter', 'tropical', 'aurora', 'bloodmoon', 'volcano', 'twinmoons', 'meteor', 'handheld', 'arcade', 'sepia', 'vaporwave']) assert.ok(SKY_IDS.includes(id), id);
});

test('adaptive follows the local hour through the whole day', () => {
  assert.deepEqual([0, 4, 5, 7, 8, 16, 17, 19, 20, 23].map(adaptiveId), ['night', 'night', 'dawn', 'dawn', 'day', 'day', 'sunset', 'sunset', 'night', 'night']);
  assert.equal(resolveSky(ADAPTIVE, 12).id, 'day');
  assert.equal(resolveSky(ADAPTIVE, 22).id, 'night');
  assert.equal(resolveSky('cosmic', 12).id, 'cosmic');
});
