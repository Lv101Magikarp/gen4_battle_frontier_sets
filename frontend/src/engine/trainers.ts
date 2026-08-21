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

// Build a PokeSet from a roster set + the trainer's fixed IV, so the existing
// SetCard can render it (with the tier/round-IV machinery left inert).
export function rosterAsSets(data: TrainerData, trainer: Trainer): PokeSet[] {
  const idxs = data.groups[trainer.groupId] ?? [];
  return idxs.map((i) => toPokeSet(data.sets[i], trainer.iv));
}

function toPokeSet(s: RosterSet, iv: number): PokeSet {
  return {
    ...s,
    setIndex: 1,
    setCount: 1,
    tier: null,
    tierRank: null,
    tierGroup: null,
    tierIv: null,
    iv,
    stats: computeStats(s.baseStats, s.evs, s.nature, iv),
  };
}

export function trainerClasses(data: TrainerData): string[] {
  return Array.from(new Set(data.trainers.map((t) => t.class))).sort();
}
