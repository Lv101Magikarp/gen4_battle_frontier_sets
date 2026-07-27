import type { StatKey } from "./types";

// nature -> boosted / hindered stat (neutral natures omitted).
export const NATURE_EFFECT: Record<string, { up: StatKey; down: StatKey }> = {
  Lonely: { up: "atk", down: "def" },
  Brave: { up: "atk", down: "spe" },
  Adamant: { up: "atk", down: "spa" },
  Naughty: { up: "atk", down: "spd" },
  Bold: { up: "def", down: "atk" },
  Relaxed: { up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax: { up: "def", down: "spd" },
  Timid: { up: "spe", down: "atk" },
  Hasty: { up: "spe", down: "def" },
  Jolly: { up: "spe", down: "spa" },
  Naive: { up: "spe", down: "spd" },
  Modest: { up: "spa", down: "atk" },
  Mild: { up: "spa", down: "def" },
  Quiet: { up: "spa", down: "spe" },
  Rash: { up: "spa", down: "spd" },
  Calm: { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy: { up: "spd", down: "spe" },
  Careful: { up: "spd", down: "spa" },
};
