import { useEffect, useMemo, useState } from "react";
import type { Trainer, TrainerData, TrainerFilters } from "../types";
import { filterTrainers, loadTrainerData, rosterAsSets, trainerClasses } from "../engine/trainers";
import { SetCard } from "./SetCard";

const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8];
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8];

const DEFAULT: TrainerFilters = { q: "", trainerClass: "", round: null, tier: null };

export function TrainersView({ initialTrainer = null }: { initialTrainer?: number | null }) {
  const [data, setData] = useState<TrainerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TrainerFilters>(DEFAULT);
  const [selected, setSelectedState] = useState<number | null>(initialTrainer);

  // Selecting a trainer deep-links to it (#trainers/<index>) for shareable URLs.
  const setSelected = (idx: number | null) => {
    setSelectedState(idx);
    window.location.hash = idx != null ? `trainers/${idx}` : "trainers";
  };

  useEffect(() => {
    loadTrainerData().then(setData).catch((e) => setError(String(e)));
  }, []);

  const set = (patch: Partial<TrainerFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const classes = useMemo(() => (data ? trainerClasses(data) : []), [data]);
  const matches = useMemo(() => (data ? filterTrainers(data, filters) : []), [data, filters]);

  const selectedTrainer = useMemo(
    () => (data && selected != null ? data.trainers.find((t) => t.index === selected) ?? null : null),
    [data, selected],
  );
  const roster = useMemo(
    () => (data && selectedTrainer ? rosterAsSets(data, selectedTrainer) : []),
    [data, selectedTrainer],
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
                title={data ? `${data.ivByTier[String(t)]} IVs` : undefined}
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
          Factory distribution, fixed per trainer by index. A trainer randomly draws 3 Pokémon (4
          in Doubles) from the roster shown when selected.
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
            <div key={t.index} className="trainer-item">
              <TrainerRow
                t={t}
                roundLabels={data!.roundLabels}
                open={selected === t.index}
                onToggle={() => setSelected(selected === t.index ? null : t.index)}
              />
              {selected === t.index && selectedTrainer && (
                <section className="roster">
                  <div className="roster__head">
                    <h3>
                      {selectedTrainer.class} {selectedTrainer.name}
                      <span className="roster__meta"> · roster ({roster.length}) · {selectedTrainer.iv} IVs · picks 3</span>
                    </h3>
                    <button className="btn-link" onClick={() => setSelected(null)}>Close</button>
                  </div>
                  <div className="grid">
                    {roster.map((s) => (
                      <SetCard key={s.id} set={s} fixedIv={selectedTrainer.iv} />
                    ))}
                  </div>
                </section>
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
  t, roundLabels, open, onToggle,
}: {
  t: Trainer;
  roundLabels: string[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={`trainer-row ${open ? "trainer-row--open" : ""}`} onClick={onToggle}>
      <span className="trainer-row__idx">#{t.index}</span>
      <span className="trainer-row__name">
        <span className="trainer-row__cls">{t.class}</span> {t.name}
      </span>
      <span className={`trainer-row__tier tier-${t.tier}`} title={`Tier ${t.tier} · ${t.iv} IVs`}>
        T{t.tier}
      </span>
      <span className="trainer-row__iv">{t.iv} IV</span>
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
