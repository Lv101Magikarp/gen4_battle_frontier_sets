import { useEffect, useMemo, useRef, useState } from "react";
import type { Trainer, TrainerData, TrainerFilters } from "../types";
import type { Facility } from "../facilities";
import {
  filterTrainers,
  loadTrainerData,
  rosterAsSets,
  setNumberLabel,
  trainerClasses,
} from "../engine/trainers";
import { trainerBattleSprite } from "../engine/trainerSprites";
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
  level = 50,
}: {
  initialTrainer?: number | null;
  facility: Facility;
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

  const selectedTrainer = useMemo(
    () => (data && selected != null ? data.trainers.find((t) => t.index === selected) ?? null : null),
    [data, selected],
  );
  const selectedIv = selectedTrainer ? ivFor(facility, selectedTrainer) : 0;
  const roster = useMemo(
    () => (data && selectedTrainer ? rosterAsSets(data, selectedTrainer, selectedIv, level) : []),
    [data, selectedTrainer, selectedIv, level],
  );

  if (error) return <div className="layout"><div className="error">{error}</div></div>;

  return (
    <div className="layout">
      <aside className="filters">
        <div className="filters__head">
          <h2>Filters</h2>
          <button className="btn-link" onClick={() => setFilters(DEFAULT)}>Reset</button>
        </div>

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
          Round X lists every trainer that can appear in that streak block. IVs use the Battle
          Factory distribution, fixed per trainer by index.{" "}
          {showRoster
            ? "A trainer randomly draws 3 Pokémon (4 in Doubles) from the roster shown when selected."
            : "In the Factory these opponents field random rental Pokémon, so no fixed team is shown — only their sprite, rounds and IV band."}
        </p>
      </aside>

      <main className="results">
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
                        <span className="roster__meta"> · roster ({roster.length}) · {selectedIv} IVs · {setNumberLabel(selectedTrainer.tier).toLowerCase()} · picks 3</span>
                      </h3>
                      <button className="btn-link" onClick={() => setSelected(null)}>Close</button>
                    </div>
                    <div className="grid">
                      {roster.map((s) => (
                        <SetCard key={s.id} set={s} fixedIv={selectedIv} level={level} />
                      ))}
                    </div>
                  </section>
                ) : (
                  <TrainerDetail t={selectedTrainer} iv={selectedIv} onClose={() => setSelected(null)} />
                )
              )}
            </div>
          ))}
          {data && matches.length === 0 && <div className="empty">No trainers match these filters.</div>}
        </div>
      </main>
    </div>
  );
}

function TrainerRow({
  t, iv, roundLabels, open, onToggle,
}: {
  t: Trainer;
  iv: number;
  roundLabels: string[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={`trainer-row ${open ? "trainer-row--open" : ""}`} onClick={onToggle}>
      <span className="trainer-row__idx">#{t.index}</span>
      <TrainerSprite t={t} className="trainer-row__sprite" />
      <span className="trainer-row__name">
        <span className="trainer-row__cls">{t.class}</span> {t.name}
      </span>
      <span className={`trainer-row__tier tier-${t.tier}`} title={`Tier ${t.tier} · ${iv} IVs`}>
        T{t.tier}
      </span>
      <span
        className="trainer-row__setnum"
        title="Set number(s) this trainer's Pokémon use (fully-evolved species have 4 sets)"
      >
        {setNumberLabel(t.tier)}
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

// Battle (VS) sprite for a trainer's class, with a graceful fallback to the class
// initials when no sprite exists (e.g. the PI class Showdown has no art for).
function TrainerSprite({ t, className }: { t: Trainer; className?: string }) {
  const src = trainerBattleSprite(t.class, t.gender);
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
      <TrainerSprite t={t} className="trainer-detail__sprite" />
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
