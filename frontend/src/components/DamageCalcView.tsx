import { useEffect, useMemo, useState } from "react";
import type { PokeSet, StatKey } from "../types";
import { STAT_LABELS } from "../types";
import { spriteUrl, typeColor } from "../theme";
import { loadCalcSets, loadMoveDex, resolveMove, DEFAULT_TIER4_IV, type MoveDex } from "../engine/calcData";
import { computeStats, LOWER_TIER_IVS } from "../engine/stats";
import {
  calcDamage, koChance, type Combatant, type Field, type Weather,
} from "../engine/damage";

const NO_BOOST: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const STAGES = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
const WEATHERS: { id: Weather; label: string }[] = [
  { id: "none", label: "No weather" },
  { id: "sun", label: "Sun" },
  { id: "rain", label: "Rain" },
  { id: "sand", label: "Sandstorm" },
  { id: "hail", label: "Hail" },
];

type StatusKind = "none" | "burn" | "other";
const STATUSES: { id: StatusKind; label: string }[] = [
  { id: "none", label: "Healthy" },
  { id: "burn", label: "Burned" },
  { id: "other", label: "Statused" },
];

// The two combatants are symmetric: each is both an attacker (its own moves) and a
// defender (takes the other's moves) so we can show the mirror. Conditions therefore
// belong to the Pokémon, not to a fixed "attacker"/"defender" role: status/pinch/crit
// and offensive stages apply when it attacks; screens and defensive stages apply when
// it defends. Item/ability start from the chosen set but are overridable.
interface Side {
  species: string;
  setIndex: number;
  item: string;
  ability: string;
  iv: number;
  status: StatusKind;
  pinch: boolean;
  crit: boolean;
  reflect: boolean;
  lightScreen: boolean;
  atkStage: number;
  spaStage: number;
  defStage: number;
  spdStage: number;
}

const DEFAULT_COND = {
  status: "none" as StatusKind,
  pinch: false,
  crit: false,
  reflect: false,
  lightScreen: false,
  atkStage: 0,
  spaStage: 0,
  defStage: 0,
  spdStage: 0,
};

function makeSide(s: PokeSet): Side {
  return {
    species: s.species,
    setIndex: s.setIndex,
    item: s.item,
    ability: s.abilities[0] ?? "",
    iv: DEFAULT_TIER4_IV,
    ...DEFAULT_COND,
  };
}

// Recompute a set's Lv-level stats from the side's chosen IV. The IV applies to
// every set here (like the Sets view's per-card IV preview), so each side can be
// set to its own tier's IV independently.
function withIv(base: PokeSet, iv: number, level: number): PokeSet {
  return { ...base, iv, stats: computeStats(base.baseStats, base.evs, base.nature, iv, level) };
}

function toCombatant(set: PokeSet, side: Side): Combatant {
  return {
    species: set.species,
    types: set.types,
    stats: set.stats,
    item: side.item,
    ability: side.ability,
    boosts: { ...NO_BOOST, atk: side.atkStage, spa: side.spaStage, def: side.defStage, spd: side.spdStage },
    status: side.status !== "none",
    burned: side.status === "burn",
    pinch: side.pinch,
  };
}

interface MoveResult {
  move: ReturnType<typeof resolveMove>;
  dmg: ReturnType<typeof calcDamage>;
  ko: ReturnType<typeof koChance>;
}

// One direction of the matchup: `atk`'s moves hitting `def`. Crit/status/pinch come
// from the attacker; screens come from the defender.
function directionResults(
  atkSet: PokeSet, atkSide: Side, defSet: PokeSet, defSide: Side,
  dex: MoveDex, weather: Weather, level: number,
): MoveResult[] {
  const attacker = toCombatant(atkSet, atkSide);
  const defender = toCombatant(defSet, defSide);
  const field: Field = {
    weather,
    reflect: defSide.reflect,
    lightScreen: defSide.lightScreen,
    crit: atkSide.crit,
    level,
  };
  return atkSet.moves.map((mv) => {
    const move = resolveMove(dex, mv.name, mv.type);
    const dmg = calcDamage(attacker, defender, move, field);
    return { move, dmg, ko: koChance(dmg, defender.stats.hp) };
  });
}

