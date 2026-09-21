// Generation IV damage calculator. Mirrors @smogon/calc's DPP mechanics
// (step order and per-step flooring) so results match the reference calculator:
//   base power:  Technician -> item -> Iron Fist/Reckless/pinch -> Thick Fat…
//   attack:      stage -> ability (Pure Power / Solar Power / Guts…) -> item
//   defense:     stage -> Marvel Scale -> item -> sand+Rock SpD -> Explosion halving
//   base dmg:    floor(floor(LF*power*A / 50) / D)
//   then:        burn -> screen -> weather -> +2 -> crit -> Life Orb
//   per roll:    random -> STAB -> type1 -> type2 -> Filter -> Expert Belt
//                -> Tinted Lens -> resist berry
import type { StatKey, StatMap } from "../types";
import { typeEffect } from "./typechart";
import {
  berryMult, expertBeltMult, flingPower, itemAttackMult, itemDefenseMult, itemMod2Mult, itemPowerMult,
} from "./items";
import {
  abilityAttackMult, abilityStab, attackerBpMult, defenderBpMult, defenderDefMult,
  defenderImmune, filterMult, technicianMult, tintedMult, type DefenderAbilityCtx,
} from "./abilities";

// @smogon applies the two defender types in this precedence order, which matters
// because each type multiplier is floored separately.
const TYPE_PRECEDENCE = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison",
  "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel",
];

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
  stats: StatMap;              // computed final stats at the battle level
  weight: number;              // kilograms (Grass Knot / Low Kick)
  item: string;
  ability: string;
  boosts: Record<StatKey, number>; // stat stages -6..+6
  status: boolean;            // non-volatile status present (Guts / Marvel Scale)
  burned: boolean;            // status is burn (halves physical damage)
  pinch: boolean;             // attacker at <=1/3 HP (pinch abilities / Solar Power)
  currentHpPct: number;       // 1..100, current HP as % of max (Flail, Wring Out…)
}

export type Weather = "none" | "sun" | "rain" | "sand" | "hail";

export interface Field {
  weather: Weather;
  reflect: boolean;
  lightScreen: boolean;
  crit: boolean;
  level: number; // battle level (50 or 100)
}

export interface DamageResult {
  rolls: number[];            // per-roll damage, ascending (empty if unsupported)
  min: number;
  max: number;
  percentMin: number;         // % of defender max HP
  percentMax: number;
  effectiveness: number;      // total type multiplier (0 / .25 / .5 / 1 / 2 / 4)
  note?: string;              // "immune", "variable — not supported", "fixed damage"
  unsupported?: boolean;      // true => rolls can't be computed (HP/weight-based)
}

function stageMult(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// Integer current HP implied by the side's currentHpPct (1..100) and its max HP.
// HP-based moves (Flail/Reversal, Wring Out/Crush Grip) key off the integer ratio.
function currentHp(c: Combatant): number {
  return Math.max(1, Math.round((c.stats.hp * c.currentHpPct) / 100));
}

// Defender types ordered by @smogon's type-effectiveness precedence.
function orderedTypes(types: string[]): string[] {
  if (types.length < 2 || types[0] === types[1]) return types;
  return TYPE_PRECEDENCE.indexOf(types[0]) > TYPE_PRECEDENCE.indexOf(types[1])
    ? [types[1], types[0]]
    : types;
}

// Moves whose base power is not a constant. The common computable ones are
// handled; the rest of the null-power damaging moves are reported as unsupported.
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
      return Math.min(150, Math.floor((25 * tgtSpe) / userSpe));
    }
    // Fling: base power comes from the attacker's held item (0 = no item, can't Fling).
    case "Fling":
      return flingPower(attacker.item);
    // Weight-based: base power from the target's weight in kg.
    case "Grass Knot":
    case "Low Kick": {
      const w = defender.weight;
      return w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
    }
    // Target-HP-based: stronger the more HP the target has (121 at full HP).
    // The game uses integer current HP / max HP, so derive an integer HP from the %.
    case "Wring Out":
    case "Crush Grip":
      return Math.floor((120 * currentHp(defender)) / defender.stats.hp) + 1;
    // User-HP-based: stronger the lower the user's HP.
    case "Flail":
    case "Reversal": {
      const p = Math.floor((64 * currentHp(attacker)) / attacker.stats.hp);
      return p <= 1 ? 200 : p <= 5 ? 150 : p <= 12 ? 100 : p <= 21 ? 80 : p <= 42 ? 40 : 20;
    }
    default:
      return "unsupported";
  }
}

