// Trainer battle (VS) sprites. We hotlink Pokémon Showdown's Gen-4 trainer
// sprites by class (with a male/female split where the class has one). Showdown's
// `-gen4` set is the Diamond/Pearl/Platinum style HeartGold/SoulSilver reused for
// most of these classes, so it stands in for the HGSS battle sprite.
//
// The slug map below is AUTO-DERIVED by probing
// play.pokemonshowdown.com/sprites/trainers/ for each class in trainers.json:
// prefer the `-gen4` variant, fall back to the plain slug. Two edge cases:
//   * Socialite -> "madame-gen4" (its HGSS equivalent class on Showdown)
//   * PI -> null (Showdown has no sprite for it; the UI falls back to initials)
type SpriteSlug = { default: string | null } | { male: string | null; female: string | null };

const TRAINER_SPRITE_SLUGS: Record<string, SpriteSlug> = {
  "Ace Trainer": { male: "acetrainer-gen4", female: "acetrainerf-gen4" },
  "Aroma Lady": { default: "aromalady" },
  "Battle Girl": { default: "battlegirl-gen4" },
  "Beauty": { default: "beauty" },
  "Bird Keeper": { default: "birdkeeper" },
  "Black Belt": { default: "blackbelt-gen4" },
  "Bug Catcher": { default: "bugcatcher" },
  "Cameraman": { default: "cameraman" },
  "Camper": { default: "camper" },
  "Clown": { default: "clown" },
  "Collector": { default: "collector" },
  "Cowgirl": { default: "cowgirl" },
  "Cyclist": { male: "cyclist-gen4", female: "cyclistf-gen4" },
  "Dragon Tamer": { default: "dragontamer" },
  "Fisherman": { default: "fisherman-gen4" },
  "Gentleman": { default: "gentleman-gen4" },
  "Guitarist": { default: "guitarist-gen4" },
  "Hiker": { default: "hiker-gen4" },
  "Idol": { default: "idol" },
  "Jogger": { default: "jogger" },
  "Lady": { default: "lady-gen4" },
  "Lass": { default: "lass-gen4" },
  "Ninja Boy": { default: "ninjaboy" },
  "PI": { default: null },
  "Parasol Lady": { default: "parasollady-gen4" },
  "Picnicker": { default: "picnicker" },
  "Poké Kid": { default: "pokekid" },
  "Pokéfan": { male: "pokefan-gen4", female: "pokefanf-gen4" },
  "Pokémon Breeder": { male: "pokemonbreeder-gen4", female: "pokemonbreederf-gen4" },
  "Pokémon Ranger": { male: "pokemonranger-gen4", female: "pokemonrangerf-gen4" },
  "Policeman": { default: "policeman-gen4" },
  "Psychic": { male: "psychic-gen4", female: "psychicf-gen4" },
  "Rancher": { default: "rancher" },
  "Reporter": { default: "reporter" },
  "Rich Boy": { default: "richboy-gen4" },
  "Roughneck": { default: "roughneck-gen4" },
  "Ruin Maniac": { default: "ruinmaniac" },
  "Sailor": { default: "sailor" },
  "School Kid": { male: "schoolkid-gen4", female: "schoolkidf-gen4" },
  "Scientist": { default: "scientist-gen4" },
  "Socialite": { default: "madame-gen4" },
  "Tuber": { male: "tuber", female: "tuberf" },
  "Veteran": { default: "veteran-gen4" },
  "Waiter": { default: "waiter-gen4" },
  "Waitress": { default: "waitress-gen4" },
  "Worker": { default: "worker-gen4" },
  "Youngster": { default: "youngster-gen4" },
};

const SHOWDOWN_TRAINERS = "https://play.pokemonshowdown.com/sprites/trainers/";

function slugFor(trainerClass: string, gender: "male" | "female" | null): string | null {
  const entry = TRAINER_SPRITE_SLUGS[trainerClass];
  if (!entry) return null;
  if ("default" in entry) return entry.default;
  // Gendered class: use the trainer's gender, defaulting to male when unspecified.
  return gender === "female" ? entry.female : entry.male;
}

// Battle (VS) sprite URL for a trainer's class/gender, or null when no sprite exists.
export function trainerBattleSprite(
  trainerClass: string,
  gender: "male" | "female" | null,
): string | null {
  const slug = slugFor(trainerClass, gender);
  return slug ? `${SHOWDOWN_TRAINERS}${slug}.png` : null;
}
