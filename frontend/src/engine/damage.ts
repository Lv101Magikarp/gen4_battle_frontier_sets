// Generation IV damage calculator. Follows the Gen 4 formula and flooring order
// used by @smogon/calc: base -> Mod1 (burn/screens/weather) -> +2 -> crit ->
// Mod2 (Life Orb) -> random roll -> STAB -> per-type effectiveness -> Mod3
// (Expert Belt / Tinted Lens / Filter / resist berries / Thick Fat …).
import type { StatKey, StatMap } from "../types";
import { typeEffect, typeMultiplier } from "./typechart";
import {
  itemAttackMult, itemDefenseMult, itemMod2Mult, itemMod3Mult, itemPowerMult,
} from "./items";
import {
  abilityAttackMult, abilityAttackerMod3, abilityPowerMult, abilityStab,
  defenderAbilityDefMult, defenderAbilityMult, defenderImmune,
  type AttackerAbilityCtx, type DefenderAbilityCtx,
} from "./abilities";

const LEVEL = 50;

export interface MoveData {
  name: string;
  type: string;
  category: "Physical" | "Special" | "Status";
  basePower: number | null;
  accuracy: number | null;
}

export interface Combatant {
  species: string;
  types: string[];
  stats: StatMap;              // computed Lv-50 final stats
  item: string;
  ability: string;
  boosts: Record<StatKey, number>; // stat stages -6..+6
  status: boolean;            // non-volatile status present (Guts / Marvel Scale)
  burned: boolean;            // status is burn (halves physical damage)
  pinch: boolean;             // attacker at <=1/3 HP (pinch abilities / Solar Power)
}

export type Weather = "none" | "sun" | "rain" | "sand" | "hail";

export interface Field {
  weather: Weather;
  reflect: boolean;
  lightScreen: boolean;
  crit: boolean;
}

export interface DamageResult {
  rolls: number[];            // per-roll damage, ascending (empty if unsupported)
  min: number;
  max: number;
  percentMin: number;         // % of defender max HP
  percentMax: number;
  effectiveness: number;      // total type multiplier (0 / .25 / .5 / 1 / 2 / 4)
  note?: string;              // "immune", "variable — approximate", "OHKO move", …
  unsupported?: boolean;      // true => rolls can't be computed (HP/weight-based)
}

