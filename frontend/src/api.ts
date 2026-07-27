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
  if (f.setIndex != null) p.set("setIndex", String(f.setIndex));
  if (f.statKey && f.statMin) p.set(`${f.statKey}Min`, f.statMin);
  p.set("iv", String(f.iv));
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
