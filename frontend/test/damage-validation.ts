// Regression test: cross-validate our Gen 4 damage engine (src/engine/damage.ts)
// against the reference calculator @smogon/calc. Both are fed the SAME Gen 4
// species/move data (from @smogon/calc's @pkmn/dex) and the same spread and
// modifiers, so this isolates the damage FORMULA, not data or name mapping.
//
// Only modifiers our engine models are exercised — variable-BP / multi-hit moves
// and unmodeled items/abilities are intentional scope gaps, not bugs. Empty
// abilities are replaced with a benign one on BOTH sides so @smogon doesn't
// silently substitute a species' default ability.
//
// Run: npm run test:damage   (exits non-zero on any mismatch)
import * as pkg from "@smogon/calc";
import { computeStats } from "../src/engine/stats.ts";
import { calcDamage, type Combatant, type Field, type MoveData, type Weather } from "../src/engine/damage.ts";
import type { StatKey, StatMap } from "../src/types.ts";

const { Generations, Pokemon, Move, Field: SmogonField, calculate, toID } = pkg as any;
const gen = Generations.get(4);

const BENIGN = "Keen Eye"; // no damage effect in either calculator
const NO_BOOST: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

const SPECIES = [
  "Salamence", "Snorlax", "Tyranitar", "Metagross", "Gengar", "Blissey", "Skarmory",
  "Starmie", "Heatran", "Garchomp", "Zapdos", "Swampert", "Aggron", "Alakazam",
  "Machamp", "Milotic", "Weavile", "Lucario", "Infernape", "Gyarados", "Vaporeon",
  "Jolteon", "Dragonite", "Rhyperior", "Cresselia", "Bronzong", "Empoleon",
  "Roserade", "Dusknoir", "Hippowdon", "Porygon2", "Scizor", "Umbreon", "Clefable",
];

// { o: our name (dataset spelling), t: @pkmn name }. Vanilla single-hit constant
// -BP damaging moves only (variable / multi-hit moves are excluded on purpose).
const MOVES: { o: string; t: string }[] = [
  "Dragon Claw", "Earthquake", "Ice Beam", "Thunderbolt", "Flamethrower", "Surf",
  "Shadow Ball", "Energy Ball", "Focus Blast", "Stone Edge", "Iron Head", "Aqua Tail",
  "Crunch", "Psychic", "Sludge Bomb", "Air Slash", "Dark Pulse", "Fire Blast",
  "Thunder", "Blizzard", "Dragon Pulse", "Flash Cannon", "Aura Sphere", "Bug Buzz",
  "Zen Headbutt", "Waterfall", "Poison Jab", "Rock Slide", "Shadow Claw", "Body Slam",
  "Giga Drain", "Signal Beam", "Extrasensory", "Close Combat", "Superpower", "Seed Bomb",
  "Gunk Shot", "Brave Bird", "Sucker Punch", "Night Slash",
].map((n) => ({ o: n, t: n })).concat([
  { o: "ThunderPunch", t: "Thunder Punch" }, { o: "Fire Punch", t: "Fire Punch" },
  { o: "Ice Punch", t: "Ice Punch" }, { o: "Mach Punch", t: "Mach Punch" },
  { o: "SolarBeam", t: "Solar Beam" }, { o: "Wood Hammer", t: "Wood Hammer" },
  { o: "Double-Edge", t: "Double-Edge" },
]);

// { o: our items.ts key (dataset spelling), t: @pkmn item name }.
const ITEMS: { o: string; t: string }[] = [
  { o: "", t: "" }, { o: "Life Orb", t: "Life Orb" },
  { o: "Choice Band", t: "Choice Band" }, { o: "Choice Specs", t: "Choice Specs" },
  { o: "Expert Belt", t: "Expert Belt" }, { o: "Muscle Band", t: "Muscle Band" },
  { o: "Wise Glasses", t: "Wise Glasses" }, { o: "Charcoal", t: "Charcoal" },
  { o: "Mystic Water", t: "Mystic Water" }, { o: "Magnet", t: "Magnet" },
  { o: "Miracle Seed", t: "Miracle Seed" }, { o: "Sharp Beak", t: "Sharp Beak" },
  { o: "Black Belt", t: "Black Belt" }, { o: "Poison Barb", t: "Poison Barb" },
  { o: "Soft Sand", t: "Soft Sand" }, { o: "Hard Stone", t: "Hard Stone" },
  { o: "Silk Scarf", t: "Silk Scarf" }, { o: "Spell Tag", t: "Spell Tag" },
  { o: "Twisted Spoon", t: "Twisted Spoon" }, { o: "NeverMeltIce", t: "Never-Melt Ice" },
  { o: "Dragon Fang", t: "Dragon Fang" }, { o: "BlackGlasses", t: "Black Glasses" },
  { o: "Metal Coat", t: "Metal Coat" }, { o: "SilverPowder", t: "Silver Powder" },
  { o: "Occa Berry", t: "Occa Berry" }, { o: "Yache Berry", t: "Yache Berry" },
  { o: "Haban Berry", t: "Haban Berry" }, { o: "Shuca Berry", t: "Shuca Berry" },
];

