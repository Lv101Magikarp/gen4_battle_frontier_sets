// The Battle Frontier is five facilities. This app currently has data for the
// Battle Factory; the others are modelled here so the mode toggle + facility-aware
// IV logic are in place, and enabling one later is mostly a matter of flipping
// `implemented` and supplying its data.
//
// IVs are uniform across stats and set by the facility:
//   * Factory:              0 / 4 / 8 / 12 / 16 / 20 / 24 / 31   (by tier band 1-8)
//   * Tower / Castle / Arcade: 3 / 6 / 9 / 12 / 15 / 18 / 21 / 31 (by tier band 1-8)
//   * Hall:                 rank-based (8/10/.../26 by Rank 1-10), not round-based
// Tower, Castle and Arcade also share the trainer roster in data/trainers.json, so
// their Trainers view is a distribution swap away once enabled.
export type FacilityId = "factory" | "tower" | "castle" | "arcade" | "hall";

export interface Facility {
  id: FacilityId;
  name: string; // "Battle Factory"
  short: string; // "Factory"
  implemented: boolean;
  blurb: string;
  // IV per tier band (1-8). Null for rank-based facilities (Hall).
  ivByTier: Record<number, number> | null;
}

const TOWER_IVS = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15, 6: 18, 7: 21, 8: 31 };

export const FACILITIES: Facility[] = [
  {
    id: "factory",
    name: "Battle Factory",
    short: "Factory",
    implemented: true,
    blurb: "Rent Pokémon and swap for a defeated opponent's. Uniform IVs rise each round.",
    ivByTier: { 1: 0, 2: 4, 3: 8, 4: 12, 5: 16, 6: 20, 7: 24, 8: 31 },
  },
  {
    id: "tower",
    name: "Battle Tower",
    short: "Tower",
    implemented: false,
    blurb: "Classic 3-on-3 streak battles with your own team.",
    ivByTier: TOWER_IVS,
  },
  {
    id: "castle",
    name: "Battle Castle",
    short: "Castle",
    implemented: false,
    blurb: "Spend Castle Points on items and healing between battles.",
    ivByTier: TOWER_IVS,
  },
  {
    id: "arcade",
    name: "Battle Arcade",
    short: "Arcade",
    implemented: false,
    blurb: "A roulette applies random effects to both sides before each battle.",
    ivByTier: TOWER_IVS,
  },
  {
    id: "hall",
    name: "Battle Hall",
    short: "Hall",
    implemented: false,
    blurb: "Solo battles against a chosen type; IVs scale with Rank, not the round.",
    ivByTier: null,
  },
];

export const DEFAULT_FACILITY: FacilityId = "factory";

export function getFacility(id: string | null | undefined): Facility {
  return FACILITIES.find((f) => f.id === id) ?? FACILITIES[0];
}
