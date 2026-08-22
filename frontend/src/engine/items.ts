// Damage-relevant held-item effects for the Gen 4 calculator. Only items that
// change a damage roll are modelled; every other held item (Leftovers, Focus
// Sash, Choice Scarf, incense with no type match, …) is identity (×1) via the
// `?? 1` / default-false fallbacks below, so the ~84 items in the data don't all
// need entries here.
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

// Base-power multiplier from the attacker's item (applied at the power step).
export function itemPowerMult(item: string, moveType: string, category: string): number {
  if (TYPE_BOOST[item] === moveType) return 1.2;
  if (item === "Muscle Band" && category === "Physical") return 1.1;
  if (item === "Wise Glasses" && category === "Special") return 1.1;
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

// Life Orb (Mod2, ×1.3 to all damaging moves).
export function itemMod2Mult(item: string): number {
  return item === "Life Orb" ? 1.3 : 1;
}

// Final (Mod3) multiplier: Expert Belt on a super-effective hit, and resist
// berries that halve a super-effective hit of their type.
export function itemMod3Mult(
  attackerItem: string,
  defenderItem: string,
  moveType: string,
  effectiveness: number,
): number {
  let m = 1;
  if (attackerItem === "Expert Belt" && effectiveness > 1) m *= 1.2;
  if (effectiveness > 1 && RESIST_BERRY[defenderItem] === moveType) m *= 0.5;
  return m;
}
