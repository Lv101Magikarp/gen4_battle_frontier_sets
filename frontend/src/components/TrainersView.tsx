import { useEffect, useMemo, useRef, useState } from "react";
import type { Trainer, TrainerData, TrainerFilters } from "../types";
import { FACILITIES } from "../facilities";
import type { Facility, FacilityId } from "../facilities";
import {
  filterTrainers,
  loadTrainerData,
  rosterAsSets,
  rosterRawSets,
  rosterTheme,
  fixedSetIndex,
  setIndexLabel,
  trainerClasses,
} from "../engine/trainers";
import type { RosterCategory } from "../engine/trainers";
import { trainerBattleSprite, trainerOverworldSprite } from "../engine/trainerSprites";
import { typeColor } from "../theme";
import { SetCard } from "./SetCard";

const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8];
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8];

const DEFAULT: TrainerFilters = { q: "", trainerClass: "", round: null, tier: null };

// IV a trainer uses under the active facility (falls back to the value baked into
// the dataset, which is the Battle Factory distribution).
function ivFor(facility: Facility, t: Trainer): number {
  return facility.ivByTier?.[t.tier] ?? t.iv;
}

export function TrainersView({
  initialTrainer = null,
  facility,
  onFacilityChange,
  level = 50,
}: {
  initialTrainer?: number | null;
  facility: Facility;
  onFacilityChange: (id: FacilityId) => void;
  level?: number;
}) {
  const [data, setData] = useState<TrainerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TrainerFilters>(DEFAULT);
  const [selected, setSelectedState] = useState<number | null>(initialTrainer);

  // Selecting a trainer deep-links to it (#trainers/<index>) for shareable URLs.
  const setSelected = (idx: number | null) => {
    setSelectedState(idx);
    window.location.hash = idx != null ? `trainers/${idx}` : "trainers";
  };

  const selectedRef = useRef<HTMLDivElement | null>(null);
  const didScroll = useRef(false);

  useEffect(() => {
    loadTrainerData().then(setData).catch((e) => setError(String(e)));
  }, []);

  // On a deep link (#trainers/<index>), scroll the opened trainer into view once.
  useEffect(() => {
    if (data && initialTrainer != null && !didScroll.current && selectedRef.current) {
      didScroll.current = true;
      selectedRef.current.scrollIntoView({ block: "start" });
    }
  }, [data, initialTrainer]);

  const set = (patch: Partial<TrainerFilters>) => setFilters((f) => ({ ...f, ...patch }));

  // The per-trainer Pokémon roster only means something for the fixed-team
  // facilities (Tower / Castle / Arcade share that roster). In the Battle Factory
  // opponents field random *rental* Pokémon each streak, so the roster is
  // meaningless there — we hide it and show the trainer instead.
  const showRoster = facility.id !== "factory";

  const classes = useMemo(() => (data ? trainerClasses(data) : []), [data]);
  const matches = useMemo(() => (data ? filterTrainers(data, filters) : []), [data, filters]);
  // Each trainer's locked set number (null = draws from all four), derived once
  // per roster group so the list rows and the opened roster agree.
  const setIdxByGroup = useMemo(() => {
    const m = new Map<string, number | null>();
    if (data)
      for (const t of data.trainers)
        if (!m.has(t.groupId)) m.set(t.groupId, fixedSetIndex(data, t));
    return m;
  }, [data]);

  const selectedTrainer = useMemo(
    () => (data && selected != null ? data.trainers.find((t) => t.index === selected) ?? null : null),
    [data, selected],
  );
  const selectedIv = selectedTrainer ? ivFor(facility, selectedTrainer) : 0;
  const roster = useMemo(
    () => (data && selectedTrainer ? rosterAsSets(data, selectedTrainer, selectedIv, level) : []),
    [data, selectedTrainer, selectedIv, level],
  );
  // Category chips summarise the pool; the full ~50-card grid is collapsed until
  // the user expands it. Opening a different trainer re-collapses it. The theme is
  // derived from the raw set rows (toPokeSet drops the real set numbers).
  const rawRoster = useMemo(
    () => (data && selectedTrainer ? rosterRawSets(data, selectedTrainer) : []),
    [data, selectedTrainer],
  );
  const theme = useMemo(() => rosterTheme(rawRoster), [rawRoster]);
  const [rosterOpen, setRosterOpen] = useState(false);
  useEffect(() => setRosterOpen(false), [selected]);

  if (error) return <div className="layout"><div className="error">{error}</div></div>;

  return (
    <div className="layout">
      <aside className="filters">
        <div className="filters__head">
          <h2>Filters</h2>
          <button className="btn-link" onClick={() => setFilters(DEFAULT)}>Reset</button>
        </div>

        <label className="field">
          <span>Facility</span>
          <select
            value={facility.id}
            onChange={(e) => onFacilityChange(e.target.value as FacilityId)}
            title="Battle Frontier facility — sets the IV distribution and roster behaviour"
          >
            {FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.implemented ? "" : " · soon"}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Trainer / class</span>
          <input
            type="search"
            value={filters.q}
            placeholder="e.g. Ace Trainer, Mena"
            onChange={(e) => set({ q: e.target.value })}
          />
        </label>

        <div className="field">
          <span>Round (consecutive battle)</span>
          <div className="tier-chips">
            <button className={`tier-pill ${filters.round == null ? "tier-pill--on" : ""}`} onClick={() => set({ round: null })}>All</button>
            {ROUNDS.map((r) => (
              <button
                key={r}
                className={`tier-pill ${filters.round === r ? "tier-pill--on" : ""}`}
                title={data ? `Battles ${data.roundLabels[r - 1]}` : undefined}
                onClick={() => set({ round: filters.round === r ? null : r })}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Tier (IV)</span>
          <div className="tier-chips">
            <button className={`tier-pill ${filters.tier == null ? "tier-pill--on" : ""}`} onClick={() => set({ tier: null })}>All</button>
            {TIERS.map((t) => (
              <button
                key={t}
                className={`tier-pill ${filters.tier === t ? "tier-pill--on" : ""}`}
                title={facility.ivByTier ? `${facility.ivByTier[t]} IVs` : undefined}
                onClick={() => set({ tier: filters.tier === t ? null : t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Class</span>
          <select value={filters.trainerClass} onChange={(e) => set({ trainerClass: e.target.value })}>
            <option value="">Any</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <p className="filters__note">
          Round X lists every trainer that can appear in that streak block. IVs use the{" "}
          {facility.name} distribution, fixed per trainer by index.{" "}
          {showRoster
            ? "A trainer randomly draws 3 Pokémon (4 in Doubles) from the roster shown when selected."
            : "In the Factory these opponents field random rental Pokémon, so no fixed team is shown — only their sprite, rounds and IV band."}
        </p>
      </aside>

      <main className="results">
        {!facility.implemented ? (
          <FacilityPlaceholder facility={facility} />
        ) : (
        <>
        <div className="results__bar">
          <span className="results__count">
            {data ? `${matches.length} trainer${matches.length === 1 ? "" : "s"}` : "Loading…"}
          </span>
        </div>

        <div className="trainer-list">
          {matches.map((t) => (
            <div
              key={t.index}
              className="trainer-item"
              ref={selected === t.index ? selectedRef : undefined}
            >
              <TrainerRow
                t={t}
                iv={ivFor(facility, t)}
                setIndex={setIdxByGroup.get(t.groupId) ?? null}
                roundLabels={data!.roundLabels}
                open={selected === t.index}
                onToggle={() => setSelected(selected === t.index ? null : t.index)}
              />
              {selected === t.index && selectedTrainer && (
                showRoster ? (
                  <section className="roster">
                    <div className="roster__head">
                      <h3>
                        {selectedTrainer.class} {selectedTrainer.name}
                        <span className="roster__meta"> · {selectedIv} IVs · picks 3 of {roster.length}</span>
                      </h3>
                      <button className="btn-link" onClick={() => setSelected(null)}>Close</button>
                    </div>
                    <div className="roster__cats">
                      <span className="roster__cats-label">Picks from</span>
                      {theme.categories.map((c) => (
                        <CategoryChip key={c.label} cat={c} />
                      ))}
                      {theme.mostly.length > 0 && (
                        <span className="roster__mostly">mostly {theme.mostly.join(", ")}</span>
                      )}
                      {theme.setIndex != null ? (
                        <span className="chip roster__cat roster__cat--setindex">
                          Set {theme.setIndex} only
                        </span>
                      ) : (
                        <span className="roster__mostly">· sets 1–4</span>
                      )}
                    </div>
                    <button
                      className="roster__expand"
                      onClick={() => setRosterOpen((o) => !o)}
                      aria-expanded={rosterOpen}
                    >
                      {rosterOpen ? "Hide" : "Show"} full roster ({roster.length}) {rosterOpen ? "▲" : "▼"}
                    </button>
                    {rosterOpen && (
                      <div className="grid">
                        {roster.map((s) => (
                          <SetCard key={s.id} set={s} fixedIv={selectedIv} level={level} />
                        ))}
                      </div>
                    )}
                  </section>
                ) : (
                  <TrainerDetail t={selectedTrainer} iv={selectedIv} onClose={() => setSelected(null)} />
                )
              )}
            </div>
          ))}
          {data && matches.length === 0 && <div className="empty">No trainers match these filters.</div>}
        </div>
        </>
        )}
      </main>
    </div>
  );
}

// Shown in the Trainers tab when a not-yet-implemented facility is selected: keeps
// the facility picker usable so you can switch back to Factory/Tower.
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
          Pick <strong>Battle Factory</strong> or <strong>Battle Tower</strong> above for a working roster.
        </p>
      </div>
    </div>
  );
}

// A single roster-category chip. Type categories are coloured by their Pokémon
// type; the non-type categories (Legendaries/Starters/Eeveelutions/Varied) use
// neutral accent styling.
function CategoryChip({ cat }: { cat: RosterCategory }) {
  if (cat.kind === "type") {
    return (
      <span className="chip roster__cat" style={{ background: typeColor(cat.type!) }}>
        {cat.label}
      </span>
    );
  }
  return <span className={`chip roster__cat roster__cat--${cat.kind}`}>{cat.label}</span>;
}

function TrainerRow({
  t, iv, setIndex, roundLabels, open, onToggle,
}: {
  t: Trainer;
  iv: number;
  setIndex: number | null;
  roundLabels: string[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={`trainer-row ${open ? "trainer-row--open" : ""}`} onClick={onToggle}>
      <span className="trainer-row__idx">#{t.index}</span>
      <TrainerSprite t={t} variant="overworld" className="trainer-row__sprite" />
      <span className="trainer-row__name">
        <span className="trainer-row__cls">{t.class}</span> {t.name}
      </span>
      <span className={`trainer-row__tier tier-${t.tier}`} title={`Tier ${t.tier} · ${iv} IVs`}>
        T{t.tier}
      </span>
      <span
        className="trainer-row__setnum"
        title="Set number this trainer's Pokémon use, derived from its pool (locked to one set, or all four)"
      >
        {setIndexLabel(setIndex)}
      </span>
      <span className="trainer-row__iv">{iv} IV</span>
      <span className="round-chips">
        {t.rounds.map((r, i) => (
          <span
            key={i}
            className={`round-chip round-chip--${r}`}
            title={`Round ${i + 1} (battles ${roundLabels[i]})${r === "boss" ? " — 7th battle only" : r === "no" ? " — absent" : ""}`}
          >
            {i + 1}
          </span>
        ))}
      </span>
    </button>
  );
}

// A trainer's class sprite — the overworld (walking) sprite in lists, the battle
// (VS) sprite in the detail panel — with a graceful fallback to the class initials
// when no sprite exists (e.g. the PI class Showdown has no art for).
function TrainerSprite({
  t, className, variant = "battle",
}: {
  t: Trainer;
  className?: string;
  variant?: "battle" | "overworld";
}) {
  const src =
    variant === "overworld"
      ? trainerOverworldSprite(t.class, t.gender)
      : trainerBattleSprite(t.class, t.gender);
  const [ok, setOk] = useState(true);
  const initials = t.class
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`trainer-sprite ${className ?? ""}`} aria-hidden="true">
      {src && ok ? (
        <img src={src} alt="" loading="lazy" onError={() => setOk(false)} />
      ) : (
        <span className="trainer-sprite__fallback">{initials}</span>
      )}
    </span>
  );
}

// Factory replacement for the roster grid: the trainer's battle sprite plus a note
// that Factory opponents rent random Pokémon, so there is no fixed team to show.
function TrainerDetail({ t, iv, onClose }: { t: Trainer; iv: number; onClose: () => void }) {
  return (
    <section className="trainer-detail">
      <div className="trainer-detail__sprites">
        <TrainerSprite t={t} variant="battle" className="trainer-detail__sprite" />
        <TrainerSprite t={t} variant="overworld" className="trainer-detail__ow" />
      </div>
      <div className="trainer-detail__body">
        <div className="trainer-detail__head">
          <h3>
            {t.class} {t.name}
            <span className="roster__meta"> · tier {t.tier} · {iv} IVs</span>
          </h3>
          <button className="btn-link" onClick={onClose}>Close</button>
        </div>
        <p className="trainer-detail__note">
          In the Battle Factory this trainer fields <strong>random rental Pokémon</strong> drawn each
          streak, so there is no fixed team to list — only the round appearances and IV band above
          are meaningful here.
        </p>
      </div>
    </section>
  );
}