const ATK_ABILITIES = ["", "Adaptability", "Huge Power", "Pure Power", "Technician",
  "Iron Fist", "Reckless", "Guts", "Hustle", "Tinted Lens", "Mold Breaker", "Solar Power"];
const DEF_ABILITIES = ["", "Levitate", "Thick Fat", "Filter", "Solid Rock", "Heatproof",
  "Volt Absorb", "Water Absorb", "Flash Fire", "Dry Skin", "Marvel Scale", "Wonder Guard"];
const NATURES = ["Hardy", "Adamant", "Modest", "Jolly", "Timid", "Bold", "Calm", "Careful",
  "Impish", "Naughty", "Lonely", "Rash", "Brave", "Quiet"];
const WEATHERS: { o: Weather; t: string | undefined }[] = [
  { o: "none", t: undefined }, { o: "sun", t: "Sun" }, { o: "rain", t: "Rain" },
  { o: "sand", t: "Sand" }, { o: "hail", t: "Hail" },
];

// Deterministic RNG so a failure is reproducible.
const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)];
const stage = () => Math.floor(rng() * 13) - 6;
function randEvs(): StatMap {
  const e = { ...NO_BOOST } as StatMap;
  if (rng() < 0.8) { e[pick(STAT_KEYS)] = 252; e[pick(STAT_KEYS)] = 252; }
  return e;
}

interface Scenario {
  aSpec: string; dSpec: string; move: { o: string; t: string };
  aNat: string; dNat: string; aEvs: StatMap; dEvs: StatMap;
  aItem: { o: string; t: string }; dItem: { o: string; t: string };
  aAbil: string; dAbil: string;
  aAtkB: number; aSpaB: number; dDefB: number; dSpdB: number;
  crit: boolean; weather: { o: Weather; t: string | undefined };
  reflect: boolean; lightScreen: boolean; burn: boolean; dStatus: boolean;
}

function makeScenario(): Scenario {
  return {
    aSpec: pick(SPECIES), dSpec: pick(SPECIES), move: pick(MOVES),
    aNat: pick(NATURES), dNat: pick(NATURES), aEvs: randEvs(), dEvs: randEvs(),
    aItem: pick(ITEMS), dItem: rng() < 0.5 ? pick(ITEMS) : { o: "", t: "" },
    aAbil: pick(ATK_ABILITIES), dAbil: pick(DEF_ABILITIES),
    aAtkB: stage(), aSpaB: stage(), dDefB: stage(), dSpdB: stage(),
    crit: rng() < 0.25, weather: pick(WEATHERS),
    reflect: rng() < 0.3, lightScreen: rng() < 0.3, burn: rng() < 0.25, dStatus: rng() < 0.3,
  };
}