function stageMult(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// Moves whose base power is not a constant. Handled here; the rest of the
// null-power damaging moves are reported as unsupported ("variable").
function specialPower(move: MoveData, attacker: Combatant, defender: Combatant): number | "unsupported" | null {
  switch (move.name) {
    case "Return":
    case "Frustration":
      return 102; // rental assumption: extreme happiness (Return) / 0 (Frustration)
    case "Dragon Rage":
    case "Night Shade":
    case "Seismic Toss":
    case "Sonic Boom":
      return null; // fixed-damage: handled before the normal formula
    case "Gyro Ball": {
      const userSpe = Math.floor(attacker.stats.spe * stageMult(attacker.boosts.spe));
      const tgtSpe = Math.floor(defender.stats.spe * stageMult(defender.boosts.spe));
      if (userSpe <= 0) return 1;
      return Math.min(150, Math.floor((25 * tgtSpe) / userSpe) + 1);
    }
    default:
      return "unsupported";
  }
}

const FIXED_DAMAGE: Record<string, (a: Combatant) => number> = {
  "Night Shade": () => LEVEL,
  "Seismic Toss": () => LEVEL,
  "Dragon Rage": () => 40,
  "Sonic Boom": () => 20,
};

export function calcDamage(
  attacker: Combatant,
  defender: Combatant,
  move: MoveData,
  field: Field,
): DamageResult {
  const hp = defender.stats.hp;
  const eff = typeMultiplier(move.type, defender.types);
  const empty = { rolls: [], min: 0, max: 0, percentMin: 0, percentMax: 0 };

  if (move.category === "Status") {
    return { ...empty, effectiveness: eff, note: "status move", unsupported: true };
  }

  const moldBreaker = attacker.ability === "Mold Breaker";
  const defCtx: DefenderAbilityCtx = {
    ability: defender.ability, moveType: move.type, category: move.category,
    effectiveness: eff, moldBreaker,
  };

  // Immunity: type chart or a defender ability (Levitate, Volt Absorb, …).
  if (eff === 0 || defenderImmune(defCtx)) {
    return { ...empty, effectiveness: 0, note: "immune" };
  }

  // Fixed-damage moves (Night Shade, Seismic Toss, Dragon Rage, Sonic Boom).
  const fixed = FIXED_DAMAGE[move.name];
  if (fixed) {
    const dmg = fixed(attacker);
    return {
      rolls: [dmg], min: dmg, max: dmg,
      percentMin: (dmg / hp) * 100, percentMax: (dmg / hp) * 100,
      effectiveness: eff, note: "fixed damage",
    };
  }

  // Resolve base power (constant, special-cased, or unsupported).
  let basePower = move.basePower;
  if (basePower == null) {
    const sp = specialPower(move, attacker, defender);
    if (sp === "unsupported") {
      return { ...empty, effectiveness: eff, note: "variable — not supported", unsupported: true };
    }
    if (sp != null) basePower = sp;
  }
  if (basePower == null || basePower <= 0) {
    return { ...empty, effectiveness: eff, note: "variable — not supported", unsupported: true };
  }

  const atkCtx: AttackerAbilityCtx = {
    ability: attacker.ability, moveName: move.name, moveType: move.type,
    category: move.category, basePower, species: attacker.species,
    statused: attacker.status, pinch: attacker.pinch, sun: field.weather === "sun",
  };

  // --- Power ---
  let power = basePower;
  power = Math.floor(power * itemPowerMult(attacker.item, move.type, move.category));
  power = Math.floor(power * abilityPowerMult(atkCtx));
  power = Math.max(1, power);

  // --- Attack / Defense stats (with stat stages, item & ability multipliers) ---
  const isPhysical = move.category === "Physical";
  const atkKey: StatKey = isPhysical ? "atk" : "spa";
  const defKey: StatKey = isPhysical ? "def" : "spd";
  // Crits ignore the attacker's negative offensive boosts and the defender's
  // positive defensive boosts.
  const atkStage = field.crit ? Math.max(attacker.boosts[atkKey], 0) : attacker.boosts[atkKey];
  const defStage = field.crit ? Math.min(defender.boosts[defKey], 0) : defender.boosts[defKey];

  let A = Math.floor(attacker.stats[atkKey] * stageMult(atkStage));
  A = Math.floor(A * abilityAttackMult(atkCtx));
  A = Math.floor(A * itemAttackMult(attacker.item, move.category, attacker.species));
  A = Math.max(1, A);

  let D = Math.floor(defender.stats[defKey] * stageMult(defStage));
  D = Math.floor(D * defenderAbilityDefMult(defender.ability, move.category, defender.status));
  D = Math.floor(D * itemDefenseMult(defender.item, defKey, defender.species));
  D = Math.max(1, D);

  // --- Base damage ---
  const levelFactor = Math.floor((2 * LEVEL) / 5 + 2); // 22
  let base = Math.floor(Math.floor((levelFactor * power * A) / D) / 50);

  // --- Mod1: burn, screens, weather ---
  let mod1 = 1;
  if (attacker.burned && isPhysical && attacker.ability !== "Guts") mod1 *= 0.5;
  const screen = isPhysical ? field.reflect : field.lightScreen;
  if (screen && !field.crit) mod1 *= 0.5;
  mod1 *= weatherMod(move, field.weather);
  base = Math.floor(base * mod1);

  base += 2;

  // --- CH (critical) ---
  if (field.crit) base = Math.floor(base * 2);

  // --- Mod2: Life Orb ---
  base = Math.floor(base * itemMod2Mult(attacker.item));

  // --- Per-roll: random -> STAB -> per-type effectiveness -> Mod3 ---
  const hasStab = attacker.types.includes(move.type);
  const stab = hasStab ? abilityStab(attacker.ability) : 1;
  const mod3 =
    itemMod3Mult(attacker.item, defender.item, move.type, eff) *
    abilityAttackerMod3(attacker.ability, eff) *
    defenderAbilityMult(defCtx);

  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let dmg = Math.floor((base * r) / 100);
    if (hasStab) dmg = Math.floor(dmg * stab);
    for (const t of defender.types) dmg = Math.floor(dmg * typeEffect(move.type, t));
    dmg = Math.floor(dmg * mod3);
    rolls.push(Math.max(1, dmg)); // a connecting, non-immune hit deals >=1
  }

  const min = rolls[0];
  const max = rolls[rolls.length - 1];
  return {
    rolls,
    min,
    max,
    percentMin: (min / hp) * 100,
    percentMax: (max / hp) * 100,
    effectiveness: eff,
  };
}

