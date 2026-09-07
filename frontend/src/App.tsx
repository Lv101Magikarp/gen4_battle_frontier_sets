import { useEffect, useMemo, useRef, useState } from "react";
import type { Facets, Filters, PokeSet, StatKey } from "./types";
import { STAT_LABELS } from "./types";
import { facets as fetchFacets, search as fetchSearch } from "./dataClient";
import { FilterPanel } from "./components/FilterPanel";
import { SetCard } from "./components/SetCard";
import { TrainersView } from "./components/TrainersView";
import { DamageCalcView, type Side as CalcSide } from "./components/DamageCalcView";
import { FACILITIES, getFacility } from "./facilities";
import type { Facility, FacilityId } from "./facilities";
import type { IvMode } from "./engine/stats";
import type { Weather } from "./engine/damage";

type View = "sets" | "trainers" | "calc";

const FACILITY_KEY = "facility";
const LEVEL_KEY = "level";
const IV_MODE_KEY = "ivMode";

// Deep links: "#trainers" opens the Trainers tab, "#trainers/150" also opens that
// trainer's roster (index read by TrainersView); "#calc" opens the calculator.
function parseHash(): { view: View; trainer: number | null } {
  const [v, id] = window.location.hash.replace(/^#/, "").split("/");
  const view: View = v === "trainers" ? "trainers" : v === "calc" ? "calc" : "sets";
  return { view, trainer: id ? Number(id) : null };
}

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
  pokeTier: null,
  setIndex: null,
  statKey: "",
  statMin: "",
  sort: "dexNum",
  order: "asc",
  tier4Iv: 31,
  level: 50,
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "dexNum", label: "Dex number" },
  { value: "species", label: "Name" },
  { value: "tier", label: "Magpie rating" },
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

// Battle level (Lv 50 vs Open Level 100). A persisted global setting like the
// facility/theme — unaffected by the filter Reset.
function useLevel(): [number, (n: number) => void] {
  const [level, setLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(LEVEL_KEY));
    return stored === 100 ? 100 : 50;
  });
  useEffect(() => {
    localStorage.setItem(LEVEL_KEY, String(level));
  }, [level]);
  return [level, setLevel];
}

