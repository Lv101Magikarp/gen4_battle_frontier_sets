"""Fetch and parse the Bulbapedia Gen IV Battle Frontier set tables.

The source rows look like::

    {{lop/facility|game=3|001|Bulbasaur|BrightPowder|Magical Leaf|Grass|Toxic|Poison|
      Leech Seed|Grass|Sweet Scent|Normal|Modest||||252|252|}}

Positional fields (after dropping ``key=value`` tokens such as ``game=3`` and
``itemlink=Metronome (item)``):

    dexNum, species, item,
    move1, type1, move2, type2, move3, type3, move4, type4,
    nature, evHP, evAtk, evDef, evSpA, evSpD, evSpe
"""
from __future__ import annotations

import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DATA_RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

PAGES = {
    "group1": "List of Battle Frontier Pokémon in Generation IV/Group 1",
    "group2": "List of Battle Frontier Pokémon in Generation IV/Group 2",
}

RAW_URL = (
    "https://bulbapedia.bulbagarden.net/w/index.php"
    "?title={title}&action=raw"
)

ROW_RE = re.compile(r"\{\{lop/facility\|(.*?)\}\}", re.DOTALL)

EV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"]


def fetch_raw(name: str, title: str, use_cache: bool = True) -> str:
    """Fetch a page's raw wikitext, caching it under data/raw/."""
    DATA_RAW.mkdir(parents=True, exist_ok=True)
    cache = DATA_RAW / f"{name}.wikitext"
    if use_cache and cache.exists():
        return cache.read_text(encoding="utf-8")

    url = RAW_URL.format(title=urllib.parse.quote(title))
    req = urllib.request.Request(url, headers={"User-Agent": "gen4-bf-sets/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (trusted host)
        text = resp.read().decode("utf-8")
    cache.write_text(text, encoding="utf-8")
    return text


def _clean(token: str) -> str:
    return token.strip()


def parse_rows(wikitext: str) -> list[dict]:
    """Parse all set rows from one page's wikitext, in document order."""
    rows: list[dict] = []
    for match in ROW_RE.finditer(wikitext):
        body = match.group(1)
        # Split on pipes, drop any named param (contains '='), keep positionals.
        tokens = [t for t in body.split("|") if "=" not in t]
        tokens = [_clean(t) for t in tokens]
        # Pad to the 18 expected positional fields (trailing EVs may be empty).
        while len(tokens) < 18:
            tokens.append("")
        if len(tokens) > 18:
            # Defensive: an unexpected extra field would misalign; log and skip.
            print(f"  WARN: row has {len(tokens)} fields, skipping: {body[:60]}...",
                  file=sys.stderr)
            continue

        dex_raw, species, item = tokens[0], tokens[1], tokens[2]
        moves = [
            {"name": tokens[3], "type": tokens[4]},
            {"name": tokens[5], "type": tokens[6]},
            {"name": tokens[7], "type": tokens[8]},
            {"name": tokens[9], "type": tokens[10]},
        ]
        nature = tokens[11]
        evs = {}
        for i, key in enumerate(EV_KEYS):
            raw = tokens[12 + i]
            evs[key] = int(raw) if raw.isdigit() else 0

        rows.append(
            {
                "dexNum": int(dex_raw) if dex_raw.isdigit() else 0,
                "species": species,
                "item": item,
                "moves": moves,
                "nature": nature,
                "evs": evs,
            }
        )
    return rows


def load_all_rows(use_cache: bool = True) -> list[dict]:
    """Return every set row from Group 1 then Group 2, in document order,
    with per-species setIndex/setCount assigned by order of appearance."""
    rows: list[dict] = []
    for name, title in PAGES.items():
        wikitext = fetch_raw(name, title, use_cache=use_cache)
        page_rows = parse_rows(wikitext)
        print(f"  parsed {len(page_rows)} rows from {name}", file=sys.stderr)
        rows.extend(page_rows)

    # Assign set index = Nth appearance of the species across the ordered list.
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["species"]] = counts.get(row["species"], 0) + 1
        row["setIndex"] = counts[row["species"]]
    for row in rows:
        row["setCount"] = counts[row["species"]]
        row["id"] = f"{_slug(row['species'])}-{row['setIndex']}"
    return rows


def species_list(rows: list[dict]) -> list[str]:
    """Unique species names in first-appearance order."""
    seen: dict[str, None] = {}
    for row in rows:
        seen.setdefault(row["species"], None)
    return list(seen.keys())


def _slug(name: str) -> str:
    """URL-safe slug for a species name (used for set ids)."""
    s = name.lower().strip()
    s = s.replace("♀", "-f").replace("♂", "-m")
    s = re.sub(r"[.'’]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


if __name__ == "__main__":
    all_rows = load_all_rows(use_cache=False)
    print(f"Total rows: {len(all_rows)}")
    print(f"Unique species: {len(species_list(all_rows))}")
    multi = sorted({r["species"]: r["setCount"] for r in all_rows}.items(),
                   key=lambda kv: -kv[1])[:8]
    print("Most sets per species:", multi)
