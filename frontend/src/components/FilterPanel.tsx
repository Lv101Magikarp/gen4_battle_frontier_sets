import type { Facets, Filters, StatCmp, StatFilter, StatKey } from "../types";
import { STAT_LABELS } from "../types";
import { tierColor, TIER_LABELS, typeColor } from "../theme";

interface Props {
  filters: Filters;
  facets: Facets | null;
  update: (patch: Partial<Filters>) => void;
  reset: () => void;
  // Mobile-only: hide the panel (it's toggled open from the Filters button).
  // Ignored on desktop, where the panel is always shown.
  collapsed?: boolean;
}

const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

// Clicking the comparison symbol cycles ≥ → ≤ → = → ≥.
const STAT_CMP_CYCLE: Record<StatCmp, StatCmp> = { ">=": "<=", "<=": "=", "=": ">=" };
const STAT_CMP_SYMBOL: Record<StatCmp, string> = { ">=": "≥", "<=": "≤", "=": "=" };

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

export function FilterPanel({ filters, facets, update, reset, collapsed }: Props) {
  const statFilters = filters.statFilters;

  const addStatFilter = () =>
    update({ statFilters: [...statFilters, { key: "hp", cmp: ">=", value: "" }] });

  const updateStatFilter = (i: number, patch: Partial<StatFilter>) =>
    update({ statFilters: statFilters.map((sf, idx) => (idx === i ? { ...sf, ...patch } : sf)) });

  const removeStatFilter = (i: number) =>
    update({ statFilters: statFilters.filter((_, idx) => idx !== i) });

  return (
    <aside className={`filters ${collapsed ? "filters--collapsed" : ""}`}>
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
        <span>Legendary</span>
        <div className="chips-row">
          <button
            className={`pill ${filters.legendaryOnly ? "pill--on" : ""}`}
            title="Show only Legendary/Mythical Pokémon (excludes pseudo-legendaries)"
            onClick={() => update({ legendaryOnly: !filters.legendaryOnly })}
          >
            Legendary only
          </button>
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
        <span>Final stats</span>
        <div className="stat-filters">
          {statFilters.map((sf, i) => (
            <div className="stat-filter" key={i}>
              <select
                value={sf.key}
                onChange={(e) => updateStatFilter(i, { key: e.target.value as StatKey })}
              >
                {STAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {STAT_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="gte"
                title="Toggle comparison (≥ / ≤ / =)"
                aria-label={`Comparison: ${sf.cmp}`}
                onClick={() => updateStatFilter(i, { cmp: STAT_CMP_CYCLE[sf.cmp] })}
              >
                {STAT_CMP_SYMBOL[sf.cmp]}
              </button>
              <input
                type="number"
                min={0}
                max={999}
                placeholder="100"
                value={sf.value}
                onChange={(e) => updateStatFilter(i, { value: e.target.value })}
              />
              <button
                type="button"
                className="stat-filter__remove"
                title="Remove this condition"
                aria-label="Remove stat condition"
                onClick={() => removeStatFilter(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn-link stat-filter__add" onClick={addStatFilter}>
            + Add stat condition
          </button>
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
