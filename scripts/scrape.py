"""Build data/sets.json: the final, normalized Battle Frontier set dataset.

Parses the Bulbapedia set tables (via parse_sets) and joins each set with base
stats, types, and abilities from data/pokedex.json (produced by build_pokedex.py).

Run build_pokedex.py first.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from parse_sets import load_all_rows

DATA = Path(__file__).resolve().parent.parent / "data"


def main() -> None:
    pokedex_path = DATA / "pokedex.json"
    if not pokedex_path.exists():
        sys.exit("data/pokedex.json missing — run build_pokedex.py first.")
    pokedex = json.loads(pokedex_path.read_text(encoding="utf-8"))

    tiers_path = DATA / "tiers.json"
    tiers = json.loads(tiers_path.read_text(encoding="utf-8")) if tiers_path.exists() else {}
    if not tiers:
        print("  note: data/tiers.json missing — run build_tiers.py to add Factory tiers.",
              file=sys.stderr)

    rows = load_all_rows()
    sets: list[dict] = []
    unmatched: list[str] = []

    for row in rows:
        entry = pokedex.get(row["species"])
        if entry is None:
            unmatched.append(row["species"])
            continue

        # Validation: 4 moves, 6 EV keys.
        assert len(row["moves"]) == 4, row
        assert set(row["evs"]) == {"hp", "atk", "def", "spa", "spd", "spe"}, row

        tier = tiers.get(row["id"], {})
        sets.append(
            {
                "id": row["id"],
                "dexNum": row["dexNum"],
                "species": row["species"],
                "setIndex": row["setIndex"],
                "setCount": row["setCount"],
                "item": row["item"],
                "nature": row["nature"],
                "moves": row["moves"],
                "evs": row["evs"],
                "types": entry["types"],
                "abilities": entry["abilities"],
                "baseStats": entry["baseStats"],
                "tier": tier.get("tier"),
                "tierRank": tier.get("tierRank"),
                "tierGroup": tier.get("tierGroup"),
                "tierIv": tier.get("iv"),
            }
        )

    out = DATA / "sets.json"
    out.write_text(json.dumps(sets, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out} with {len(sets)} sets "
          f"({len({s['species'] for s in sets})} species).")

    multi = sum(1 for s in sets if s["setCount"] == 4)
    print(f"  sets belonging to 4-set species: {multi}")
    if unmatched:
        print(f"  WARNING unmatched species (no pokedex entry): {sorted(set(unmatched))}",
              file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
