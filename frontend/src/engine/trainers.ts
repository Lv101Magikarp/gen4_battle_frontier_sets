// Client-side opponent-trainer engine: lazily loads the bundled trainers.json
// and answers "which trainers appear in round X / tier Y" plus "what roster (with
// stats at this trainer's IV) can this trainer field". Works in both dev and the
// static build because trainers.json is a plain asset in either case.
import type { PokeSet, RosterSet, Trainer, TrainerData, TrainerFilters } from "../types";
import { computeStats } from "./stats";

let cache: Promise<TrainerData> | null = null;

function dataUrl(): string {
  return `${import.meta.env.BASE_URL}trainers.json`;
}

export function loadTrainerData(): Promise<TrainerData> {
  if (!cache) {
    cache = fetch(dataUrl()).then((r) => {
      if (!r.ok) throw new Error(`Failed to load trainers: ${r.status}`);
      return r.json() as Promise<TrainerData>;
    });
  }
  return cache;
}

export function filterTrainers(data: TrainerData, f: TrainerFilters): Trainer[] {
  let ts = data.trainers;
  if (f.q) {
    const q = f.q.toLowerCase();
    ts = ts.filter((t) => t.name.toLowerCase().includes(q) || t.class.toLowerCase().includes(q));
  }
  if (f.trainerClass) ts = ts.filter((t) => t.class === f.trainerClass);
  if (f.tier != null) ts = ts.filter((t) => t.tier === f.tier);
  // A trainer "appears" in a round when its cell is a normal or 7th-battle check.
  if (f.round != null) ts = ts.filter((t) => t.rounds[f.round! - 1] !== "no");
  return ts;
}

// Build a PokeSet from a roster set + the IV the active facility assigns this
// trainer, so the existing SetCard can render it (tier/round-IV machinery inert).
export function rosterAsSets(data: TrainerData, trainer: Trainer, iv: number, level = 50): PokeSet[] {
  const idxs = data.groups[trainer.groupId] ?? [];
  return idxs.map((i) => toPokeSet(data.sets[i], iv, level));
}

// The trainer's pool as raw set rows (nullable setIndex intact, no stat compute).
// rosterTheme needs the real set numbers, which toPokeSet coerces away.
export function rosterRawSets(data: TrainerData, trainer: Trainer): RosterSet[] {
  return (data.groups[trainer.groupId] ?? []).map((i) => data.sets[i]);
}

function toPokeSet(s: RosterSet, iv: number, level: number): PokeSet {
  // Show the set-number suffix (e.g. "Venusaur3") only when we know the real set
  // number; otherwise present as a single set so SetCard omits the suffix.
  const known = s.setIndex != null;
  return {
    ...s,
    setIndex: s.setIndex ?? 1,
    setCount: known ? s.setCount : 1,
    tier: null,
    tierRank: null,
    tierGroup: null,
    tierIv: null,
    iv,
    stats: computeStats(s.baseStats, s.evs, s.nature, iv, level),
  };
}

export function trainerClasses(data: TrainerData): string[] {
  return Array.from(new Set(data.trainers.map((t) => t.class))).sort();
}

// The set number a trainer's Pokémon use, derived from the pool itself. A trainer
// is usually locked to one set (its number rises with the tier/IV band); the
// hardest tier-8 trainers often — but NOT always — draw from all four. We read
// this from the roster rather than the tier because a number of tier-8 trainers
// are in fact locked to a single set (e.g. Scientist #279 only fields Set 2),
// which a tier→set table would get wrong.
export function fixedSetIndex(data: TrainerData, trainer: Trainer): number | null {
  const nums = new Set<number>();
  for (const i of data.groups[trainer.groupId] ?? []) {
    const si = data.sets[i].setIndex;
    if (si != null) nums.add(si);
  }
  return nums.size === 1 ? [...nums][0] : null;
}

// Compact label for a trainer's set number: "Set 3" when locked, else "Sets 1–4".
export function setIndexLabel(setIndex: number | null): string {
  return setIndex != null ? `Set ${setIndex}` : "Sets 1–4";
}

// --- Roster "categories": what a trainer draws its Pokémon from --------------
// Each Battle Tower trainer picks from a fixed, themed set list (e.g. Fishermen =
// Water-types, the tier-8 bosses = Legendaries). The theme isn't stored in the
// source; it's summarised here from the pool's actual contents so the UI can show
// "picks from: Water" instead of dumping the whole roster. A type counts as a
// theme when it covers at least this fraction of the pool.
const TYPE_THEME_THRESHOLD = 0.45;

