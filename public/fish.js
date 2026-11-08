// Shared by browser (guest catches, Fishing Guide) and server (account catches).
// Odds are out of 10,000 so the table stays exact integers. They are the odds for a 25-minute session
// (see rarityOdds for other lengths). badge is [background, text].
export const RARITIES = [
  { id: 'common', name: 'Common', odds: 5500, badge: ['#e2e6ea', '#1a1c2c'] },
  { id: 'uncommon', name: 'Uncommon', odds: 2500, badge: ['#1f7a3d', '#ffffff'] },
  { id: 'rare', name: 'Rare', odds: 1200, badge: ['#0b5fa8', '#ffffff'] },
  { id: 'epic', name: 'Epic', odds: 500, badge: ['#7a1fa8', '#ffffff'] },
  { id: 'gold', name: 'Legendary Gold', odds: 200, badge: ['#f5c542', '#3a2600'] },
  { id: 'black', name: 'Mythic Black', odds: 75, badge: ['#0a0a0c', '#ffffff'] },
  { id: 'cosmic', name: 'Cosmic', odds: 25, badge: ['#1a0b45', '#7cf5e6'] },
];

// min and max are in tenths of a pound; scale is the sprite's pixel size.
export const SIZES = [
  { id: 'tiny', name: 'Tiny', odds: 4000, min: 1, max: 9, scale: 2 },
  { id: 'small', name: 'Small', odds: 3000, min: 10, max: 49, scale: 3 },
  { id: 'medium', name: 'Medium', odds: 1800, min: 50, max: 149, scale: 4 },
  { id: 'big', name: 'Big', odds: 900, min: 150, max: 399, scale: 5 },
  { id: 'huge', name: 'Huge', odds: 300, min: 400, max: 1200, scale: 6 },
];

export const SPECIES = ['Minnow', 'Perch', 'Bass', 'Trout', 'Catfish', 'Puffer', 'Angelfish', 'Koi', 'Eel', 'Manta', 'Swordfish', 'Anglerfish']
  .map((name) => ({ id: name.toLowerCase(), name }));

const pick = (table, roll) => table.find((row) => (roll -= row.odds) < 0);

// Session lengths that guarantee a rarity or better.
export const GUARANTEES = [{ minutes: 30, rarity: 'uncommon' }, { minutes: 45, rarity: 'rare' }, { minutes: 60, rarity: 'epic' }];
const BASE_MINUTES = 25;

export const guaranteedRarity = (minutes) => GUARANTEES.findLast((g) => minutes >= g.minutes)?.rarity ?? null;

// A set is 4 rounds. Each round doubles the odds of Epic and rarer: x1, x2, x4, x8.
export const ROUNDS = 4;
export const BOOSTED_FROM = 'epic';
export const roundBoost = (round) => 2 ** (round - 1);
// The round after a catch. Round 4 starts a new set.
export const nextRound = (round) => (round % ROUNDS) + 1;
// The set carries on only if the next session starts within an hour of the last catch.
export const ROUND_GAP_MS = 60 * 60_000;
// last is { round, at }: the round the next session would be, and when the last fish was caught.
export const roundAt = (last, startedAt) => (last && startedAt - last.at <= ROUND_GAP_MS ? last.round : 1);
// When boosted odds would overflow, tiers above the guarantee shrink together to share 90%,
// so the guaranteed tier always keeps at least 10%.
const MAX_ABOVE_FLOOR = 9000;

// Each tier above the guarantee scales with session length, and Epic and up also with the round.
// The guaranteed tier takes what's left, and tiers below it can't be caught, so the table always adds up to exactly 10,000.
export function rarityOdds(minutes, round = 1) {
  const floor = Math.max(0, RARITIES.findIndex((r) => r.id === guaranteedRarity(minutes)));
  const boostFrom = RARITIES.findIndex((r) => r.id === BOOSTED_FROM);
  const raw = RARITIES.map((r, i) => (i > floor ? (r.odds * minutes * (i >= boostFrom ? roundBoost(round) : 1)) / BASE_MINUTES : 0));
  const total = raw.reduce((sum, odds) => sum + odds, 0);
  const squeeze = total > MAX_ABOVE_FLOOR ? MAX_ABOVE_FLOOR / total : 1;
  // Rounding down when squeezed keeps the shrunk tiers from adding up to a hair over 90%.
  const scaled = raw.map((odds) => (squeeze < 1 ? Math.floor(odds * squeeze) : Math.round(odds)));
  scaled[floor] = 10000 - scaled.reduce((sum, odds) => sum + odds, 0);
  return RARITIES.map((r, i) => ({ ...r, odds: scaled[i] }));
}

// rand(n) must return a uniform integer in [0, n). minutes is the length of the finished session, round is 1 to 4.
export function rollFish(rand, minutes, round = 1) {
  const size = pick(SIZES, rand(10000));
  return {
    species: SPECIES[rand(SPECIES.length)].id,
    rarity: pick(rarityOdds(minutes, round), rand(10000)).id,
    size: size.id,
    weight: size.min + rand(size.max - size.min + 1),
  };
}

const byId = (table, id) => table.find((row) => row.id === id);
export const rarityOf = (fish) => byId(RARITIES, fish.rarity);
export const sizeOf = (fish) => byId(SIZES, fish.size);
export const fishName = (fish) => `${sizeOf(fish).name} ${rarityOf(fish).name} ${byId(SPECIES, fish.species).name}`;
export const fishWeight = (fish) => `${(fish.weight / 10).toFixed(1)} lb`;
