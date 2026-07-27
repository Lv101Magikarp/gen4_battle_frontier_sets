"""Generation IV stat computation (Level 50).

Final-stat formulas (Gen III onward):

    HP    = floor((2*base + iv + floor(ev/4)) * level / 100) + level + 10
    other = floor((floor((2*base + iv + floor(ev/4)) * level / 100) + 5) * natureMod)

natureMod is 1.1 for the boosted stat, 0.9 for the hindered stat, else 1.0.
"""
from __future__ import annotations

STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"]

# nature -> (boosted stat, hindered stat). Neutral natures are omitted (no change).
NATURES: dict[str, tuple[str, str]] = {
    "Lonely": ("atk", "def"),
    "Brave": ("atk", "spe"),
    "Adamant": ("atk", "spa"),
    "Naughty": ("atk", "spd"),
    "Bold": ("def", "atk"),
    "Relaxed": ("def", "spe"),
    "Impish": ("def", "spa"),
    "Lax": ("def", "spd"),
    "Timid": ("spe", "atk"),
    "Hasty": ("spe", "def"),
    "Jolly": ("spe", "spa"),
    "Naive": ("spe", "spd"),
    "Modest": ("spa", "atk"),
    "Mild": ("spa", "def"),
    "Quiet": ("spa", "spe"),
    "Rash": ("spa", "spd"),
    "Calm": ("spd", "atk"),
    "Gentle": ("spd", "def"),
    "Sassy": ("spd", "spe"),
    "Careful": ("spd", "spa"),
}
# Neutral: Hardy, Docile, Serious, Bashful, Quirky (not in the map -> mods all 1.0)


def nature_mods(nature: str) -> dict[str, float]:
    mods = {k: 1.0 for k in STAT_KEYS}
    pair = NATURES.get(nature)
    if pair:
        boost, hinder = pair
        mods[boost] = 1.1
        mods[hinder] = 0.9
    return mods


def compute_stat(base: int, ev: int, iv: int, nature_mod: float, is_hp: bool,
                 level: int = 50) -> int:
    core = ((2 * base + iv + ev // 4) * level) // 100
    if is_hp:
        return core + level + 10
    return int((core + 5) * nature_mod)


def compute_stats(base_stats: dict[str, int], evs: dict[str, int], nature: str,
                  iv: int = 31, level: int = 50) -> dict[str, int]:
    mods = nature_mods(nature)
    result: dict[str, int] = {}
    for key in STAT_KEYS:
        result[key] = compute_stat(
            base=base_stats[key],
            ev=evs.get(key, 0),
            iv=iv,
            nature_mod=mods[key],
            is_hp=(key == "hp"),
            level=level,
        )
    return result
