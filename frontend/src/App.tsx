import { useEffect, useMemo, useRef, useState } from "react";
import type { Facets, Filters, PokeSet, StatKey } from "./types";
import { STAT_LABELS, TIER4_IVS } from "./types";
import { facets as fetchFacets, search as fetchSearch } from "./dataClient";
import { computeSet } from "./engine/stats";
import { FilterPanel } from "./components/FilterPanel";
import { SetCard } from "./components/SetCard";

const PIN_KEY = "pinnedSets";

function loadPinned(): PokeSet[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as PokeSet[]) : [];
  } catch {
    return [];
  }
}

// Infinite scroll: render this many cards at a time and append more (with their
// sprites) as the user scrolls, so we never mount ~950 cards/images at once.
const BATCH_SIZE = 36;

const DEFAULT_FILTERS: Filters = {
  q: "",
  move: "",
  item: "",
  nature: "",
  ability: "",
  type: "",
  tier: "",
  setIndex: null,
  statKey: "",
  statMin: "",
  sort: "dexNum",
  order: "asc",
  tier4Iv: 31,
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "dexNum", label: "Dex number" },
  { value: "species", label: "Name" },
  { value: "tier", label: "Magpie tier" },
  { value: "setIndex", label: "Set index" },
  ...(["hp", "atk", "def", "spa", "spd", "spe"] as StatKey[]).map((k) => ({
    value: k,
    label: STAT_LABELS[k],
  })),
];

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [results, setResults] = useState<PokeSet[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [pinned, setPinned] = useState<PokeSet[]>(loadPinned);
  const [theme, toggleTheme] = useTheme();
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const reset = () => setFilters(DEFAULT_FILTERS);

  const pinnedIds = useMemo(() => new Set(pinned.map((s) => s.id)), [pinned]);
  const togglePin = (set: PokeSet) =>
    setPinned((prev) =>
      prev.some((s) => s.id === set.id)
        ? prev.filter((s) => s.id !== set.id)
        : [...prev, set],
    );

  // Persist pins and keep pinned stats in sync with the current Tier 4+ IV.
  useEffect(() => {
    localStorage.setItem(PIN_KEY, JSON.stringify(pinned));
  }, [pinned]);
  const pinnedComputed = useMemo(
    () => pinned.map((s) => computeSet(s, filters.tier4Iv)),
    [pinned, filters.tier4Iv],
  );

  useEffect(() => {
    fetchFacets().then(setFacets).catch((e) => setError(String(e)));
  }, []);

  // Debounced search whenever filters change.
  useEffect(() => {
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      fetchSearch(filters, ctrl.signal)
        .then((r) => {
          setResults(r.results);
          setCount(r.count);
          setVisibleCount(BATCH_SIZE); // reset infinite-scroll window on new results
          setError(null);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(String(e));
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(handle);
  }, [filters]);

  // Pinned sets are shown in their own tray, not duplicated in the results grid.
  const unpinned = useMemo(
    () => results.filter((s) => !pinnedIds.has(s.id)),
    [results, pinnedIds],
  );

  // Grow the visible window when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= unpinned.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + BATCH_SIZE, unpinned.length));
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [unpinned.length, visibleCount]);

  const visible = useMemo(() => unpinned.slice(0, visibleCount), [unpinned, visibleCount]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.move) n++;
    if (filters.item) n++;
    if (filters.nature) n++;
    if (filters.ability) n++;
    if (filters.type) n++;
    if (filters.tier) n++;
    if (filters.setIndex != null) n++;
    if (filters.statKey && filters.statMin) n++;
    return n;
  }, [filters]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="logo">▲</span>
          <div>
            <h1>Gen 4 Battle Frontier Sets</h1>
            <p className="subtitle">Platinum · HeartGold / SoulSilver — {facets?.total ?? "…"} sets</p>
          </div>
        </div>

        <div className="topbar__search">
          <input
            className="search"
            type="search"
            value={filters.q}
            placeholder="Search a Pokémon…"
            onChange={(e) => update({ q: e.target.value })}
            autoFocus
          />
        </div>

        <div className="topbar__controls">
          <label
            className="iv-control"
            title="IVs are fixed by tier (Tier 1=0, 2=4, 3=8). This picks the IV for Tier 4+ sets, which are used across rounds 8+ with 12/16/20/24/31 IVs."
          >
            Tier 4+ IV
            <select
              value={filters.tier4Iv}
              onChange={(e) => update({ tier4Iv: Number(e.target.value) })}
            >
              {TIER4_IVS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <div className="layout">
        <FilterPanel filters={filters} facets={facets} update={update} reset={reset} />

        <main className="results">
          <div className="results__bar">
            <span className="results__count">
              {loading ? "Searching…" : `${count} set${count === 1 ? "" : "s"}`}
              {activeFilterCount > 0 && !loading && (
                <span className="results__filters"> · {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}</span>
              )}
            </span>
            <label className="sort">
              Sort
              <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                title="Toggle order"
                onClick={() => update({ order: filters.order === "asc" ? "desc" : "asc" })}
              >
                {filters.order === "asc" ? "↑" : "↓"}
              </button>
            </label>
          </div>

          {error && <div className="error">{error}</div>}

          {pinnedComputed.length > 0 && (
            <section className="pinned">
              <div className="pinned__head">
                <h2>📌 Pinned · {pinnedComputed.length}</h2>
                <button className="btn-link" onClick={() => setPinned([])}>
                  Clear all
                </button>
              </div>
              <div className="grid">
                {pinnedComputed.map((set) => (
                  <SetCard key={set.id} set={set} pinned onTogglePin={() => togglePin(set)} />
                ))}
              </div>
            </section>
          )}

          {!error && count === 0 && !loading && (
            <div className="empty">No sets match these filters.</div>
          )}

          <div className={`grid ${loading ? "grid--loading" : ""}`}>
            {visible.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                pinned={pinnedIds.has(set.id)}
                onTogglePin={() => togglePin(set)}
              />
            ))}
          </div>

          {visibleCount < unpinned.length && (
            <div ref={sentinelRef} className="sentinel">
              Loading more… ({visibleCount} of {unpinned.length})
            </div>
          )}
        </main>
      </div>

      <footer className="footer">
        Data from{" "}
        <a href="https://bulbapedia.bulbagarden.net/wiki/List_of_Battle_Frontier_Pok%C3%A9mon_in_Generation_IV/Group_1" target="_blank" rel="noreferrer">
          Bulbapedia
        </a>{" "}
        & <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokéAPI</a>. Abilities are
        possible options; final stats are computed at Lv 50 with tier-based IVs (Tier 1/2/3 =
        0/4/8, Tier 4+ = {filters.tier4Iv}).
      </footer>
    </div>
  );
}
