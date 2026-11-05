// Prices and catalog, shared by the browser (display) and the server (the only place that charges or pays).
import { SIZES } from './fish.js';

export const RARITY_VALUE = { common: 5, uncommon: 12, rare: 30, epic: 80, gold: 250, black: 800, cosmic: 2500 };
export const SIZE_MULTIPLIER = { tiny: 1, small: 1.5, medium: 2.5, big: 4, huge: 8 };

// Rarer and bigger sells for more, and a heavier fish earns up to 25% more within its size.
export function fishPrice({ rarity, size, weight }) {
  const { min, max } = SIZES.find((s) => s.id === size);
  return Math.round(RARITY_VALUE[rarity] * SIZE_MULTIPLIER[size] * (1 + (0.25 * (weight - min)) / (max - min)));
}

export const CATALOG = [
  { id: 'fox', slot: 'angler', name: 'Fox angler', price: 300 },
  { id: 'penguin', slot: 'angler', name: 'Penguin angler', price: 600 },
  { id: 'robot', slot: 'angler', name: 'Robot angler', price: 1500 },
  { id: 'astronaut', slot: 'angler', name: 'Astronaut angler', price: 3000 },
  { id: 'flower', slot: 'hat', name: 'Flower', price: 100 },
  { id: 'partyhat', slot: 'hat', name: 'Party hat', price: 200 },
  { id: 'piratehat', slot: 'hat', name: 'Pirate hat', price: 500 },
  { id: 'wizardhat', slot: 'hat', name: 'Wizard hat', price: 800 },
  { id: 'crown', slot: 'hat', name: 'Crown', price: 2000 },
  { id: 'mustache', slot: 'face', name: 'Mustache', price: 150 },
  { id: 'sunglasses', slot: 'face', name: 'Sunglasses', price: 400 },
  { id: 'bamboorod', slot: 'rod', name: 'Bamboo rod', price: 150 },
  { id: 'neonrod', slot: 'rod', name: 'Neon rod', price: 500 },
  { id: 'goldrod', slot: 'rod', name: 'Gold rod', price: 1500 },
];

export const catalogItem = (id) => CATALOG.find((item) => item.id === id);
export const inSlot = (slot) => CATALOG.filter((item) => item.slot === slot);