const FIXED_DAMAGE: Record<string, (level: number) => number> = {
  "Night Shade": (level) => level,
  "Seismic Toss": (level) => level,
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
  const empty = { rolls: [], min: 0, max: 0, percentMin: 0, percentMax: 0 };

  // Effectiveness, applied per type in @smogon's precedence order.
  const dTypes = orderedTypes(defender.types);
  const eff1 = typeEffect(move.type, dTypes[0]);
  const eff2 = dTypes[1] ? typeEffect(move.type, dTypes[1]) : 1;
  const eff = eff1 * eff2;

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
  const fixedFn = FIXED_DAMAGE[move.name];
  if (fixedFn) {
    const dmg = fixedFn(field.level);
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

  const isPhysical = move.category === "Physical";

  // --- Base power mods (order per @smogon calculateBPModsDPP) ---
  let power = basePower;
  power = Math.floor(power * technicianMult(attacker.ability, power));
  power = Math.floor(power * itemPowerMult(attacker.item, move.type, move.category));
  power = Math.floor(power * attackerBpMult(attacker.ability, move.name, move.type, attacker.pinch));
  power = Math.floor(power * defenderBpMult(defender.ability, move.type, moldBreaker));

  // --- Attack stat: stage -> ability -> item ---
  const atkKey: StatKey = isPhysical ? "atk" : "spa";
  const atkStage = field.crit ? Math.max(attacker.boosts[atkKey], 0) : attacker.boosts[atkKey];
  let A = Math.floor(attacker.stats[atkKey] * stageMult(atkStage));
  A = Math.floor(A * abilityAttackMult({
    ability: attacker.ability, category: move.category,
    statused: attacker.status, sun: field.weather === "sun",
  }));
  A = Math.floor(A * itemAttackMult(attacker.item, move.category, attacker.species));

  // --- Defense stat: stage -> Marvel Scale -> item -> sand+Rock SpD ---
  const defKey: StatKey = isPhysical ? "def" : "spd";
  const defStage = field.crit ? Math.min(defender.boosts[defKey], 0) : defender.boosts[defKey];
  let D = Math.floor(defender.stats[defKey] * stageMult(defStage));
  D = Math.floor(D * defenderDefMult(defender.ability, move.category, defender.status, moldBreaker));
  D = Math.floor(D * itemDefenseMult(defender.item, defKey, defender.species));
  if (field.weather === "sand" && !isPhysical && defender.types.includes("Rock")) {
    D = Math.floor(D * 1.5);
  }
  // Explosion / Self-Destruct halve the target's defense in Gen 1-4 (removed in Gen 5).
  if (move.name === "Explosion" || move.name === "Selfdestruct") {
    D = Math.floor(D * 0.5);
  }
  D = Math.max(1, D);

  // --- Base damage ---
  const levelFactor = Math.floor((2 * field.level) / 5 + 2); // 22 at Lv50, 42 at Lv100
  let base = Math.floor(Math.floor((levelFactor * power * A) / 50) / D);

  // --- burn -> screens -> weather -> +2 -> crit -> Life Orb ---
  if (attacker.burned && isPhysical && attacker.ability !== "Guts") base = Math.floor(base * 0.5);
  const screen = isPhysical ? field.reflect : field.lightScreen;
  if (screen && !field.crit) base = Math.floor(base * 0.5);
  base = Math.floor(base * weatherMod(move, field.weather));
  base += 2;
  if (field.crit) base = Math.floor(base * 2);
  base = Math.floor(base * itemMod2Mult(attacker.item));

  // --- Per-roll: random -> STAB -> type1 -> type2 -> Filter -> E.Belt -> Tinted -> berry ---
  const hasStab = attacker.types.includes(move.type);
  const stab = hasStab ? abilityStab(attacker.ability) : 1;
  const fMod = filterMult(defender.ability, eff, moldBreaker);
  const ebMod = expertBeltMult(attacker.item, eff);
  const tMod = tintedMult(attacker.ability, eff);
  const bMod = berryMult(defender.item, move.type, eff);

  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let dmg = Math.floor((base * r) / 100);
    if (hasStab) dmg = Math.floor(dmg * stab);
    dmg = Math.floor(dmg * eff1);
    if (dTypes[1]) dmg = Math.floor(dmg * eff2);
    dmg = Math.floor(dmg * fMod);
    dmg = Math.floor(dmg * ebMod);
    dmg = Math.floor(dmg * tMod);
    dmg = Math.floor(dmg * bMod);
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
  if ((weather === "sun" && move.type === "Fire") || (weather === "rain" && move.type === "Water")) {
    return 1.5;
  }
  if ((weather === "sun" && move.type === "Water") || (weather === "rain" && move.type === "Fire")) {
    return 0.5;
  }
  // SolarBeam is halved in rain, sandstorm, and hail.
  if (move.name === "SolarBeam" && (weather === "rain" || weather === "sand" || weather === "hail")) {
    return 0.5;
  }
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
  if (rolls.length === 1) {
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
