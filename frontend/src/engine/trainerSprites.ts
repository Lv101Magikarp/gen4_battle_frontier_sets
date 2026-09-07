// Trainer battle (VS) sprites. The URL map lives in trainerBattleSprites.generated.ts,
// produced by scripts/build_trainer_sprites.py. Sprites are hotlinked from the
// Bulbagarden Archives (game-accurate HGSS art, falling back to the DP sprite HGSS
// reused for most classes); Policeman, which has no Gen-4 Bulbapedia sprite, comes
// from Pokémon Showdown. Regenerate the map by re-running that script.
import { TRAINER_BATTLE_SPRITES } from "./trainerBattleSprites.generated";

// Battle (VS) sprite URL for a trainer's class/gender, or null when none exists.
export function trainerBattleSprite(
  trainerClass: string,
  gender: "male" | "female" | null,
): string | null {
  const entry = TRAINER_BATTLE_SPRITES[trainerClass];
  if (!entry) return null;
  if ("default" in entry) return entry.default;
  // Gendered class: use the trainer's gender, defaulting to male when unspecified.
  return gender === "female" ? entry.female : entry.male;
}