// Default-IV mode for Tier 4+ set cards (flat 31 vs per set-slot round IV). A
// persisted global setting like the level/theme; the per-card dropdown still lets
// you override any single card.
function useIvMode(): [IvMode, (m: IvMode) => void] {
  const [mode, setMode] = useState<IvMode>(() =>
    localStorage.getItem(IV_MODE_KEY) === "rank" ? "rank" : "max",
  );
  useEffect(() => {
    localStorage.setItem(IV_MODE_KEY, mode);
  }, [mode]);
  return [mode, setMode];
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
  const [view, setView] = useState<View>(() => parseHash().view);
  const [facilityId, setFacilityId] = useState<FacilityId>(
    () => getFacility(localStorage.getItem(FACILITY_KEY)).id,
  );
  const [theme, toggleTheme] = useTheme();
  const [level, setLevel] = useLevel();
  const [ivMode, setIvMode] = useIvMode();
  // Calculator state lives here (not inside DamageCalcView) so the two sides and
  // weather survive switching away from and back to the Calculator tab.
  const [calcA, setCalcA] = useState<CalcSide | null>(null);
  const [calcB, setCalcB] = useState<CalcSide | null>(null);
  const [calcWeather, setCalcWeather] = useState<Weather>("none");

  const facility = getFacility(facilityId);
  const levelOptions = facility.levels ?? [];
  const showLevelToggle = levelOptions.length > 1;
  useEffect(() => {
    localStorage.setItem(FACILITY_KEY, facilityId);
  }, [facilityId]);

  const initialTrainer = useMemo(() => parseHash().trainer, []);
  const goto = (v: View) => {
    setView(v);
    window.location.hash = v === "sets" ? "" : v;
  };
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  // Reset clears the filter panel but keeps the Pokémon search box intact.
  const reset = () => setFilters((f) => ({ ...DEFAULT_FILTERS, q: f.q }));

  const pinnedIds = useMemo(() => new Set(pinned.map((s) => s.id)), [pinned]);
  const togglePin = (set: PokeSet) =>
    setPinned((prev) =>
      prev.some((s) => s.id === set.id)
        ? prev.filter((s) => s.id !== set.id)
        : [...prev, set],
    );

  // Persist pins. Each pinned card computes its own stats (per-set IV).
  useEffect(() => {
    localStorage.setItem(PIN_KEY, JSON.stringify(pinned));
  }, [pinned]);

  useEffect(() => {
    fetchFacets().then(setFacets).catch((e) => setError(String(e)));
  }, []);

  // Debounced search whenever filters (or the battle level) change. The level is
  // a top-level setting, not a filter, so it's injected here for level-aware sort/filter.
  useEffect(() => {
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      fetchSearch({ ...filters, level }, ctrl.signal)
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
  }, [filters, level]);

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
    if (filters.pokeTier != null) n++;
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
            <p className="subtitle">
              Platinum · HG / SS · <span className="subtitle__facility">{facility.name}</span>
            </p>
          </div>
        </div>

        <div className="topbar__search">
          {view === "sets" && (
            <input
              className="search"
              type="search"
              value={filters.q}
              placeholder="Search a Pokémon…"
              onChange={(e) => update({ q: e.target.value })}
              autoFocus
            />
          )}
        </div>

        <div className="topbar__controls">
          <label className="facility-select" title="Battle Frontier facility">
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value as FacilityId)}
            >
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.implemented ? "" : " · soon"}
                </option>
              ))}
            </select>
          </label>
          {showLevelToggle && (
            <div className="viewnav level-toggle" role="group" aria-label="Battle level">
              {levelOptions.map((lv) => (
                <button
                  key={lv}
                  className={`viewnav__btn ${level === lv ? "viewnav__btn--on" : ""}`}
                  onClick={() => setLevel(lv)}
                  aria-pressed={level === lv}
                  title={lv === 100 ? "Open Level (Lv 100)" : "Lv 50"}
                >
                  Lv {lv}
                </button>
              ))}
            </div>
          )}
          <div className="viewnav" role="tablist">
            <button
              className={`viewnav__btn ${view === "sets" ? "viewnav__btn--on" : ""}`}
              onClick={() => goto("sets")}
              role="tab"
              aria-selected={view === "sets"}
            >
              Sets
            </button>
            <button
              className={`viewnav__btn ${view === "trainers" ? "viewnav__btn--on" : ""}`}
              onClick={() => goto("trainers")}
              role="tab"
              aria-selected={view === "trainers"}
            >
              Trainers
            </button>
            <button
              className={`viewnav__btn ${view === "calc" ? "viewnav__btn--on" : ""}`}
              onClick={() => goto("calc")}
              role="tab"
              aria-selected={view === "calc"}
            >
              Calculator
            </button>
          </div>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {!facility.implemented ? (
        <FacilityPlaceholder facility={facility} />
      ) : view === "trainers" ? (
        <TrainersView initialTrainer={initialTrainer} facility={facility} level={level} />
      ) : view === "calc" ? (
        <DamageCalcView
          level={level}
          a={calcA}
          b={calcB}
          weather={calcWeather}
          pinned={pinned}
          setA={setCalcA}
          setB={setCalcB}
          setWeather={setCalcWeather}
          ivMode={ivMode}
        />
      ) : (
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
            <div className="results__tools">
              <div
                className="viewnav iv-toggle"
                role="group"
                aria-label="Default IVs for Tier 4+ sets"
                title="Default IVs for Tier 4+ set cards. Tier uses each set slot's Battle Factory tier IV (set 1→12, 2→16, 3→20, 4→24); the per-card dropdown still overrides any single card."
              >
                <span className="iv-toggle__label">Default IVs</span>
                <button
                  className={`viewnav__btn ${ivMode === "max" ? "viewnav__btn--on" : ""}`}
                  onClick={() => setIvMode("max")}
                  aria-pressed={ivMode === "max"}
                >
                  31
                </button>
                <button
                  className={`viewnav__btn ${ivMode === "rank" ? "viewnav__btn--on" : ""}`}
                  onClick={() => setIvMode("rank")}
                  aria-pressed={ivMode === "rank"}
                >
                  Tier
                </button>
              </div>
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
          </div>

          {error && <div className="error">{error}</div>}

          {pinned.length > 0 && (
            <section className="pinned">
              <div className="pinned__head">
                <h2>📌 Pinned · {pinned.length}</h2>
                <button className="btn-link" onClick={() => setPinned([])}>
                  Clear all
                </button>
              </div>
              <div className="grid">
                {pinned.map((set) => (
                  <SetCard key={set.id} set={set} pinned level={level} ivMode={ivMode} onTogglePin={() => togglePin(set)} />
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
                level={level}
                ivMode={ivMode}
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
      )}

      <footer className="footer">
        Data from{" "}
        <a href="https://bulbapedia.bulbagarden.net/wiki/List_of_Battle_Frontier_Pok%C3%A9mon_in_Generation_IV/Group_1" target="_blank" rel="noreferrer">
          Bulbapedia
        </a>{" "}
        & <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokéAPI</a>. Currently
        showing <strong>Battle Factory</strong> data — abilities are possible options; final stats
        are computed at <strong>Lv {level}</strong> with the facility's tier-based IVs. Other Frontier
        facilities are planned.
      </footer>
    </div>
  );
}

// Shown when a not-yet-implemented facility is selected: keeps the mode toggle
// honest about what has data behind it.
function FacilityPlaceholder({ facility }: { facility: Facility }) {
  return (
    <div className="facility-stub">
      <div className="facility-stub__card">
        <h2>{facility.name}</h2>
        <p className="facility-stub__soon">Not implemented yet</p>
        <p>{facility.blurb}</p>
        {facility.ivByTier ? (
          <p className="facility-stub__ivs">
            Planned IVs by tier: {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => facility.ivByTier![t]).join(" / ")}
          </p>
        ) : (
          <p className="facility-stub__ivs">IVs scale with Rank (rank-based), not the battle round.</p>
        )}
        <p className="facility-stub__hint">
          Switch back to <strong>Battle Factory</strong> for the implemented Sets &amp; Trainers views.
        </p>
      </div>
    </div>
  );
}
