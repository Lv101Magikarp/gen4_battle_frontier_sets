// Trainer sprites. Two generated manifests back these lookups, both produced by
// scripts in ../../.. /scripts:
//   * trainerBattleSprites.generated.ts   — battle (VS) sprites (build_trainer_sprites.py)
//   * trainerOverworldSprites.generated.ts — overworld (walking) sprites (build_trainer_overworld.py)
// Both sets are bundled under public/ (sourced from the Bulbagarden Archives, with a
// few overworld crops from the Spriters Resource sheet) so the site is self-contained.
import { TRAINER_BATTLE_SPRITES } from "./trainerBattleSprites.generated";
import { TRAINER_OVERWORLD_SPRITES } from "./trainerOverworldSprites.generated";

type SpriteEntry = { default: string | null } | { male: string | null; female: string | null };
type Gender = "male" | "female" | null;

function resolve(entry: SpriteEntry | undefined, gender: Gender): string | null {
  if (!entry) return null;
  if ("default" in entry) return entry.default;
  // Gendered class: use the trainer's gender, defaulting to male when unspecified.
  return gender === "female" ? entry.female : entry.male;
}

// Overworld sprites live in public/, so they must be resolved against Vite's BASE_URL
// (the app is served from a sub-path on GitHub Pages). Hotlinked http(s) URLs pass through.
function withBase(path: string | null): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${import.meta.env.BASE_URL}${path}`;
}

// Battle (VS) sprite URL for a trainer's class/gender, or null when none exists.
export function trainerBattleSprite(trainerClass: string, gender: Gender): string | null {
  return withBase(resolve(TRAINER_BATTLE_SPRITES[trainerClass], gender));
}

// Overworld (walking) sprite URL, falling back to the battle sprite for the few
// classes with no Gen-4 overworld, then null (UI shows initials).
export function trainerOverworldSprite(trainerClass: string, gender: Gender): string | null {
  return (
    withBase(resolve(TRAINER_OVERWORLD_SPRITES[trainerClass], gender)) ??
    trainerBattleSprite(trainerClass, gender)
  );
}
