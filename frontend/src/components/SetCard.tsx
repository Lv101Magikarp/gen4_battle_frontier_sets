import { useState } from "react";
import type { PokeSet, StatKey } from "../types";
import { STAT_LABELS } from "../types";
import { spriteUrl, tierColor, TIER_LABELS, typeColor } from "../theme";
import { NATURE_EFFECT } from "../natures";

const STAT_ORDER: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const MAX_STAT = 255; // for bar scaling

export function SetCard({ set }: { set: PokeSet }) {
  const [imgOk, setImgOk] = useState(true);
  const effect = NATURE_EFFECT[set.nature];

  return (
    <article className="card">
      {set.tier && (
        <span
          className="tier-badge"
          style={{ background: tierColor(set.tier) }}
          title={`${TIER_LABELS[set.tier] ?? ""} tier${set.tierGroup ? ` · ${set.tierGroup}` : ""}`}
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
            <h3>{set.species}</h3>
            {set.setCount > 1 && (
              <span className="badge badge--set" title="Set index (order in the source table)">
                Set {set.setIndex}/{set.setCount}
              </span>
            )}
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
        {STAT_ORDER.map((k) => {
          const boosted = effect?.up === k;
          const hindered = effect?.down === k;
          return (
            <div key={k} className={`stat ${boosted ? "stat--up" : ""} ${hindered ? "stat--down" : ""}`}>
              <span className="stat__label">{STAT_LABELS[k]}</span>
              <div className="stat__bar">
                <div
                  className="stat__fill"
                  style={{ width: `${Math.min(100, (set.stats[k] / MAX_STAT) * 100)}%` }}
                />
              </div>
              <span className="stat__val">{set.stats[k]}</span>
              {set.evs[k] > 0 && <span className="stat__ev" title="EVs">{set.evs[k]}</span>}
            </div>
          );
        })}
      </div>
    </article>
  );
}
