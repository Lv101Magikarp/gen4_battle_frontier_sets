export interface Move {
  name: string;
  type: string;
}

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type StatMap = Record<StatKey, number>;

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
  setIndex: number | null;
  statKey: StatKey | "";
  statMin: string;
  sort: string;
  order: "asc" | "desc";
  tier4Iv: number;
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
