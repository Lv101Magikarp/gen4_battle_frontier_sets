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
