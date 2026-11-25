import type { Facets, Filters, SearchResponse } from "./types";

export function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.move) p.set("move", f.move);
  if (f.item) p.set("item", f.item);
  if (f.nature) p.set("nature", f.nature);
  if (f.ability) p.set("ability", f.ability);
  if (f.type) p.set("type", f.type);
  if (f.tier) p.set("tier", f.tier);
  if (f.pokeTier != null) p.set("pokeTier", String(f.pokeTier));
  if (f.legendaryOnly) p.set("legendaryOnly", "true");
  if (f.setIndex != null) p.set("setIndex", String(f.setIndex));
  // Collapse the stat conditions into the backend's one-Min/one-Max-per-stat
  // shape: ≥ raises the min, ≤ lowers the max, = pins both. Multiple rows on the
  // same stat merge to the tightest bound (so ≥100 AND ≤150 becomes a range).
  const statMin: Partial<Record<string, number>> = {};
  const statMax: Partial<Record<string, number>> = {};
  for (const sf of f.statFilters) {
    if (!sf.key || sf.value === "") continue;
    const v = Number(sf.value);
    if (Number.isNaN(v)) continue;
    if (sf.cmp !== "<=") statMin[sf.key] = Math.max(statMin[sf.key] ?? v, v);
    if (sf.cmp !== ">=") statMax[sf.key] = Math.min(statMax[sf.key] ?? v, v);
  }
  for (const [k, v] of Object.entries(statMin)) p.set(`${k}Min`, String(v));
  for (const [k, v] of Object.entries(statMax)) p.set(`${k}Max`, String(v));
  p.set("tier4Iv", String(f.tier4Iv));
  p.set("level", String(f.level));
  p.set("sort", f.sort);
  p.set("order", f.order);
  return p.toString();
}

export async function fetchSearch(f: Filters, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await fetch(`/api/search?${buildQuery(f)}`, { signal });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function fetchFacets(): Promise<Facets> {
  const res = await fetch("/api/facets");
  if (!res.ok) throw new Error(`Facets failed: ${res.status}`);
  return res.json();
}
