// Client-side opponent-trainer engine: lazily loads the bundled trainers.json
// and answers "which trainers appear in round X / tier Y" plus "what roster (with
// stats at this trainer's IV) can this trainer field". Works in both dev and the
// static build because trainers.json is a plain asset in either case.
import type { PokeSet, RosterSet, Trainer, TrainerData, TrainerFilters } from "../types";
import { computeStats } from "./stats";

let cache: Promise<TrainerData> | null = null;

function dataUrl(): string {
  return `${import.meta.env.BASE_URL}trainers.json`;
}

export function loadTrainerData(): Promise<TrainerData> {
  if (!cache) {
    cache = fetch(dataUrl()).then((r) => {
      if (!r.ok) throw new Error(`Failed to load trainers: ${r.status}`);
      return r.json() as Promise<TrainerData>;
    });
  }
  return cache;
}

export function filterTrainers(data: TrainerData, f: TrainerFilters): Trainer[] {
  let ts = data.trainers;
  if (f.q) {
    const q = f.q.toLowerCase();
    ts = ts.filter((t) => t.name.toLowerCase().includes(q) || t.class.toLowerCase().includes(q));
  }
  if (f.trainerClass) ts = ts.filter((t) => t.class === f.trainerClass);
  if (f.tier != null) ts = ts.filter((t) => t.tier === f.tier);
  // A trainer "appears" in a round when its cell is a normal or 7th-battle check.
  if (f.round != null) ts = ts.filter((t) => t.rounds[f.round! - 1] !== "no");
  return ts;
}

// Build a PokeSet from a roster set + the IV the active facility assigns this
// trainer, so the existing SetCard can render it (tier/round-IV machinery inert).
export function rosterAsSets(data: TrainerData, trainer: Trainer, iv: number, level = 50): PokeSet[] {
  const idxs = data.groups[trainer.groupId] ?? [];
  return idxs.map((i) => toPokeSet(data.sets[i], iv, level));
}

function toPokeSet(s: RosterSet, iv: number, level: number): PokeSet {
  // Show the set-number suffix (e.g. "Venusaur3") only when we know the real set
  // number; otherwise present as a single set so SetCard omits the suffix.
  const known = s.setIndex != null;
  return {
    ...s,
    setIndex: s.setIndex ?? 1,
    setCount: known ? s.setCount : 1,
    tier: null,
    tierRank: null,
    tierGroup: null,
    tierIv: null,
    iv,
    stats: computeStats(s.baseStats, s.evs, s.nature, iv, level),
  };
}

export function trainerClasses(data: TrainerData): string[] {
  return Array.from(new Set(data.trainers.map((t) => t.class))).sort();
}

// Which set numbers (1-4) a trainer of each tier fields. Derived from the roster
// data: tiers 1-7 use one fixed set number; tier 8 spans all four (varies per
// Pokémon). Fully-evolved Pokémon are the ones with four distinct sets.
const SET_NUMBERS_BY_TIER: Record<number, number[]> = {
  1: [1], 2: [1], 3: [2], 4: [1], 5: [2], 6: [3], 7: [4], 8: [1, 2, 3, 4],
};

export function setNumbersForTier(tier: number): number[] {
  return SET_NUMBERS_BY_TIER[tier] ?? [];
}

// Compact label for a trainer's possible set numbers, e.g. "Set 3" or "Sets 1–4".
export function setNumberLabel(tier: number): string {
  const nums = setNumbersForTier(tier);
  if (nums.length === 0) return "";
  if (nums.length === 1) return `Set ${nums[0]}`;
  return `Sets ${nums[0]}–${nums[nums.length - 1]}`;
}
