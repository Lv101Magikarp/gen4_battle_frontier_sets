"""Build data/pokedex.json: base stats, types, and (non-hidden) abilities for every
species that appears in the Battle Frontier set list, fetched from PokéAPI.

Run once; the output is committed so the app has no runtime dependency on PokéAPI.
Hidden abilities are excluded because they do not exist in Generation IV.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from parse_sets import load_all_rows, species_list, _slug

DATA = Path(__file__).resolve().parent.parent / "data"
POKEAPI = "https://pokeapi.co/api/v2/pokemon/{slug}"

STAT_MAP = {
    "hp": "hp",
    "attack": "atk",
    "defense": "def",
    "special-attack": "spa",
    "special-defense": "spd",
    "speed": "spe",
}

# Species whose PokéAPI resource name differs from a plain slug (default forms).
SLUG_OVERRIDES = {
    "Deoxys": "deoxys-normal",
    "Wormadam": "wormadam-plant",
    "Giratina": "giratina-altered",
    "Shaymin": "shaymin-land",
    "Basculin": "basculin-red-striped",
    "Darmanitan": "darmanitan-standard",
}


def api_slug(species: str) -> str:
    return SLUG_OVERRIDES.get(species, _slug(species))


def titleize_ability(slug: str) -> str:
    # PokéAPI ability names are slugs like "thick-fat", "soul-heart".
    return " ".join(w.capitalize() for w in slug.replace("-", " ").split())


GEN_ORDER = {
    "generation-i": 1, "generation-ii": 2, "generation-iii": 3, "generation-iv": 4,
    "generation-v": 5, "generation-vi": 6, "generation-vii": 7, "generation-viii": 8,
    "generation-ix": 9,
}

# PokéAPI reports CURRENT base stats and has no historical equivalent of
# `past_types`. Many species were rebalanced after Gen IV (the big Gen VI batch,
# a few in Gen VII, and Cresselia was nerfed in Gen IX), so their PokéAPI stats
# are wrong for a Gen IV app. This table holds the Generation IV base stats for
# every affected species in the set list; it overrides the fetched values.
# Derived from Pokémon Showdown's gen4→gen8 mod pokedex diffs (pre-Gen VI stats
# == Gen IV stats, since Gen V introduced no base-stat changes).
GEN4_BASE_STATS: dict[str, dict[str, int]] = {
    "Alakazam": {"hp": 55, "atk": 50, "def": 45, "spa": 135, "spd": 85, "spe": 120},
    "Ampharos": {"hp": 90, "atk": 75, "def": 75, "spa": 115, "spd": 90, "spe": 55},
    "Arbok": {"hp": 60, "atk": 85, "def": 69, "spa": 65, "spd": 79, "spe": 80},
    "Ariados": {"hp": 70, "atk": 90, "def": 70, "spa": 60, "spd": 60, "spe": 40},
    "Azumarill": {"hp": 100, "atk": 50, "def": 80, "spa": 50, "spd": 80, "spe": 50},
    "Beautifly": {"hp": 60, "atk": 70, "def": 50, "spa": 90, "spd": 50, "spe": 65},
    "Beedrill": {"hp": 65, "atk": 80, "def": 40, "spa": 45, "spd": 80, "spe": 75},
    "Bellossom": {"hp": 75, "atk": 80, "def": 85, "spa": 90, "spd": 100, "spe": 50},
    "Butterfree": {"hp": 60, "atk": 45, "def": 50, "spa": 80, "spd": 80, "spe": 70},
    "Chimecho": {"hp": 65, "atk": 50, "def": 70, "spa": 95, "spd": 80, "spe": 65},
    "Clefable": {"hp": 95, "atk": 70, "def": 73, "spa": 85, "spd": 90, "spe": 60},
    "Corsola": {"hp": 55, "atk": 55, "def": 85, "spa": 65, "spd": 85, "spe": 35},
    "Cresselia": {"hp": 120, "atk": 70, "def": 120, "spa": 75, "spd": 130, "spe": 85},
    "Delcatty": {"hp": 70, "atk": 65, "def": 65, "spa": 55, "spd": 55, "spe": 70},
    "Dodrio": {"hp": 60, "atk": 110, "def": 70, "spa": 60, "spd": 60, "spe": 100},
    "Dugtrio": {"hp": 35, "atk": 80, "def": 50, "spa": 50, "spd": 70, "spe": 120},
    "Electrode": {"hp": 60, "atk": 50, "def": 70, "spa": 80, "spd": 80, "spe": 140},
    "Exeggutor": {"hp": 95, "atk": 95, "def": 85, "spa": 125, "spd": 65, "spe": 55},
    "Exploud": {"hp": 104, "atk": 91, "def": 63, "spa": 91, "spd": 63, "spe": 68},
    "Farfetch'd": {"hp": 52, "atk": 65, "def": 55, "spa": 58, "spd": 62, "spe": 60},
    "Golem": {"hp": 80, "atk": 110, "def": 130, "spa": 55, "spd": 65, "spe": 45},
    "Illumise": {"hp": 65, "atk": 47, "def": 55, "spa": 73, "spd": 75, "spe": 85},
    "Jumpluff": {"hp": 75, "atk": 55, "def": 70, "spa": 55, "spd": 85, "spe": 110},
    "Lunatone": {"hp": 70, "atk": 55, "def": 65, "spa": 95, "spd": 85, "spe": 70},
    "Magcargo": {"hp": 50, "atk": 50, "def": 120, "spa": 80, "spd": 80, "spe": 30},
    "Mantine": {"hp": 65, "atk": 40, "def": 70, "spa": 80, "spd": 140, "spe": 70},
    "Masquerain": {"hp": 70, "atk": 60, "def": 62, "spa": 80, "spd": 82, "spe": 60},
    "Nidoking": {"hp": 81, "atk": 92, "def": 77, "spa": 85, "spd": 75, "spe": 85},
    "Nidoqueen": {"hp": 90, "atk": 82, "def": 87, "spa": 75, "spd": 85, "spe": 76},
    "Noctowl": {"hp": 100, "atk": 50, "def": 50, "spa": 76, "spd": 96, "spe": 70},
    "Pelipper": {"hp": 60, "atk": 50, "def": 100, "spa": 85, "spd": 70, "spe": 65},
    "Pidgeot": {"hp": 83, "atk": 80, "def": 75, "spa": 70, "spd": 70, "spe": 91},
    "Pikachu": {"hp": 35, "atk": 55, "def": 30, "spa": 50, "spd": 40, "spe": 90},
    "Poliwrath": {"hp": 90, "atk": 85, "def": 95, "spa": 70, "spd": 90, "spe": 70},
    "Qwilfish": {"hp": 65, "atk": 95, "def": 75, "spa": 55, "spd": 55, "spe": 85},
    "Raichu": {"hp": 60, "atk": 90, "def": 55, "spa": 90, "spd": 80, "spe": 100},
    "Roserade": {"hp": 60, "atk": 70, "def": 55, "spa": 125, "spd": 105, "spe": 90},
    "Solrock": {"hp": 70, "atk": 95, "def": 85, "spa": 55, "spd": 65, "spe": 70},
    "Staraptor": {"hp": 85, "atk": 120, "def": 70, "spa": 50, "spd": 50, "spe": 100},
    "Swellow": {"hp": 60, "atk": 85, "def": 60, "spa": 50, "spd": 50, "spe": 125},
    "Victreebel": {"hp": 80, "atk": 105, "def": 65, "spa": 100, "spd": 60, "spe": 70},
    "Vileplume": {"hp": 75, "atk": 80, "def": 85, "spa": 100, "spd": 90, "spe": 50},
    "Volbeat": {"hp": 65, "atk": 73, "def": 55, "spa": 47, "spd": 75, "spe": 85},
    "Wigglytuff": {"hp": 140, "atk": 70, "def": 45, "spa": 75, "spd": 50, "spe": 45},
}


def gen4_types(data: dict) -> list[str]:
    """Return the Pokémon's typing as it was in Generation IV.

    PokéAPI reports current typing; `past_types` records older typings. Each entry's
    generation is the LAST generation those types were valid. We want the earliest
    entry still valid in (or after) Gen IV — this corrects e.g. Fairy, which did not
    exist in Gen IV (Clefairy was pure Normal).
    """
    past = sorted(
        data.get("past_types", []),
        key=lambda e: GEN_ORDER.get(e["generation"]["name"], 99),
    )
    for entry in past:
        if GEN_ORDER.get(entry["generation"]["name"], 99) >= 4:
            return [t["type"]["name"].capitalize() for t in entry["types"]]
    return [t["type"]["name"].capitalize() for t in data["types"]]


def fetch_species(species: str) -> tuple[str, dict | None]:
    url = POKEAPI.format(slug=api_slug(species))
    req = urllib.request.Request(url, headers={"User-Agent": "gen4-bf-sets/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  MISS {species} ({api_slug(species)}): {exc}", file=sys.stderr)
        return species, None

    base = {STAT_MAP[s["stat"]["name"]]: s["base_stat"] for s in data["stats"]}
    base = GEN4_BASE_STATS.get(species, base)  # roll back post-Gen IV rebalances
    types = gen4_types(data)
    abilities = [
        titleize_ability(a["ability"]["name"])
        for a in data["abilities"]
        if not a["is_hidden"]
    ]
    return species, {
        "dexNum": data["id"],
        "baseStats": base,
        "types": types,
        "abilities": abilities,
    }


def main() -> None:
    rows = load_all_rows()
    species = species_list(rows)
    print(f"Fetching {len(species)} species from PokéAPI...", file=sys.stderr)

    pokedex: dict[str, dict] = {}
    misses: list[str] = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(fetch_species, sp): sp for sp in species}
        for fut in as_completed(futures):
            sp, entry = fut.result()
            if entry is None:
                misses.append(sp)
            else:
                pokedex[sp] = entry

    # Preserve first-appearance ordering for a stable, diff-friendly file.
    ordered = {sp: pokedex[sp] for sp in species if sp in pokedex}

    out = DATA / "pokedex.json"
    out.write_text(json.dumps(ordered, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out} with {len(ordered)} species.")
    if misses:
        print(f"MISSED {len(misses)} species (add SLUG_OVERRIDES): {misses}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
