"""Build data/trainers.json: the Gen IV Battle Frontier opponent-trainer database.

Source: Bulbapedia "List of Battle Frontier Trainers in Generation IV" (main table
of 300 trainers) plus one subpage per Trainer class holding each trainer's Pokémon
roster (the same ``{{lop/facility|...}}`` set rows parsed by parse_sets).

Mechanics captured (see the source page intro):
  * Each trainer has a fixed index (1-300). The index determines the uniform IV
    used across all stats. This app is Battle-Factory-oriented, so we use the
    Factory IV distribution (0/4/8/12/16/20/24/31). The index ranges also define
    the eight "tiers" the app already uses.
  * The main table's eight "Consecutive Battle No." columns (1-7, 8-14, ... 50+)
    are the eight rounds; a checkmark means the trainer can appear that round, and
    a gold checkmark means they only appear as that round's 7th (final) battle.
  * Multiple named trainers share one roster ("group"); rosters are deduplicated
    into a single set table that groups reference by index, keeping the file small.

Run build_pokedex.py first (roster sets are joined with base stats from pokedex.json).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from parse_sets import fetch_raw, parse_rows, _slug

DATA = Path(__file__).resolve().parent.parent / "data"
MAIN_TITLE = "List of Battle Frontier Trainers in Generation IV"

EV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"]

# Battle Factory IV distribution by trainer index -> (tier, iv). Index breakpoints
# are shared with Battle Tower/Castle/Arcade; only the IV values differ (the Tower
# family uses 3/6/9/12/15/18/21/31). See the source page's "IV Distribution" lists.
TIER_BANDS = [
    (1, 100, 1, 0),
    (101, 120, 2, 4),
    (121, 140, 3, 8),
    (141, 160, 4, 12),
    (161, 180, 5, 16),
    (181, 200, 6, 20),
    (201, 220, 7, 24),
    (221, 300, 8, 31),
]

# The eight round columns, labelled by consecutive-battle range.
ROUND_LABELS = ["1-7", "8-14", "15-21", "22-28", "29-35", "36-42", "43-49", "50+"]


def tier_iv_for_index(index: int) -> tuple[int, int]:
    for lo, hi, tier, iv in TIER_BANDS:
        if lo <= index <= hi:
            return tier, iv
    raise ValueError(f"trainer index out of range: {index}")


def parse_main(wikitext: str) -> list[dict]:
    """Parse the 300-row trainer table into per-trainer records.

    Each block is: ``|NNN`` / ``|{{tc|Class}}...`` / ``|[[..#Anchor|Name]]`` then
    eight ``!`` round cells (✔ = appears, gold background = 7th-battle-only).
    """
    lines = wikitext.split("\n")
    trainers: list[dict] = []
    row_re = re.compile(r"^\|(\d{3})$")
    i = 0
    while i < len(lines):
        m = row_re.match(lines[i].strip())
        if not m:
            i += 1
            continue
        index = int(m.group(1))
        cls_line, name_line = lines[i + 1], lines[i + 2]

        cls_m = re.search(r"\{\{tc\|([^}]+)\}\}", cls_line)
        cls = cls_m.group(1).strip()
        gender = "female" if "{{female}}" in cls_line else "male" if "{{male}}" in cls_line else None

        nm = re.search(r"#([^|\]]+)\|([^\]]+)\]\]", name_line)
        if nm:
            anchor, name = nm.group(1).strip(), nm.group(2).strip()
        else:  # fallback: plain [[link|Name]] or bare text
            alt = re.search(r"\[\[[^|]*\|([^\]]+)\]\]", name_line)
            anchor = name = (alt.group(1).strip() if alt else name_line.strip("|[] "))

        rounds: list[str] = []
        j = i + 3
        while len(rounds) < 8 and j < len(lines):
            ln = lines[j]
            if ln.startswith("!"):
                if "✔" in ln:
                    rounds.append("boss" if "gold" in ln else "yes")
                else:
                    rounds.append("no")
            j += 1
        if len(rounds) != 8:
            print(f"  WARN trainer {index}: {len(rounds)} round cells", file=sys.stderr)

        tier, iv = tier_iv_for_index(index)
        trainers.append({
            "index": index, "class": cls, "gender": gender,
            "anchor": anchor, "name": name,
            "tier": tier, "iv": iv, "rounds": rounds,
        })
        i = j
    return trainers


def parse_class_groups(cls: str) -> list[tuple[list[str], list[dict]]]:
    """Return [(anchors, roster_rows)] for one Trainer-class subpage.

    A group is a run of ``{{anchor|Name}}`` templates followed by a
    ``{{lop/facility/head}}`` table of set rows ended by ``|}``.
    """
    txt = fetch_raw(f"trainer-{_slug(cls)}", f"{MAIN_TITLE}/{cls}")
    groups = []
    pat = re.compile(
        r"((?:\{\{anchor\|[^}]+\}\})+)\s*\{\{lop/facility/head.*?\n(.*?)\n\|\}", re.S
    )
    for mo in pat.finditer(txt):
        anchors = [a.strip() for a in re.findall(r"\{\{anchor\|([^}]+)\}\}", mo.group(1))]
        groups.append((anchors, parse_rows(mo.group(2))))
    return groups


def main() -> None:
    pokedex_path = DATA / "pokedex.json"
    if not pokedex_path.exists():
        sys.exit("data/pokedex.json missing — run build_pokedex.py first.")
    pokedex = json.loads(pokedex_path.read_text(encoding="utf-8"))

    # sets.json gives each roster set its set number (setIndex 1-4) and how many
    # sets its species has (setCount) — used to label roster Pokémon (e.g. the
    # community name "Venusaur3"). Keyed by (dex, item, nature, move names).
    sets_path = DATA / "sets.json"
    sets = json.loads(sets_path.read_text(encoding="utf-8")) if sets_path.exists() else []

    def match_key(s: dict) -> tuple:
        return (s["dexNum"], s["item"].lower(), s["nature"].lower(),
                tuple(m["name"].lower() for m in s["moves"]))

    setindex_by_key = {match_key(s): s["setIndex"] for s in sets}
    setcount_by_species = {s["species"]: s["setCount"] for s in sets}

    trainers = parse_main(fetch_raw("trainers-main", MAIN_TITLE))
    print(f"parsed {len(trainers)} trainers", file=sys.stderr)

    # Deduplicate roster sets into one global table; groups reference it by index.
    set_table: list[dict] = []
    set_index: dict[tuple, int] = {}
    groups: dict[str, list[int]] = {}
    anchor_to_group: dict[tuple[str, str], str] = {}
    unmatched_species: set[str] = set()

    def set_key(r: dict) -> tuple:
        return (
            r["dexNum"], r["item"], r["nature"],
            tuple((m["name"], m["type"]) for m in r["moves"]),
            tuple(r["evs"][k] for k in EV_KEYS),
        )

    classes = sorted({t["class"] for t in trainers})
    for cls in classes:
        for gnum, (anchors, roster) in enumerate(parse_class_groups(cls)):
            gid = f"{_slug(cls)}-{gnum}"
            ref: list[int] = []
            for r in roster:
                key = set_key(r)
                idx = set_index.get(key)
                if idx is None:
                    entry = pokedex.get(r["species"])
                    if entry is None:
                        unmatched_species.add(r["species"])
                        continue
                    idx = len(set_table)
                    set_index[key] = idx
                    set_table.append({
                        "id": f"{_slug(r['species'])}-{idx}",
                        "dexNum": r["dexNum"],
                        "species": r["species"],
                        "item": r["item"],
                        "nature": r["nature"],
                        "moves": r["moves"],
                        "evs": r["evs"],
                        "types": entry["types"],
                        "abilities": entry["abilities"],
                        "baseStats": entry["baseStats"],
                        "weight": entry["weight"],
                        # Set number 1-4 (None for trainer-exclusive variants not in
                        # sets.json) and the species' total set count.
                        "setIndex": setindex_by_key.get(match_key(r)),
                        "setCount": setcount_by_species.get(r["species"], 1),
                    })
                ref.append(idx)
            groups[gid] = ref
            for a in anchors:
                anchor_to_group[(cls, a)] = gid

    # Attach each trainer to its roster group; drop the transient anchor field.
    missing = []
    for t in trainers:
        gid = anchor_to_group.get((t["class"], t["anchor"]))
        if gid is None:
            missing.append((t["index"], t["class"], t["anchor"]))
        t["groupId"] = gid
        del t["anchor"]

    if unmatched_species:
        print(f"  WARN roster species missing from pokedex: {sorted(unmatched_species)}",
              file=sys.stderr)
    if missing:
        print(f"  WARN {len(missing)} trainers without a roster group: {missing[:10]}",
              file=sys.stderr)
        sys.exit(1)

    out = {
        "roundLabels": ROUND_LABELS,
        "ivByTier": {str(tier): iv for _, _, tier, iv in TIER_BANDS},
        "sets": set_table,
        "groups": groups,
        "trainers": trainers,
    }
    out_path = DATA / "trainers.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    # match json.dumps style used elsewhere (no trailing newline)
    print(f"Wrote {out_path}: {len(trainers)} trainers, {len(groups)} groups, "
          f"{len(set_table)} distinct sets.")


if __name__ == "__main__":
    main()
