// Type colors (Gen 4 palette). Used for move badges and type chips.
export const TYPE_COLORS: Record<string, string> = {
  Normal: "#9099a1",
  Fire: "#ff6b3d",
  Water: "#4d90d5",
  Electric: "#f3d23b",
  Grass: "#63bc5a",
  Ice: "#74cec0",
  Fighting: "#ce4069",
  Poison: "#ab6ac8",
  Ground: "#d97746",
  Flying: "#8fa8dd",
  Psychic: "#f97176",
  Bug: "#90c12c",
  Rock: "#c7b78b",
  Ghost: "#5269ad",
  Dragon: "#0b6dc3",
  Dark: "#5a5366",
  Steel: "#5a8ea1",
  "???": "#68a090",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#9099a1";
}

// Battle Factory quality tiers, best -> worst.
export const TIER_COLORS: Record<string, string> = {
  X: "#c0392b",
  S: "#e8511f",
  "A+": "#e8871f",
  "A-": "#e0a52c",
  B: "#63bc5a",
  C: "#3f9e8e",
  "D+": "#4d90d5",
  "D-": "#5269ad",
  E: "#8a7bb0",
  F: "#7a7a86",
};

export function tierColor(tier: string | null): string {
  return (tier && TIER_COLORS[tier]) || "#9099a1";
}

export const TIER_LABELS: Record<string, string> = {
  X: "Godly",
  S: "Amazing",
  "A+": "Great",
  "A-": "Good",
  B: "Acceptable",
  C: "Ok",
  "D+": "Dubious",
  "D-": "Bad",
  E: "Terrible",
  F: "Atrocious",
};

// PokéAPI Gen-V-style animated/black-white sprites look best; fall back to
// the official artwork by National Dex number.
export function spriteUrl(dexNum: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dexNum}.png`;
}
