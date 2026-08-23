import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import type { PokeSet, StatKey } from "../types";
import { STAT_LABELS } from "../types";
import { spriteUrl, tierColor, TIER_LABELS, typeColor } from "../theme";
import { NATURE_EFFECT } from "../natures";
import { computeStats, TIER4_IVS, LOWER_TIER_IVS, RANK_IV_BY_SET_INDEX } from "../engine/stats";
import type { IvMode } from "../engine/stats";

const STAT_ORDER: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const MAX_STAT = 255; // for bar scaling

interface SetCardProps {
  set: PokeSet;
  pinned?: boolean;
  onTogglePin?: () => void;
  // When set (trainer roster context), the IV is fixed by the trainer: show it as
  // a static label instead of the round-progression dropdown.
  fixedIv?: number;
  // Battle level for the stat computation (Factory Lv 50 / Open Level 100).
  level?: number;
  // Default-IV mode for Tier 4+ sets: "max" -> 31, "rank" -> per set-slot round IV.
  ivMode?: IvMode;
}

export function SetCard({ set, pinned = false, onTogglePin, fixedIv, level = 50, ivMode = "max" }: SetCardProps) {
  const [imgOk, setImgOk] = useState(true);
  const effect = NATURE_EFFECT[set.nature];

  // Every set can be previewed per-set across a round IV progression. Tier 1/2/3
  // default to their fixed game-accurate IV (tierIv 0/4/8); Tier 4+ default to 31.
  // Stats are computed client-side from the selected IV.
  const isTier4 = set.tierIv == null;
  const ivOptions = isTier4 ? TIER4_IVS : LOWER_TIER_IVS;
  // Card default IV: the set's own default (31 for Tier 4+ / tierIv for lower),
  // except a Tier 4+ set in "rank" mode defaults to its set-slot's round IV.
  const defaultIv =
    isTier4 && ivMode === "rank" ? RANK_IV_BY_SET_INDEX[set.setIndex] ?? set.iv : set.iv;
  const [ivState, setIv] = useState(defaultIv);
  // Follow the global default when the mode (or set) changes; a manual pick in the
  // dropdown sticks until then.
  useEffect(() => setIv(defaultIv), [defaultIv]);
  const iv = fixedIv ?? ivState;
  const stats = useMemo(
    () => computeStats(set.baseStats, set.evs, set.nature, iv, level),
    [set.baseStats, set.evs, set.nature, iv, level],
  );
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <article
      className={`card ${pinned ? "card--pinned" : ""} ${onTogglePin ? "card--clickable" : ""}`}
      onClick={onTogglePin}
      role={onTogglePin ? "button" : undefined}
      aria-pressed={onTogglePin ? pinned : undefined}
      title={onTogglePin ? (pinned ? "Click to unpin" : "Click to pin") : undefined}
    >
      {onTogglePin && (
        <span className={`pin-badge ${pinned ? "pin-badge--on" : ""}`} aria-hidden="true">
          📌
        </span>
      )}
      {set.tier && (
        <span
          className="tier-badge"
          style={{ background: tierColor(set.tier) }}
          title={`${TIER_LABELS[set.tier] ?? ""} rating${set.tierGroup ? ` · ${set.tierGroup}` : ""}`}
        >
          {set.tier}
        </span>
      )}
      <header className="card__head">
        <div className="card__sprite">
          {imgOk ? (
            <img
              src={spriteUrl(set.dexNum)}
              alt={set.species}
              loading="lazy"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="card__sprite-fallback">#{set.dexNum}</span>
          )}
        </div>
        <div className="card__title">
          <div className="card__name-row">
            <h3
              title={
                set.setCount > 1
                  ? `Set ${set.setIndex} of ${set.setCount} (community name: ${set.species}${set.setIndex})`
                  : undefined
              }
            >
              {set.species}
              {set.setCount > 1 && <span className="card__setnum">{set.setIndex}</span>}
            </h3>
          </div>
          <div className="card__types">
            {set.types.map((t) => (
              <span key={t} className="chip" style={{ background: typeColor(t) }}>
                {t}
              </span>
            ))}
            <span className="dex">#{String(set.dexNum).padStart(3, "0")}</span>
          </div>
        </div>
      </header>

      <div className="card__meta">
        <div className="meta">
          <span className="meta__label">Item</span>
          <span className="meta__value">{set.item || "—"}</span>
        </div>
        <div className="meta">
          <span className="meta__label">Nature</span>
          <span className="meta__value">
            {set.nature}
            {effect && (
              <span className="nature-fx">
                {" "}
                <span className="up">+{STAT_LABELS[effect.up]}</span>{" "}
                <span className="down">−{STAT_LABELS[effect.down]}</span>
              </span>
            )}
          </span>
        </div>
        <div className="meta">
          <span className="meta__label">Ability</span>
          <span className="meta__value meta__value--muted" title="Possible abilities (source does not specify the exact one)">
            {set.abilities.join(" / ") || "—"}
          </span>
        </div>
      </div>

      <ul className="moves">
        {set.moves.map((m, i) => (
          <li key={i} className="move" style={{ borderLeftColor: typeColor(m.type) }}>
            <span className="move__name">{m.name}</span>
            <span className="move__type" style={{ color: typeColor(m.type) }}>
              {m.type}
            </span>
          </li>
        ))}
      </ul>

      <div className="stats">
        <div className="stats__caption">
          <span>Final stats · Lv {level}</span>
          {fixedIv != null ? (
            <span className="stats__iv-fixed" title="IV is fixed by this trainer">
              {fixedIv} IVs
            </span>
          ) : (
            <label
              className="stats__iv-select"
              title={
                isTier4
                  ? "Preview this set's stats at a round-8+ IV"
                  : "Preview this set's stats at any IV (defaults to its tier's fixed IV)"
              }
              onClick={stop}
            >
              <select value={iv} onChange={(e) => setIv(Number(e.target.value))} onClick={stop}>
                {ivOptions.map((v) => (
                  <option key={v} value={v}>
                    {v} IVs
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {STAT_ORDER.map((k) => {
          const boosted = effect?.up === k;
          const hindered = effect?.down === k;
          return (
            <div key={k} className={`stat ${boosted ? "stat--up" : ""} ${hindered ? "stat--down" : ""}`}>
              <span className="stat__label">{STAT_LABELS[k]}</span>
              <div className="stat__bar">
                <div
                  className="stat__fill"
                  style={{ width: `${Math.min(100, (stats[k] / MAX_STAT) * 100)}%` }}
                />
              </div>
              <span className="stat__val">{stats[k]}</span>
              {set.evs[k] > 0 && <span className="stat__ev" title="EVs">{set.evs[k]}</span>}
            </div>
          );
        })}
      </div>
    </article>
  );
}
