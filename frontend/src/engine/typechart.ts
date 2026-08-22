// Generation IV type-effectiveness chart. No Fairy type in Gen 4; Steel still
// resists Ghost and Dark (that resistance was removed in Gen 6), and Ghost/Dark
// hit each other for neutral damage in Gen 3-5 (super-effective only from Gen 6).
//
// CHART[attackingType][defendingType] = multiplier. Missing entries are 1x.

type Eff = Record<string, Record<string, number>>;

// Only the non-1x matchups are listed; anything absent is 1x.
const CHART: Eff = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: {
    Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5,
    Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5,
  },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: {
    Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5,
    Rock: 2, Ghost: 0, Dark: 2, Steel: 2,
  },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: {
    Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2,
    Ghost: 0.5, Dark: 2, Steel: 0.5,
  },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5, Steel: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Steel: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5 },
};

export function typeEffect(attackType: string, defendType: string): number {
  return CHART[attackType]?.[defendType] ?? 1;
}

// Combined multiplier of a move's type against a (mono- or dual-typed) defender.
// Returns 0 for an immunity, otherwise the product (0.25 / 0.5 / 1 / 2 / 4).
export function typeMultiplier(moveType: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((mult, t) => mult * typeEffect(moveType, t), 1);
}
