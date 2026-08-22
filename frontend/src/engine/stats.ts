// Client-side port of backend/app/stats.py + the IV-by-tier logic in search.py.
// Shared by the static data engine and by pinned-set recomputation, so stat
// numbers are identical whether the app talks to FastAPI or runs fully static.
import type { PokeSet, StatKey, StatMap } from "../types";
import { NATURE_EFFECT } from "../natures";

export const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

export const TIER4_IVS = [12, 16, 20, 24, 31];
export const DEFAULT_TIER4_IV = 31;

// Tier 1/2/3 sets have a fixed game-accurate IV (0/4/8, stored as tierIv) used as
// the default, but can be previewed across the full round progression like Tier 4+.
export const LOWER_TIER_IVS = [0, 4, 8, 12, 16, 20, 24, 31];

// A raw dataset record (sets.json) has everything except the computed fields.
export type RawSet = Omit<PokeSet, "stats" | "iv">;

function natureMods(nature: string): StatMap {
  const mods: StatMap = { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
  const effect = NATURE_EFFECT[nature];
  if (effect) {
    mods[effect.up] = 1.1;
    mods[effect.down] = 0.9;
  }
  return mods;
}

function computeStat(base: number, ev: number, iv: number, mod: number, isHp: boolean, level = 50): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  return isHp ? core + level + 10 : Math.floor((core + 5) * mod);
}

export function computeStats(
  baseStats: StatMap,
  evs: StatMap,
  nature: string,
  iv: number,
  level = 50,
): StatMap {
  const mods = natureMods(nature);
  const out = {} as StatMap;
  for (const k of STAT_KEYS) {
    out[k] = computeStat(baseStats[k], evs[k] ?? 0, iv, mods[k], k === "hp", level);
  }
  return out;
}

// IVs are fixed by tier (Tier 1/2/3 -> 0/4/8, stored as tierIv); Tier 4+ (null)
// uses the caller-selected value from the round-8+ progression.
export function ivForSet(s: RawSet | PokeSet, tier4Iv: number): number {
  return s.tierIv ?? tier4Iv;
}

export function computeSet(s: RawSet | PokeSet, tier4Iv: number, level = 50): PokeSet {
  const iv = ivForSet(s, tier4Iv);
  return { ...s, iv, stats: computeStats(s.baseStats, s.evs, s.nature, iv, level) };
}
