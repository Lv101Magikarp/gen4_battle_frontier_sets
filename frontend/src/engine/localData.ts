// Static data engine: loads sets.json in the browser and runs the same
// filter/sort/facets logic as backend/app/search.py, so the app works with no
// server (GitHub Pages). Selected at build time via VITE_DATA_MODE=static.
import type { Facets, Filters, PokeSet, SearchResponse, StatKey } from "../types";
import type { RawSet } from "./stats";
import { computeSet, DEFAULT_TIER4_IV, STAT_KEYS, TIER4_IVS } from "./stats";

const TIER_ORDER = ["X", "S", "A+", "A-", "B", "C", "D+", "D-", "E", "F"];

// Battle Factory tier 1-8 (the IV bracket a set is drawn at). Tiers 1/2/3 are the
// fixed-IV groups (tierIv 0/4/8); tiers 4-7 are the four Tier 4+ set slots
// (set 1->tier 4, 2->5, 3->6, 4->7); tier 8 is the round-50+ pool where all four
// Tier 4+ sets appear (at IV 31). Mirrors the ivByTier map in facilities.ts.
export function setMatchesPokeTier(s: PokeSet, tier: number): boolean {
  switch (tier) {
    case 1:
      return s.tierIv === 0;
    case 2:
      return s.tierIv === 4;
    case 3:
      return s.tierIv === 8;
    case 4:
    case 5:
    case 6:
    case 7:
      return s.tierIv == null && s.setIndex === tier - 3;
    case 8:
      return s.tierIv == null;
    default:
      return true;
  }
}

let cache: Promise<RawSet[]> | null = null;

function datasetUrl(): string {
  // BASE_URL is "/" in dev and "/<repo>/" for the Pages build.
  return `${import.meta.env.BASE_URL}sets.json`;
}

async function loadRaw(): Promise<RawSet[]> {
  if (!cache) {
    cache = fetch(datasetUrl()).then((r) => {
      if (!r.ok) throw new Error(`Failed to load dataset: ${r.status}`);
      return r.json();
    });
  }
  return cache;
}

function sortResults(results: PokeSet[], sort: string, order: "asc" | "desc"): PokeSet[] {
  const reverse = order === "desc";
  if (sort === "tier") {
    const ranked = results
      .filter((s) => s.tierRank != null)
      .sort((a, b) => a.tierRank! - b.tierRank! || a.dexNum - b.dexNum || a.setIndex - b.setIndex);
    if (reverse) ranked.reverse();
    const untiered = results.filter((s) => s.tierRank == null);
    return [...ranked, ...untiered];
  }
  const key = (s: PokeSet): number | string => {
    if ((STAT_KEYS as string[]).includes(sort)) return s.stats[sort as StatKey];
    if (sort === "species") return s.species.toLowerCase();
    return (s as unknown as Record<string, number>)[sort] ?? 0;
  };
  return [...results].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    let cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    if (cmp === 0) cmp = a.dexNum - b.dexNum || a.setIndex - b.setIndex;
    return reverse ? -cmp : cmp;
  });
}

export async function searchLocal(f: Filters): Promise<SearchResponse> {
  const raw = await loadRaw();
  const tier4Iv = f.tier4Iv ?? DEFAULT_TIER4_IV;
  const level = f.level ?? 50;
  let results = raw.map((s) => computeSet(s, tier4Iv, level));

  if (f.q) {
    const q = f.q.toLowerCase();
    results = results.filter((s) => s.species.toLowerCase().includes(q));
  }
  if (f.move) {
    const m = f.move.toLowerCase();
    results = results.filter((s) => s.moves.some((mv) => mv.name.toLowerCase().includes(m)));
  }
  if (f.item) results = results.filter((s) => s.item.toLowerCase() === f.item.toLowerCase());
  if (f.nature) results = results.filter((s) => s.nature.toLowerCase() === f.nature.toLowerCase());
  if (f.ability) {
    const a = f.ability.toLowerCase();
    results = results.filter((s) => s.abilities.some((x) => x.toLowerCase() === a));
  }
  if (f.type) {
    const t = f.type.toLowerCase();
    results = results.filter((s) => s.types.some((x) => x.toLowerCase() === t));
  }
  if (f.tier) results = results.filter((s) => s.tier === f.tier);
  if (f.pokeTier != null) results = results.filter((s) => setMatchesPokeTier(s, f.pokeTier as number));
  if (f.setIndex != null) results = results.filter((s) => s.setIndex === f.setIndex);
  if (f.statKey && f.statMin) {
    const min = Number(f.statMin);
    if (!Number.isNaN(min)) results = results.filter((s) => s.stats[f.statKey as StatKey] >= min);
  }

  results = sortResults(results, f.sort, f.order);
  return { count: results.length, tier4Iv, tier4Ivs: TIER4_IVS, results };
}

export async function facetsLocal(): Promise<Facets> {
  const raw = await loadRaw();
  const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();
  const present = new Set(raw.map((s) => s.tier).filter(Boolean) as string[]);
  return {
    items: uniq(raw.map((s) => s.item)),
    natures: uniq(raw.map((s) => s.nature)),
    abilities: uniq(raw.flatMap((s) => s.abilities)),
    types: uniq(raw.flatMap((s) => s.types)),
    moves: uniq(raw.flatMap((s) => s.moves.map((m) => m.name))),
    setIndexes: Array.from(new Set(raw.map((s) => s.setIndex))).sort((a, b) => a - b),
    tiers: TIER_ORDER.filter((t) => present.has(t)),
    stats: STAT_KEYS,
    total: raw.length,
  };
}
