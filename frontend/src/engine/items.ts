// Damage-relevant held-item effects for the Gen 4 calculator, matching the order
// and per-step flooring of @smogon/calc's DPP mechanics. Only items that change a
// damage roll are modelled; every other held item is identity (×1) via the
// fallbacks below, so the ~84 items in the data don't all need entries.
import type { StatKey } from "../types";

// Type-enhancing items: ×1.2 to moves of the matching type (Gen 4 value).
const TYPE_BOOST: Record<string, string> = {
  Charcoal: "Fire",
  "Mystic Water": "Water",
  "Sea Incense": "Water",
  "Wave Incense": "Water",
  Magnet: "Electric",
  "Miracle Seed": "Grass",
  "Rose Incense": "Grass",
  "Sharp Beak": "Flying",
  "Black Belt": "Fighting",
  "Poison Barb": "Poison",
  "Soft Sand": "Ground",
  "Hard Stone": "Rock",
  "Rock Incense": "Rock",
  "Silk Scarf": "Normal",
  "Spell Tag": "Ghost",
  "Odd Incense": "Psychic",
  "Twisted Spoon": "Psychic",
  NeverMeltIce: "Ice",
  "Dragon Fang": "Dragon",
  BlackGlasses: "Dark",
  "Metal Coat": "Steel",
  SilverPowder: "Bug",
};

// Pinch/resist berries: halve super-effective damage of the matching type.
const RESIST_BERRY: Record<string, string> = {
  "Occa Berry": "Fire",
  "Passho Berry": "Water",
  "Wacan Berry": "Electric",
  "Rindo Berry": "Grass",
  "Yache Berry": "Ice",
  "Chople Berry": "Fighting",
  "Shuca Berry": "Ground",
  "Coba Berry": "Flying",
  "Payapa Berry": "Psychic",
  "Charti Berry": "Rock",
  "Kasib Berry": "Ghost",
  "Haban Berry": "Dragon",
  "Colbur Berry": "Dark",
};

// Species-locked stat-doubling items.
const SPECIES_STAT_ITEM: Record<string, { species: string[]; stat: StatKey; mult: number }> = {
  "Thick Club": { species: ["Cubone", "Marowak"], stat: "atk", mult: 2 },
  DeepSeaScale: { species: ["Clamperl"], stat: "spd", mult: 2 },
};

// Base-power multiplier from the attacker's item: Muscle Band / Wise Glasses take
// precedence over type-enhancing items (they are mutually exclusive in @smogon's
// else-if chain, but items are unique so order is moot).
export function itemPowerMult(item: string, moveType: string, category: string): number {
  if (item === "Muscle Band" && category === "Physical") return 1.1;
  if (item === "Wise Glasses" && category === "Special") return 1.1;
  if (TYPE_BOOST[item] === moveType) return 1.2;
  return 1;
}

// Attacking-stat multiplier from the attacker's item (Choice items, Thick Club).
export function itemAttackMult(item: string, category: string, species: string): number {
  if (item === "Choice Band" && category === "Physical") return 1.5;
  if (item === "Choice Specs" && category === "Special") return 1.5;
  const s = SPECIES_STAT_ITEM[item];
  if (s && s.stat === "atk" && s.species.includes(species)) return s.mult;
  return 1;
}

// Defending-stat multiplier from the defender's item (e.g. DeepSeaScale SpD).
export function itemDefenseMult(item: string, stat: StatKey, species: string): number {
  const s = SPECIES_STAT_ITEM[item];
  if (s && s.stat === stat && s.species.includes(species)) return s.mult;
  return 1;
}

// Life Orb (×1.3, applied after crit in the final-mods step).
export function itemMod2Mult(item: string): number {
  return item === "Life Orb" ? 1.3 : 1;
}

// Fling base power by held item (Generation IV values, from PokéAPI's fling_power).
// Only items whose Gen 4 Fling power exceeds the 10 floor are listed; every other
// held item in the dataset (berries, incenses, Choice items, herbs, lenses, …)
// flings for 10, so flingPower() defaults unlisted held items to 10.
const FLING_POWER: Record<string, number> = {
  "Iron Ball": 130,
  "Hard Stone": 100,
  "Grip Claw": 90, "Thick Club": 90,
  "Quick Claw": 80, "Razor Claw": 80,
  "Dragon Fang": 70, "Poison Barb": 70,
  "Damp Rock": 60, "Heat Rock": 60, Stick: 60,
  "Sharp Beak": 50,
  "Icy Rock": 40, "Lucky Punch": 40,
  "Black Belt": 30, "Black Sludge": 30, BlackGlasses: 30, Charcoal: 30,
  "King's Rock": 30, "Life Orb": 30, "Light Clay": 30, Magnet: 30,
  "Metal Coat": 30, Metronome: 30, "Miracle Seed": 30, "Mystic Water": 30,
  NeverMeltIce: 30, "Razor Fang": 30, "Scope Lens": 30, "Shell Bell": 30,
  "Spell Tag": 30, "Toxic Orb": 30, "Twisted Spoon": 30, DeepSeaScale: 30,
};

// Fling's base power comes from the attacker's held item; no item => Fling fails (0).
export function flingPower(item: string): number {
  if (!item) return 0;
  return FLING_POWER[item] ?? 10;
}

// Expert Belt: ×1.2 on a super-effective hit (its own floored step in the roll).
export function expertBeltMult(item: string, effectiveness: number): number {
  return item === "Expert Belt" && effectiveness > 1 ? 1.2 : 1;
}

// Resist berry: ×0.5 on a super-effective hit of the matching type.
export function berryMult(defItem: string, moveType: string, effectiveness: number): number {
  return effectiveness > 1 && RESIST_BERRY[defItem] === moveType ? 0.5 : 1;
}
