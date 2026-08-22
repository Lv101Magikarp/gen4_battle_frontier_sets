// Damage-relevant ability effects for the Gen 4 calculator, split to match the
// step order and per-step flooring of @smogon/calc's DPP mechanics:
//   base power:  Technician (before item)  ->  Iron Fist/Reckless/pinch (after
//                item)  ->  defender Thick Fat/Heatproof/Dry Skin
//   attack stat: Pure/Huge Power | Solar Power | Hustle/Guts (else-if chain)
//   final roll:  Filter/Solid Rock, Tinted Lens
// Everything else (Natural Cure, Pressure, …) is identity via the fallbacks.

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

// --- base-power step ---

// Technician (×1.5 for base power ≤ 60), floored before the item power mod.
export function technicianMult(ability: string, basePower: number): number {
  return ability === "Technician" && basePower <= 60 ? 1.5 : 1;
}

// Iron Fist / Reckless (×1.2), else pinch abilities (×1.5) — floored after the
// item power mod. These are an else-if chain in @smogon.
export function attackerBpMult(
  ability: string, moveName: string, moveType: string, pinch: boolean,
): number {
  if ((ability === "Reckless" && RECOIL_MOVES.has(moveName)) ||
      (ability === "Iron Fist" && PUNCH_MOVES.has(moveName))) return 1.2;
  if (pinch && PINCH_TYPE[ability] === moveType) return 1.5;
  return 1;
}

// Defender Thick Fat / Heatproof (×0.5) or Dry Skin (×1.25 to Fire), floored on
// the base power. Ignored under Mold Breaker.
export function defenderBpMult(ability: string, moveType: string, moldBreaker: boolean): number {
  if (moldBreaker) return 1;
  if (ability === "Heatproof" && moveType === "Fire") return 0.5;
  if (ability === "Thick Fat" && (moveType === "Fire" || moveType === "Ice")) return 0.5;
  if (ability === "Dry Skin" && moveType === "Fire") return 1.25;
  return 1;
}

// --- attack-stat step ---

export interface AttackerAbilityCtx {
  ability: string;
  category: string;
  statused: boolean; // any non-volatile status (for Guts)
  sun: boolean;      // weather is sun (for Solar Power / Flower Gift)
}

// Attacking-stat multiplier (else-if chain: Pure/Huge Power, then Solar Power in
// sun, then Hustle/Guts).
export function abilityAttackMult(c: AttackerAbilityCtx): number {
  const phys = c.category === "Physical";
  if (phys && (c.ability === "Pure Power" || c.ability === "Huge Power")) return 2;
  if (c.sun && ((phys && c.ability === "Flower Gift") || (!phys && c.ability === "Solar Power"))) return 1.5;
  if (phys && (c.ability === "Hustle" || (c.ability === "Guts" && c.statused))) return 1.5;
  return 1;
}

// STAB factor: Adaptability makes same-type moves ×2 instead of ×1.5.
export function abilityStab(ability: string): number {
  return ability === "Adaptability" ? 2 : 1.5;
}

// --- defense-stat step ---

// Marvel Scale (×1.5 Def when statused, physical). Ignored under Mold Breaker.
export function defenderDefMult(
  ability: string, category: string, statused: boolean, moldBreaker: boolean,
): number {
  if (moldBreaker) return 1;
  if (ability === "Marvel Scale" && category === "Physical" && statused) return 1.5;
  return 1;
}

// --- final roll step ---

// Filter / Solid Rock (×0.75 on a super-effective hit). Ignored under Mold Breaker.
export function filterMult(ability: string, effectiveness: number, moldBreaker: boolean): number {
  if (moldBreaker) return 1;
  return (ability === "Filter" || ability === "Solid Rock") && effectiveness > 1 ? 0.75 : 1;
}

// Tinted Lens (attacker: ×2 on a not-very-effective hit).
export function tintedMult(ability: string, effectiveness: number): number {
  return ability === "Tinted Lens" && effectiveness < 1 ? 2 : 1;
}

// --- immunities ---

export interface DefenderAbilityCtx {
  ability: string;
  moveType: string;
  category: string;
  effectiveness: number;
  moldBreaker: boolean; // attacker ignores this ability
}

// Immunity granted by the defender's ability (returns true => 0 damage). Gen 4:
// Lightning Rod / Storm Drain do NOT grant immunity (they only redirect), so are
// excluded. Mold Breaker bypasses all of these.
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
