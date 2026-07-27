// Chooses the data source at build time:
//   - default / dev  -> FastAPI backend (via /api, proxied to :8000)
//   - VITE_DATA_MODE=static -> in-browser engine over the bundled sets.json
// The app only imports from here, so components are agnostic to the mode.
import type { Facets, Filters, SearchResponse } from "./types";
import { fetchFacets, fetchSearch } from "./api";
import { facetsLocal, searchLocal } from "./engine/localData";

export const IS_STATIC = import.meta.env.VITE_DATA_MODE === "static";

export function facets(): Promise<Facets> {
  return IS_STATIC ? facetsLocal() : fetchFacets();
}

export function search(f: Filters, signal?: AbortSignal): Promise<SearchResponse> {
  return IS_STATIC ? searchLocal(f) : fetchSearch(f, signal);
}
