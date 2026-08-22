// Data loading for the damage calculator: the rental sets (with Lv-50 stats
// computed the same way as the Sets view) and the Gen 4 move dex built by
// scripts/build_moves.py. Both are served from BASE_URL as static JSON, so this
// works in dev, API mode, and the static Pages build alike.
import type { PokeSet } from "../types";
import type { RawSet } from "./stats";
import { computeSet, DEFAULT_TIER4_IV } from "./stats";
import type { MoveData } from "./damage";

export type MoveDex = Record<
  string,
  { type: string; category: "Physical" | "Special" | "Status"; basePower: number | null; accuracy: number | null }
>;

function url(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

let rawCache: Promise<RawSet[]> | null = null;
const setsByLevel = new Map<number, Promise<PokeSet[]>>();
let movesCache: Promise<MoveDex> | null = null;

function loadRaw(): Promise<RawSet[]> {
  if (!rawCache) {
    rawCache = fetch(url("sets.json")).then((r) => {
      if (!r.ok) throw new Error(`Failed to load sets: ${r.status}`);
      return r.json() as Promise<RawSet[]>;
    });
  }
  return rawCache;
}

export function loadCalcSets(level = 50): Promise<PokeSet[]> {
  let cached = setsByLevel.get(level);
  if (!cached) {
    // Tier 4+ sets use the max round IV (31); lower tiers use their fixed IV.
    cached = loadRaw().then((raw) => raw.map((s) => computeSet(s, DEFAULT_TIER4_IV, level)));
    setsByLevel.set(level, cached);
  }
  return cached;
}

export function loadMoveDex(): Promise<MoveDex> {
  if (!movesCache) {
    movesCache = fetch(url("moves.json")).then((r) => {
      if (!r.ok) throw new Error(`Failed to load moves: ${r.status}`);
      return r.json() as Promise<MoveDex>;
    });
  }
  return movesCache;
}

// Resolve a move name (from a set) to full MoveData. Falls back to the set's own
// type and a Status/no-power stub if the move is somehow missing from the dex.
export function resolveMove(dex: MoveDex, name: string, fallbackType: string): MoveData {
  const m = dex[name];
  if (!m) return { name, type: fallbackType, category: "Status", basePower: null, accuracy: null };
  return { name, type: m.type, category: m.category, basePower: m.basePower, accuracy: m.accuracy };
}
