export interface Move {
  name: string;
  type: string;
}

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type StatMap = Record<StatKey, number>;
export type StatCmp = ">=" | "<=" | "=";

// One computed-stat condition. Several can be combined (AND) — e.g. two rows on
// the same stat with ≥ and ≤ form a range; rows on different stats narrow across
// stats. `value` is kept as a string so the number input can be cleared.
export interface StatFilter {
  key: StatKey;
  cmp: StatCmp;
  value: string;
}

export interface PokeSet {
  id: string;
  dexNum: number;
  species: string;
  setIndex: number;
  setCount: number;
  item: string;
  nature: string;
  moves: Move[];
  evs: StatMap;
  types: string[];
  abilities: string[];
  baseStats: StatMap;
  weight: number; // kilograms (Gen IV); used by weight-based moves (Grass Knot…)
  legendary: boolean; // species is a Legendary/Mythical (excludes pseudo-legendaries)
  stats: StatMap;
  iv: number;
  tier: string | null;
  tierRank: number | null;
  tierGroup: string | null;
  tierIv: number | null;
}

export interface SearchResponse {
  count: number;
  tier4Iv: number;
  tier4Ivs: number[];
  results: PokeSet[];
}

export interface Facets {
  items: string[];
  natures: string[];
  abilities: string[];
  types: string[];
  moves: string[];
  setIndexes: number[];
  tiers: string[];
  stats: StatKey[];
  total: number;
}

export interface Filters {
  q: string;
  move: string;
  item: string;
  nature: string;
  ability: string;
  type: string;
  tier: string;
  pokeTier: number | null; // Battle Factory tier 1-8 (IV bracket); tier 8 = all Tier 4+ sets
  legendaryOnly: boolean; // show only Legendary/Mythical species
  setIndex: number | null;
  statFilters: StatFilter[]; // computed-stat conditions, AND-combined
  sort: string;
  order: "asc" | "desc";
  tier4Iv: number;
  level: number; // battle level (50 or 100); transport for level-aware sort/filter
}

// Tier 4+ sets are used across rounds 8+ with these increasing IVs.
export const TIER4_IVS = [12, 16, 20, 24, 31];

// ---- Opponent trainer database (data/trainers.json) ----

// A roster set is a PokeSet without the tier/round-IV bookkeeping: the IV comes
// from the trainer, not the set, so stats are computed per-trainer.
export interface RosterSet {
  id: string;
  dexNum: number;
  species: string;
  item: string;
  nature: string;
  moves: Move[];
  evs: StatMap;
  types: string[];
  abilities: string[];
  baseStats: StatMap;
  weight: number; // kilograms (Gen IV); used by weight-based moves (Grass Knot…)
  legendary: boolean; // species is a Legendary/Mythical (excludes pseudo-legendaries)
  setIndex: number | null; // set number 1-4 (null for trainer-exclusive variants)
  setCount: number; // how many sets the species has
}

export type RoundState = "no" | "yes" | "boss";

export interface Trainer {
  index: number;
  class: string;
  gender: "male" | "female" | null;
  name: string;
  tier: number;
  iv: number;
  rounds: RoundState[]; // length 8, one per round
  groupId: string;
  // True for tier-8 "boss" trainers whose entire roster is Legendary. Stored for
  // Battle Tower/Castle/Arcade (where trainers ARE tied to set lists); not shown in
  // the current Battle Factory UI, where opponents rent random Pokémon not tied to
  // their class. Wire into TrainersView once Tower mode is implemented.
  alwaysLegendary?: boolean;
}

export interface TrainerData {
  roundLabels: string[];
  ivByTier: Record<string, number>;
  sets: RosterSet[];
  groups: Record<string, number[]>; // groupId -> indices into sets
  trainers: Trainer[];
}

export interface TrainerFilters {
  q: string;
  trainerClass: string;
  round: number | null; // 1-8
  tier: number | null; // 1-8
}

export const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
