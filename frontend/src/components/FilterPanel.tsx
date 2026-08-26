import type { Facets, Filters, StatKey } from "../types";
import { STAT_LABELS } from "../types";
import { tierColor, TIER_LABELS, typeColor } from "../theme";

interface Props {
  filters: Filters;
  facets: Facets | null;
  update: (patch: Partial<Filters>) => void;
  reset: () => void;
}

const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

// Battle Factory tier 1-8 = the IV bracket a set is drawn at (see setMatchesPokeTier).
const POKE_TIERS = [1, 2, 3, 4, 5, 6, 7, 8];
const POKE_TIER_TITLES: Record<number, string> = {
  1: "Tier 1 · IV 0 · Very Weak pool",
  2: "Tier 2 · IV 4 · NFE set 1",
  3: "Tier 3 · IV 8 · NFE set 2",
  4: "Tier 4 · IV 12 · Tier 4+ set 1",
  5: "Tier 5 · IV 16 · Tier 4+ set 2",
  6: "Tier 6 · IV 20 · Tier 4+ set 3",
  7: "Tier 7 · IV 24 · Tier 4+ set 4",
  8: "Tier 8 · IV 31 · Tier 4+, all sets 1-4",
};

export function FilterPanel({ filters, facets, update, reset }: Props) {
  return (
    <aside className="filters">
      <div className="filters__head">
        <h2>Filters</h2>
        <button className="btn-link" onClick={reset}>
          Reset
        </button>
      </div>

      <label className="field">
        <span>Move</span>
        <input
          list="moves-list"
          value={filters.move}
          placeholder="e.g. Earthquake"
          onChange={(e) => update({ move: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Type</span>
        <select value={filters.type} onChange={(e) => update({ type: e.target.value })}>
          <option value="">Any</option>
          {facets?.types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Ability</span>
        <select value={filters.ability} onChange={(e) => update({ ability: e.target.value })}>
          <option value="">Any</option>
          {facets?.abilities.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Item</span>
          <select value={filters.item} onChange={(e) => update({ item: e.target.value })}>
            <option value="">Any</option>
            {facets?.items.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nature</span>
          <select value={filters.nature} onChange={(e) => update({ nature: e.target.value })}>
            <option value="">Any</option>
            {facets?.natures.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Magpie rating</span>
        <div className="tier-chips">
          <button
            className={`tier-pill ${!filters.tier ? "tier-pill--on" : ""}`}
            onClick={() => update({ tier: "" })}
          >
            All
          </button>
          {(facets?.tiers ?? []).map((t) => (
            <button
              key={t}
              className={`tier-pill ${filters.tier === t ? "tier-pill--on" : ""}`}
              style={
                filters.tier === t
                  ? { background: tierColor(t), borderColor: tierColor(t), color: "#fff" }
                  : { color: tierColor(t), borderColor: tierColor(t) }
              }
              title={`${TIER_LABELS[t] ?? ""} rating`}
              onClick={() => update({ tier: filters.tier === t ? "" : t })}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Pokémon tier</span>
        <div className="chips-row">
          <button
            className={`pill ${filters.pokeTier == null ? "pill--on" : ""}`}
            onClick={() => update({ pokeTier: null })}
          >
            All
          </button>
          {POKE_TIERS.map((t) => (
            <button
              key={t}
              className={`pill ${filters.pokeTier === t ? "pill--on" : ""}`}
              title={POKE_TIER_TITLES[t]}
              onClick={() => update({ pokeTier: filters.pokeTier === t ? null : t })}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Set index</span>
        <div className="chips-row">
          <button
            className={`pill ${filters.setIndex == null ? "pill--on" : ""}`}
            onClick={() => update({ setIndex: null })}
          >
            All
          </button>
          {(facets?.setIndexes ?? [1, 2, 3, 4]).map((n) => (
            <button
              key={n}
              className={`pill ${filters.setIndex === n ? "pill--on" : ""}`}
              onClick={() => update({ setIndex: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Minimum final stat</span>
        <div className="stat-filter">
          <select
            value={filters.statKey}
            onChange={(e) => update({ statKey: e.target.value as StatKey | "" })}
          >
            <option value="">—</option>
            {STAT_KEYS.map((k) => (
              <option key={k} value={k}>
                {STAT_LABELS[k]}
              </option>
            ))}
          </select>
          <span className="gte">≥</span>
          <input
            type="number"
            min={0}
            max={999}
            placeholder="100"
            value={filters.statMin}
            disabled={!filters.statKey}
            onChange={(e) => update({ statMin: e.target.value })}
          />
        </div>
      </div>

      <div className="field type-legend">
        <span>Type legend</span>
        <div className="legend">
          {facets?.types.map((t) => (
            <span key={t} className="chip chip--sm" style={{ background: typeColor(t) }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <datalist id="moves-list">
        {facets?.moves.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </aside>
  );
}
