import { useEffect, useMemo, useState } from "react";
import type { PokeSet, StatKey } from "../types";
import { STAT_LABELS } from "../types";
import { spriteUrl, typeColor } from "../theme";
import { loadCalcSets, loadMoveDex, resolveMove, type MoveDex } from "../engine/calcData";
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

// Per-combatant selection + overrides. Item/ability start from the chosen set but
// can be changed so the item/ability modifiers are exercisable (set-driven, with
// per-field overrides, per the plan).
interface Side {
  species: string;
  setIndex: number;
  item: string;
  ability: string;
}

function effLabel(eff: number): { text: string; cls: string } {
  if (eff === 0) return { text: "No effect", cls: "calc-eff--immune" };
  if (eff > 1) return { text: eff >= 4 ? "4× super effective" : "Super effective", cls: "calc-eff--super" };
  if (eff < 1) return { text: eff <= 0.25 ? "¼× resisted" : "Resisted", cls: "calc-eff--resist" };
  return { text: "Neutral", cls: "calc-eff--neutral" };
}

export function DamageCalcView() {
  const [sets, setSets] = useState<PokeSet[] | null>(null);
  const [dex, setDex] = useState<MoveDex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [atk, setAtk] = useState<Side | null>(null);
  const [def, setDef] = useState<Side | null>(null);
  const [moveIdx, setMoveIdx] = useState(0);

  // Field / state.
  const [weather, setWeather] = useState<Weather>("none");
  const [reflect, setReflect] = useState(false);
  const [lightScreen, setLightScreen] = useState(false);
  const [crit, setCrit] = useState(false);
  const [atkBurned, setAtkBurned] = useState(false);
  const [atkPinch, setAtkPinch] = useState(false);
  const [defStatus, setDefStatus] = useState(false);
  const [atkAtkStage, setAtkAtkStage] = useState(0);
  const [atkSpaStage, setAtkSpaStage] = useState(0);
  const [defDefStage, setDefDefStage] = useState(0);
  const [defSpdStage, setDefSpdStage] = useState(0);

  useEffect(() => {
    Promise.all([loadCalcSets(), loadMoveDex()])
      .then(([s, d]) => {
        setSets(s);
        setDex(d);
      })
      .catch((e) => setError(String(e)));
  }, []);

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
    for (const arr of m.values()) arr.sort((a, b) => a.setIndex - b.setIndex);
    return m;
  }, [sets]);
  const allItems = useMemo(
    () => (sets ? Array.from(new Set(sets.map((s) => s.item).filter(Boolean))).sort() : []),
    [sets],
  );

  // Initialise the two sides once data is loaded.
  useEffect(() => {
    if (!sets || atk) return;
    const first = sets.find((s) => s.species === "Salamence") ?? sets[0];
    const second = sets.find((s) => s.species === "Snorlax") ?? sets[1] ?? sets[0];
    setAtk({ species: first.species, setIndex: first.setIndex, item: first.item, ability: first.abilities[0] ?? "" });
    setDef({ species: second.species, setIndex: second.setIndex, item: second.item, ability: second.abilities[0] ?? "" });
  }, [sets, atk]);

  const findSet = (side: Side | null): PokeSet | null => {
    if (!side) return null;
    const arr = setsBySpecies.get(side.species);
    return arr?.find((s) => s.setIndex === side.setIndex) ?? arr?.[0] ?? null;
  };
  const atkSet = findSet(atk);
  const defSet = findSet(def);

  const results = useMemo(() => {
    if (!atkSet || !defSet || !dex || !atk || !def) return null;
    const attacker: Combatant = {
      species: atkSet.species,
      types: atkSet.types,
      stats: atkSet.stats,
      item: atk.item,
      ability: atk.ability,
      boosts: { ...NO_BOOST, atk: atkAtkStage, spa: atkSpaStage },
      status: atkBurned,
      burned: atkBurned,
      pinch: atkPinch,
    };
    const defender: Combatant = {
      species: defSet.species,
      types: defSet.types,
      stats: defSet.stats,
      item: def.item,
      ability: def.ability,
      boosts: { ...NO_BOOST, def: defDefStage, spd: defSpdStage },
      status: defStatus,
      burned: false,
      pinch: false,
    };
    const field: Field = { weather, reflect, lightScreen, crit };
    return atkSet.moves.map((mv) => {
      const move = resolveMove(dex, mv.name, mv.type);
      const dmg = calcDamage(attacker, defender, move, field);
      return { move, dmg, ko: koChance(dmg, defender.stats.hp) };
    });
  }, [
    atkSet, defSet, dex, atk, def, weather, reflect, lightScreen, crit,
    atkBurned, atkPinch, defStatus, atkAtkStage, atkSpaStage, defDefStage, defSpdStage,
  ]);

  // Keep the selected move index in range when the attacker changes.
  useEffect(() => {
    setMoveIdx((i) => (atkSet && i < atkSet.moves.length ? i : 0));
  }, [atkSet]);

  if (error) return <div className="error">{error}</div>;
  if (!sets || !dex || !atk || !def || !atkSet || !defSet || !results) {
    return <div className="calc-loading">Loading calculator…</div>;
  }

  const selected = results[moveIdx] ?? results[0];

  return (
    <div className="calc">
      <div className="calc__grid">
        <SidePanel
          role="Attacker"
          side={atk}
          set={atkSet}
          speciesList={speciesList}
          setsBySpecies={setsBySpecies}
          allItems={allItems}
          onChange={setAtk}
        />
        <SidePanel
          role="Defender"
          side={def}
          set={defSet}
          speciesList={speciesList}
          setsBySpecies={setsBySpecies}
          allItems={allItems}
          onChange={setDef}
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
        <Toggle label="Critical hit" checked={crit} onChange={setCrit} />
        <Toggle label="Reflect" checked={reflect} onChange={setReflect} />
        <Toggle label="Light Screen" checked={lightScreen} onChange={setLightScreen} />
        <Toggle label="Attacker burned" checked={atkBurned} onChange={setAtkBurned} />
        <Toggle label="Attacker ≤⅓ HP (pinch)" checked={atkPinch} onChange={setAtkPinch} />
        <Toggle label="Defender statused" checked={defStatus} onChange={setDefStatus} />
        <Stepper label="Atk stage" value={atkAtkStage} onChange={setAtkAtkStage} />
        <Stepper label="SpA stage" value={atkSpaStage} onChange={setAtkSpaStage} />
        <Stepper label="Def stage" value={defDefStage} onChange={setDefDefStage} />
        <Stepper label="SpD stage" value={defSpdStage} onChange={setDefSpdStage} />
      </section>

      <section className="calc-result">
        <div className="calc-moves">
          {results.map((r, i) => (
            <button
              key={i}
              className={`calc-move ${i === moveIdx ? "calc-move--on" : ""}`}
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
                vs {defSet.species}
                {defSet.setCount > 1 ? ` (Set ${defSet.setIndex})` : ""} · {defSet.stats.hp} HP
              </div>
            </>
          )}
        </div>
      </section>

      <p className="calc-note">
        Stats are the set's Lv 50 values (Tier 4+ use the round-8 IV of 31). Return/Frustration assume
        102 BP; a few weight- and HP-based moves (Low Kick, Flail, …) show “—”. KO chance is damage-only
        (no Leftovers / weather residual).
      </p>
    </div>
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

  const pickSpecies = (species: string) => {
    const first = (setsBySpecies.get(species) ?? [])[0];
    if (!first) return;
    onChange({ species, setIndex: first.setIndex, item: first.item, ability: first.abilities[0] ?? "" });
  };
  const pickSet = (setIndex: number) => {
    const s = setsForSpecies.find((x) => x.setIndex === setIndex);
    if (!s) return;
    onChange({ species: side.species, setIndex, item: s.item, ability: s.abilities[0] ?? "" });
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

      <div className="calc-side__stats">
        {(["hp", "atk", "def", "spa", "spd", "spe"] as StatKey[]).map((k) => (
          <span key={k} className="calc-stat">
            <span className="calc-stat__label">{STAT_LABELS[k]}</span>
            <span className="calc-stat__val">{set.stats[k]}</span>
          </span>
        ))}
      </div>
      <div className="calc-side__nature">{set.nature} nature</div>
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