function effLabel(eff: number): { text: string; cls: string } {
  if (eff === 0) return { text: "No effect", cls: "calc-eff--immune" };
  if (eff > 1) return { text: eff >= 4 ? "4× super effective" : "Super effective", cls: "calc-eff--super" };
  if (eff < 1) return { text: eff <= 0.25 ? "¼× resisted" : "Resisted", cls: "calc-eff--resist" };
  return { text: "Neutral", cls: "calc-eff--neutral" };
}

export function DamageCalcView({ level = 50 }: { level?: number }) {
  const [sets, setSets] = useState<PokeSet[] | null>(null);
  const [dex, setDex] = useState<MoveDex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [a, setA] = useState<Side | null>(null);
  const [b, setB] = useState<Side | null>(null);
  const [weather, setWeather] = useState<Weather>("none");

  useEffect(() => {
    // Sets load once (species/set/item lists + raw base stats); each side then
    // recomputes its stats from its own IV via withIv, so the load IV is moot.
    Promise.all([loadCalcSets(level), loadMoveDex()])
      .then(([s, d]) => {
        setSets(s);
        setDex(d);
      })
      .catch((e) => setError(String(e)));
  }, [level]);

  const speciesList = useMemo(
    () => (sets ? Array.from(new Set(sets.map((s) => s.species))).sort() : []),
    [sets],
  );
  const setsBySpecies = useMemo(() => {
    const m = new Map<string, PokeSet[]>();
    for (const s of sets ?? []) {
      const arr = m.get(s.species) ?? [];
      arr.push(s);
      m.set(s.species, arr);
    }
    for (const arr of m.values()) arr.sort((x, y) => x.setIndex - y.setIndex);
    return m;
  }, [sets]);
  const allItems = useMemo(
    () => (sets ? Array.from(new Set(sets.map((s) => s.item).filter(Boolean))).sort() : []),
    [sets],
  );

  // Initialise the two sides once data is loaded.
  useEffect(() => {
    if (!sets || a) return;
    const first = sets.find((s) => s.species === "Salamence") ?? sets[0];
    const second = sets.find((s) => s.species === "Snorlax") ?? sets[1] ?? sets[0];
    setA(makeSide(first));
    setB(makeSide(second));
  }, [sets, a]);

  const findSet = (side: Side | null): PokeSet | null => {
    if (!side) return null;
    const arr = setsBySpecies.get(side.species);
    return arr?.find((s) => s.setIndex === side.setIndex) ?? arr?.[0] ?? null;
  };
  const aBase = findSet(a);
  const bBase = findSet(b);
  const aSet = aBase && a ? withIv(aBase, a.iv, level) : null;
  const bSet = bBase && b ? withIv(bBase, b.iv, level) : null;

  const aToB = useMemo(() => {
    if (!aSet || !bSet || !dex || !a || !b) return null;
    return directionResults(aSet, a, bSet, b, dex, weather, level);
  }, [aSet, bSet, dex, a, b, weather, level]);
  const bToA = useMemo(() => {
    if (!aSet || !bSet || !dex || !a || !b) return null;
    return directionResults(bSet, b, aSet, a, dex, weather, level);
  }, [aSet, bSet, dex, a, b, weather, level]);

  if (error) return <div className="error">{error}</div>;
  if (!sets || !dex || !a || !b || !aSet || !bSet || !aToB || !bToA) {
    return <div className="calc-loading">Loading calculator…</div>;
  }

  return (
    <div className="calc">
      <div className="calc__grid">
        <SidePanel
          role="Pokémon A"
          side={a}
          set={aSet}
          speciesList={speciesList}
          setsBySpecies={setsBySpecies}
          allItems={allItems}
          onChange={setA}
        />
        <SidePanel
          role="Pokémon B"
          side={b}
          set={bSet}
          speciesList={speciesList}
          setsBySpecies={setsBySpecies}
          allItems={allItems}
          onChange={setB}
        />
      </div>

      <section className="calc-field">
        <label className="calc-field__item">
          Weather
          <select value={weather} onChange={(e) => setWeather(e.target.value as Weather)}>
            {WEATHERS.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="calc-matchups">
        <DirectionBlock
          key={`${a.species}:${a.setIndex}`}
          label={`${aSet.species} → ${bSet.species}`}
          results={aToB}
          defenderSet={bSet}
        />
        <DirectionBlock
          key={`${b.species}:${b.setIndex}`}
          label={`${bSet.species} → ${aSet.species}`}
          results={bToA}
          defenderSet={aSet}
        />
      </div>

      <p className="calc-note">
        Both directions are shown: each Pokémon attacks with its own moves. Status / crit / offensive
        stages apply when a Pokémon attacks; screens and defensive stages apply when it defends. Stats
        are Lv {level} values; each side has its own <strong>IV</strong> selector, so you can set your
        rental's tier IV independently from the opponent's. Return/Frustration assume 102 BP; a few weight- and HP-based moves
        (Low Kick, Flail, …) show “—”. KO chance is damage-only (no Leftovers / weather residual).
      </p>
    </div>
  );
}

function DirectionBlock({
  label, results, defenderSet,
}: {
  label: string;
  results: MoveResult[];
  defenderSet: PokeSet;
}) {
  const [moveIdx, setMoveIdx] = useState(0);
  const idx = moveIdx < results.length ? moveIdx : 0;
  const selected = results[idx] ?? results[0];
  if (!selected) return null;

  return (
    <section className="calc-result calc-result--matchup">
      <div className="calc-matchup__title">{label}</div>
      <div className="calc-moves">
        {results.map((r, i) => (
          <button
            key={i}
            className={`calc-move ${i === idx ? "calc-move--on" : ""}`}
            style={{ borderLeftColor: typeColor(r.move.type) }}
            onClick={() => setMoveIdx(i)}
          >
            <span className="calc-move__name">{r.move.name}</span>
            <span className="calc-move__pct">
              {r.dmg.unsupported ? "—" : `${r.dmg.percentMax.toFixed(0)}%`}
            </span>
          </button>
        ))}
      </div>

      <div className="calc-readout">
        <div className="calc-readout__move" style={{ color: typeColor(selected.move.type) }}>
          {selected.move.name}
          <span className="calc-readout__meta">
            {selected.move.type} · {selected.move.category}
            {selected.move.basePower ? ` · ${selected.move.basePower} BP` : ""}
          </span>
        </div>

        {selected.dmg.unsupported ? (
          <div className="calc-readout__unsupported">{selected.dmg.note ?? "Not supported"}</div>
        ) : (
          <>
            <div className="calc-readout__numbers">
              <strong>{selected.dmg.min}–{selected.dmg.max}</strong> dmg
              <span className="calc-readout__pct">
                {selected.dmg.percentMin.toFixed(1)}% – {selected.dmg.percentMax.toFixed(1)}%
              </span>
            </div>
            <div className="calc-readout__row">
              <span className={`calc-eff ${effLabel(selected.dmg.effectiveness).cls}`}>
                {effLabel(selected.dmg.effectiveness).text}
              </span>
              {selected.ko && (
                <span className="calc-ko">
                  {selected.ko.summary}
                  {selected.ko.chanceText && <span className="calc-ko__chance"> · {selected.ko.chanceText}</span>}
                </span>
              )}
              {selected.dmg.note && <span className="calc-readout__note">{selected.dmg.note}</span>}
            </div>
            <div className="calc-readout__vs">
              vs {defenderSet.species}
              {defenderSet.setCount > 1 ? ` (Set ${defenderSet.setIndex})` : ""} · {defenderSet.stats.hp} HP
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SidePanel({
  role, side, set, speciesList, setsBySpecies, allItems, onChange,
}: {
  role: string;
  side: Side;
  set: PokeSet;
  speciesList: string[];
  setsBySpecies: Map<string, PokeSet[]>;
  allItems: string[];
  onChange: (s: Side) => void;
}) {
  const setsForSpecies = setsBySpecies.get(side.species) ?? [];
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [set.dexNum]);

  const cond = { status: side.status, pinch: side.pinch, crit: side.crit,
    reflect: side.reflect, lightScreen: side.lightScreen,
    atkStage: side.atkStage, spaStage: side.spaStage, defStage: side.defStage, spdStage: side.spdStage };

  const pickSpecies = (species: string) => {
    const first = (setsBySpecies.get(species) ?? [])[0];
    if (!first) return;
    // Keep the side's conditions; only swap the set-driven fields.
    onChange({ ...side, species, setIndex: first.setIndex, item: first.item, ability: first.abilities[0] ?? "" });
  };
  const pickSet = (setIndex: number) => {
    const s = setsForSpecies.find((x) => x.setIndex === setIndex);
    if (!s) return;
    onChange({ ...side, setIndex, item: s.item, ability: s.abilities[0] ?? "" });
  };

  return (
    <div className="calc-side">
      <div className="calc-side__head">
        <span className="calc-side__role">{role}</span>
        <div className="calc-side__sprite">
          {imgOk ? (
            <img src={spriteUrl(set.dexNum)} alt={set.species} onError={() => setImgOk(false)} />
          ) : (
            <span className="card__sprite-fallback">#{set.dexNum}</span>
          )}
        </div>
        <div className="calc-side__types">
          {set.types.map((t) => (
            <span key={t} className="chip" style={{ background: typeColor(t) }}>{t}</span>
          ))}
        </div>
      </div>

      <label className="calc-field__item">
        Pokémon
        <select value={side.species} onChange={(e) => pickSpecies(e.target.value)}>
          {speciesList.map((sp) => (
            <option key={sp} value={sp}>{sp}</option>
          ))}
        </select>
      </label>

      {setsForSpecies.length > 1 && (
        <label className="calc-field__item">
          Set
          <select value={side.setIndex} onChange={(e) => pickSet(Number(e.target.value))}>
            {setsForSpecies.map((s) => (
              <option key={s.id} value={s.setIndex}>Set {s.setIndex}</option>
            ))}
          </select>
        </label>
      )}

      <label className="calc-field__item">
        Item
        <select value={side.item} onChange={(e) => onChange({ ...side, item: e.target.value })}>
          <option value="">— none —</option>
          {allItems.map((it) => (
            <option key={it} value={it}>{it}</option>
          ))}
        </select>
      </label>

      <label className="calc-field__item">
        Ability
        <select value={side.ability} onChange={(e) => onChange({ ...side, ability: e.target.value })}>
          {set.abilities.map((ab) => (
            <option key={ab} value={ab}>{ab}</option>
          ))}
        </select>
      </label>

      <label className="calc-field__item">
        IV (all stats)
        <select value={side.iv} onChange={(e) => onChange({ ...side, iv: Number(e.target.value) })}>
          {LOWER_TIER_IVS.map((v) => (
            <option key={v} value={v}>{v}{v === 31 ? " (max)" : ""}</option>
          ))}
        </select>
      </label>

      <div className="calc-side__stats">
        {(["hp", "atk", "def", "spa", "spd", "spe"] as StatKey[]).map((k) => (
          <span key={k} className="calc-stat">
            <span className="calc-stat__label">{STAT_LABELS[k]}</span>
            <span className="calc-stat__val">{set.stats[k]}</span>
          </span>
        ))}
      </div>
      <div className="calc-side__nature">{set.nature} nature</div>

      <div className="calc-side__cond">
        <label className="calc-field__item calc-field__item--stage">
          Status
          <select value={cond.status} onChange={(e) => onChange({ ...side, status: e.target.value as StatusKind })}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <div className="calc-side__toggles">
          <Toggle label="≤⅓ HP (pinch)" checked={cond.pinch} onChange={(v) => onChange({ ...side, pinch: v })} />
          <Toggle label="Crits" checked={cond.crit} onChange={(v) => onChange({ ...side, crit: v })} />
          <Toggle label="Reflect" checked={cond.reflect} onChange={(v) => onChange({ ...side, reflect: v })} />
          <Toggle label="Light Screen" checked={cond.lightScreen} onChange={(v) => onChange({ ...side, lightScreen: v })} />
        </div>
        <div className="calc-side__stages">
          <Stepper label="Atk" value={cond.atkStage} onChange={(v) => onChange({ ...side, atkStage: v })} />
          <Stepper label="Def" value={cond.defStage} onChange={(v) => onChange({ ...side, defStage: v })} />
          <Stepper label="SpA" value={cond.spaStage} onChange={(v) => onChange({ ...side, spaStage: v })} />
          <Stepper label="SpD" value={cond.spdStage} onChange={(v) => onChange({ ...side, spdStage: v })} />
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="calc-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="calc-field__item calc-field__item--stage">
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {STAGES.map((s) => (
          <option key={s} value={s}>{s > 0 ? `+${s}` : s}</option>
        ))}
      </select>
    </label>
  );
}