// Some pools are built around a move gimmick rather than a type. The PI class
// draws from sets packing one-hit-KO moves (Fissure/Horn Drill/Guillotine/Sheer
// Cold) or Explosion/Self-Destruct. A pool counts as a gimmick pool when at least
// this fraction of it carries such a move.
const OHKO_MOVES = new Set(["fissure", "horn drill", "guillotine", "sheer cold"]);
const BOOM_MOVES = new Set(["explosion", "selfdestruct", "self-destruct"]);
const GIMMICK_THRESHOLD = 0.6;

// Starter evolution lines (Gen I–IV national dex) and the Eevee family — pools
// built entirely from these read better as "Starters"/"Eeveelutions" than as the
// mix of types they span.
const STARTER_DEX = new Set<number>([
  1, 2, 3, 4, 5, 6, 7, 8, 9, // Kanto
  152, 153, 154, 155, 156, 157, 158, 159, 160, // Johto
  252, 253, 254, 255, 256, 257, 258, 259, 260, // Hoenn
  387, 388, 389, 390, 391, 392, 393, 394, 395, // Sinnoh
]);
const EEVEE_DEX = new Set<number>([133, 134, 135, 136, 196, 197, 470, 471]);

export interface RosterCategory {
  kind: "legendary" | "starter" | "eevee" | "gimmick" | "type" | "varied";
  label: string; // display text, e.g. "Water", "Legendaries", "Varied"
  type?: string; // the Pokémon type (for colouring) when kind === "type"
}

export interface RosterTheme {
  categories: RosterCategory[];
  // For "varied" pools (no dominant type) the two most common types, shown as a
  // muted "mostly X, Y" hint so the chip isn't information-free.
  mostly: string[];
  // The single set number (1-4) every Pokémon in the pool uses, or null when the
  // pool spans several (tier-8 trainers draw from all four sets). Trainers in tiers
  // 1-7 are each locked to one set — e.g. a tier-7 Cowgirl only fields Set 4.
  setIndex: number | null;
}

type ThemeMon = {
  dexNum: number;
  types: string[];
  legendary: boolean;
  setIndex: number | null;
  moves: { name: string }[];
};

// The species categories a pool is built from (type themes / Legendaries /
// Starters / Eeveelutions / Varied), independent of set number.
function speciesCategories(roster: ThemeMon[]): Pick<RosterTheme, "categories" | "mostly"> {
  const n = roster.length;
  if (roster.every((m) => m.legendary))
    return { categories: [{ kind: "legendary", label: "Legendaries" }], mostly: [] };
  if (roster.every((m) => EEVEE_DEX.has(m.dexNum)))
    return { categories: [{ kind: "eevee", label: "Eeveelutions" }], mostly: [] };
  if (roster.every((m) => STARTER_DEX.has(m.dexNum)))
    return { categories: [{ kind: "starter", label: "Starters" }], mostly: [] };

  const gimmick = roster.filter((m) =>
    m.moves.some((mv) => {
      const nm = mv.name.toLowerCase();
      return OHKO_MOVES.has(nm) || BOOM_MOVES.has(nm);
    }),
  ).length;
  if (gimmick / n >= GIMMICK_THRESHOLD)
    return { categories: [{ kind: "gimmick", label: "OHKO / Explosion" }], mostly: [] };

  // Type coverage: fraction of the pool that has each type, most common first.
  const counts = new Map<string, number>();
  for (const m of roster)
    for (const t of m.types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const themes = ranked.filter(([, c]) => c / n >= TYPE_THEME_THRESHOLD).slice(0, 3);
  if (themes.length > 0)
    return { categories: themes.map(([t]) => ({ kind: "type", label: t, type: t })), mostly: [] };
  return {
    categories: [{ kind: "varied", label: "Varied" }],
    mostly: ranked.slice(0, 2).map(([t]) => t),
  };
}

// Summarise the pool a trainer draws from: its species categories plus the fixed
// set number (if any). Derived from the pool itself, so it stays correct if the
// data is regenerated.
export function rosterTheme(roster: ThemeMon[]): RosterTheme {
  if (roster.length === 0) return { categories: [], mostly: [], setIndex: null };
  // Fixed to a set number when every member with a known set number shares it
  // (trainer-exclusive variants carry no set number and are ignored).
  const nums = new Set<number>();
  for (const m of roster) if (m.setIndex != null) nums.add(m.setIndex);
  const setIndex = nums.size === 1 ? [...nums][0] : null;
  return { ...speciesCategories(roster), setIndex };
}