function weatherMod(move: MoveData, weather: Weather): number {
  if (weather === "sun") {
    if (move.type === "Fire") return 1.5;
    if (move.type === "Water") return 0.5;
  } else if (weather === "rain") {
    if (move.type === "Water") return 1.5;
    if (move.type === "Fire") return 0.5;
  }
  // SolarBeam is halved in any non-clear, non-sun weather.
  if (move.name === "SolarBeam" && weather !== "none" && weather !== "sun") return 0.5;
  return 1;
}

// ---- KO chance ----

export interface KoResult {
  summary: string;       // "Guaranteed 3HKO", "Possible OHKO", …
  chanceText?: string;   // "43.8% chance to 2HKO"
}

// Probability that the sum of `hits` independent rolls (each equally likely from
// `rolls`) is at least `hp`. Convolution over the 16-roll distribution.
function koProbability(rolls: number[], hp: number, hits: number): number {
  if (hits <= 0) return 0;
  const n = rolls.length;
  // dist: map of cumulative-damage -> probability, capped at hp (anything >= hp
  // collapses into a single "KO" bucket to keep the state space small).
  let dist = new Map<number, number>([[0, 1]]);
  for (let h = 0; h < hits; h++) {
    const next = new Map<number, number>();
    for (const [dmg, p] of dist) {
      if (dmg >= hp) {
        next.set(hp, (next.get(hp) ?? 0) + p);
        continue;
      }
      for (const roll of rolls) {
        const total = Math.min(hp, dmg + roll);
        next.set(total, (next.get(total) ?? 0) + p / n);
      }
    }
    dist = next;
  }
  return dist.get(hp) ?? 0;
}

export function koChance(result: DamageResult, hp: number): KoResult | null {
  const { rolls, min, max } = result;
  if (rolls.length === 0 || max <= 0) return null;
  if (result.rolls.length === 1) {
    // fixed-damage move
    const hits = Math.ceil(hp / min);
    return { summary: `Guaranteed ${ordinalKO(hits)}` };
  }

  const guaranteed = Math.max(1, Math.ceil(hp / min)); // worst-case every roll = min
  if (guaranteed === 1) return { summary: "Guaranteed OHKO" };

  // Chance to KO one hit sooner than the guaranteed count.
  const pFaster = koProbability(rolls, hp, guaranteed - 1);
  const summary = `Guaranteed ${ordinalKO(guaranteed)}`;
  if (pFaster > 0) {
    return { summary, chanceText: `${(pFaster * 100).toFixed(1)}% chance to ${ordinalKO(guaranteed - 1)}` };
  }
  return { summary };
}

function ordinalKO(hits: number): string {
  return hits === 1 ? "OHKO" : `${hits}HKO`;
}