function ourRolls(s: Scenario, level: number): number[] | null {
  const aSp = gen.species.get(toID(s.aSpec)), dSp = gen.species.get(toID(s.dSpec));
  const mv = gen.moves.get(toID(s.move.t));
  if (!aSp || !dSp || !mv || !mv.basePower) return null;
  const toMap = (bs: any): StatMap => ({ hp: bs.hp, atk: bs.atk, def: bs.def, spa: bs.spa, spd: bs.spd, spe: bs.spe });
  const attacker: Combatant = {
    species: s.aSpec, types: aSp.types,
    stats: computeStats(toMap(aSp.baseStats), s.aEvs, s.aNat, 31, level),
    item: s.aItem.o, ability: s.aAbil || BENIGN,
    boosts: { ...NO_BOOST, atk: s.aAtkB, spa: s.aSpaB },
    status: s.burn, burned: s.burn, pinch: false,
  };
  const defender: Combatant = {
    species: s.dSpec, types: dSp.types,
    stats: computeStats(toMap(dSp.baseStats), s.dEvs, s.dNat, 31, level),
    item: s.dItem.o, ability: s.dAbil || BENIGN,
    boosts: { ...NO_BOOST, def: s.dDefB, spd: s.dSpdB },
    status: s.dStatus, burned: false, pinch: false,
  };
  const move: MoveData = {
    name: s.move.o, type: mv.type,
    category: mv.category as "Physical" | "Special" | "Status",
    basePower: mv.basePower, accuracy: mv.accuracy === true ? null : mv.accuracy,
  };
  const field: Field = { weather: s.weather.o, reflect: s.reflect, lightScreen: s.lightScreen, crit: s.crit, level };
  return calcDamage(attacker, defender, move, field).rolls;
}

function theirRolls(s: Scenario, level: number): number[] | null {
  try {
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const attacker = new Pokemon(gen, s.aSpec, {
      level, item: s.aItem.t || undefined, ability: s.aAbil || BENIGN,
      nature: s.aNat, evs: s.aEvs, ivs, boosts: { atk: s.aAtkB, spa: s.aSpaB },
      status: s.burn ? "brn" : "",
    });
    const defender = new Pokemon(gen, s.dSpec, {
      level, item: s.dItem.t || undefined, ability: s.dAbil || BENIGN,
      nature: s.dNat, evs: s.dEvs, ivs, boosts: { def: s.dDefB, spd: s.dSpdB },
      status: s.dStatus ? "psn" : "",
    });
    const move = new Move(gen, s.move.t, { isCrit: s.crit });
    const field = new SmogonField({
      weather: s.weather.t,
      defenderSide: { isReflect: s.reflect, isLightScreen: s.lightScreen },
    });
    const dmg = calculate(gen, attacker, defender, move, field).damage;
    return Array.isArray(dmg) ? dmg.map(Number) : [Number(dmg)];
  } catch {
    return null;
  }
}

// Both-zero (immunity) counts as equal regardless of array length.
function eq(a: number[], b: number[]): boolean {
  const az = a.length === 0 || a.every((x) => x === 0);
  const bz = b.length === 0 || b.every((x) => x === 0);
  if (az || bz) return az && bz;
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function describe(s: Scenario): string {
  return `A:${s.aSpec}@${s.aItem.o || "-"}/${s.aAbil || "-"} ${s.move.o} -> ` +
    `D:${s.dSpec}@${s.dItem.o || "-"}/${s.dAbil || "-"} ` +
    `crit=${s.crit} wx=${s.weather.o} refl=${s.reflect} ls=${s.lightScreen} burn=${s.burn} dStatus=${s.dStatus}`;
}

const N = Number(process.argv[2] ?? 6000);
const LEVELS = [50, 100]; // Factory Lv 50 and Open Level (100)
let failed = 0;
for (const level of LEVELS) {
  let ok = 0, mismatch = 0, skipped = 0;
  const examples: string[] = [];
  for (let i = 0; i < N; i++) {
    const s = makeScenario();
    const ours = ourRolls(s, level), theirs = theirRolls(s, level);
    if (!ours || !theirs) { skipped++; continue; }
    if (eq(ours, theirs)) ok++;
    else {
      mismatch++;
      if (examples.length < 10) {
        examples.push(`  Lv${level} ${describe(s)}\n    ours:   ${ours.length ? `${ours[0]}-${ours[ours.length - 1]}` : "0"}` +
          `\n    theirs: ${theirs[0]}-${theirs[theirs.length - 1]}`);
      }
    }
  }
  console.log(`Lv ${level}: ${ok}/${ok + mismatch} exact ` +
    `(${((ok / (ok + mismatch)) * 100).toFixed(2)}%), skipped ${skipped}`);
  if (mismatch > 0) {
    failed += mismatch;
    console.error(`\nFAIL @ Lv${level}: ${mismatch} mismatch(es):\n${examples.join("\n")}`);
  }
}

if (failed > 0) process.exit(1);
console.log("PASS (@smogon/calc gen 4, Lv 50 + Lv 100)");
