// Damage-relevant ability effects for the Gen 4 calculator. Only abilities that
// move a damage roll are modelled; everything else (Natural Cure, Synchronize,
// Pressure, …) is identity via the fallbacks below, so the ~125 abilities in the
// data don't all need entries. Pinch abilities (Blaze/Torrent/Overgrow/Swarm,
// Solar Power) and Flower Gift are gated on caller-supplied field state.

const PUNCH_MOVES = new Set([
  "Bullet Punch", "Comet Punch", "Dizzy Punch", "Drain Punch", "DynamicPunch",
  "Fire Punch", "Focus Punch", "Ice Punch", "Mach Punch", "Mega Punch",
  "Meteor Mash", "Shadow Punch", "Sky Uppercut", "ThunderPunch",
]);

const RECOIL_MOVES = new Set([
  "Brave Bird", "Double-Edge", "Flare Blitz", "Head Smash", "Submission",
  "Take Down", "Volt Tackle", "Wood Hammer",
]);

// Pinch abilities: ability -> the type it boosts by 1.5x when the user is ≤1/3 HP.
const PINCH_TYPE: Record<string, string> = {
  Overgrow: "Grass",
  Blaze: "Fire",
  Torrent: "Water",
  Swarm: "Bug",
};

export interface AttackerAbilityCtx {
  ability: string;
  moveName: string;
  moveType: string;
  category: string;
  basePower: number;
  species: string;
  statused: boolean; // any non-volatile status (for Guts)
  pinch: boolean;    // attacker at ≤1/3 HP (for Blaze/Torrent/… and Solar Power)
  sun: boolean;      // weather is sun (for Solar Power / Flower Gift)
}

// Base-power multiplier from the attacker's ability (power step).
export function abilityPowerMult(c: AttackerAbilityCtx): number {
  let m = 1;
  if (c.ability === "Technician" && c.basePower <= 60) m *= 1.5;
  if (c.ability === "Iron Fist" && PUNCH_MOVES.has(c.moveName)) m *= 1.2;
  if (c.ability === "Reckless" && RECOIL_MOVES.has(c.moveName)) m *= 1.2;
  if (c.pinch && PINCH_TYPE[c.ability] === c.moveType) m *= 1.5;
  return m;
}

// Attacking-stat multiplier from the attacker's ability.
export function abilityAttackMult(c: AttackerAbilityCtx): number {
  let m = 1;
  if (c.category === "Physical") {
    if (c.ability === "Huge Power" || c.ability === "Pure Power") m *= 2;
    if (c.ability === "Hustle") m *= 1.5;
    if (c.ability === "Guts" && c.statused) m *= 1.5;
    if (c.ability === "Flower Gift" && c.sun) m *= 1.5;
  }
  if (c.category === "Special") {
    if (c.ability === "Solar Power" && c.sun) m *= 1.5;
  }
  return m;
}

// STAB factor: Adaptability makes same-type moves ×2 instead of ×1.5.
export function abilityStab(ability: string): number {
  return ability === "Adaptability" ? 2 : 1.5;
}

// Attacker-side final (Mod3) multiplier: Tinted Lens doubles resisted hits.
export function abilityAttackerMod3(ability: string, effectiveness: number): number {
  if (ability === "Tinted Lens" && effectiveness < 1) return 2;
  return 1;
}

export interface DefenderAbilityCtx {
  ability: string;
  moveType: string;
  category: string;
  effectiveness: number;
  moldBreaker: boolean; // attacker ignores this ability
}

// Immunity granted by the defender's ability (returns true => 0 damage). Gen 4:
// Lightning Rod / Storm Drain do NOT grant immunity (they only redirect), so are
// excluded here. Mold Breaker bypasses all of these.
export function defenderImmune(c: DefenderAbilityCtx): boolean {
  if (c.moldBreaker) return false;
  const a = c.ability;
  if (c.moveType === "Ground" && a === "Levitate") return true;
  if (c.moveType === "Electric" && (a === "Volt Absorb" || a === "Motor Drive")) return true;
  if (c.moveType === "Water" && (a === "Water Absorb" || a === "Dry Skin")) return true;
  if (c.moveType === "Fire" && a === "Flash Fire") return true;
  // Wonder Guard: immune to everything that is not super-effective.
  if (a === "Wonder Guard" && c.category !== "Status" && c.effectiveness <= 1) return true;
  return false;
}

// Defender-ability damage multiplier (Mod1/Mod3 mix; applied as a final factor).
export function defenderAbilityMult(c: DefenderAbilityCtx): number {
  if (c.moldBreaker) return 1;
  const a = c.ability;
  let m = 1;
  if ((a === "Thick Fat") && (c.moveType === "Fire" || c.moveType === "Ice")) m *= 0.5;
  if (a === "Heatproof" && c.moveType === "Fire") m *= 0.5;
  if (a === "Dry Skin" && c.moveType === "Fire") m *= 1.25;
  if ((a === "Filter" || a === "Solid Rock") && c.effectiveness > 1) m *= 0.75;
  return m;
}

// Defender-ability defending-stat multiplier (Marvel Scale when statused).
export function defenderAbilityDefMult(ability: string, category: string, statused: boolean): number {
  if (ability === "Marvel Scale" && category === "Physical" && statused) return 1.5;
  return 1;
}
