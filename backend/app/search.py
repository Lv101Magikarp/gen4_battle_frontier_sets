"""Load the static set dataset and provide filtering / sorting / facets."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .stats import STAT_KEYS, compute_stats

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SETS_PATH = DATA_DIR / "sets.json"

# Quality tiers, best to worst (Battle Factory tier list).
TIER_ORDER = ["X", "S", "A+", "A-", "B", "C", "D+", "D-", "E", "F"]


@lru_cache(maxsize=1)
def load_sets() -> list[dict]:
    if not SETS_PATH.exists():
        raise FileNotFoundError(
            f"{SETS_PATH} not found — run scripts/build_pokedex.py then scripts/scrape.py"
        )
    return json.loads(SETS_PATH.read_text(encoding="utf-8"))


def with_computed_stats(sets: list[dict], iv: int) -> list[dict]:
    """Return copies of each set with a `stats` dict computed at the given IV."""
    out = []
    for s in sets:
        item = dict(s)
        item["stats"] = compute_stats(s["baseStats"], s["evs"], s["nature"], iv=iv)
        out.append(item)
    return out


def search(
    *,
    q: str | None = None,
    move: str | None = None,
    item: str | None = None,
    nature: str | None = None,
    ability: str | None = None,
    type: str | None = None,
    tier: str | None = None,
    set_index: int | None = None,
    ev_min: dict[str, int] | None = None,
    stat_min: dict[str, int] | None = None,
    stat_max: dict[str, int] | None = None,
    iv: int = 31,
    sort: str = "dexNum",
    order: str = "asc",
) -> list[dict]:
    results = with_computed_stats(load_sets(), iv)

    if q:
        ql = q.lower()
        results = [s for s in results if ql in s["species"].lower()]
    if move:
        ml = move.lower()
        results = [s for s in results
                   if any(ml in m["name"].lower() for m in s["moves"])]
    if item:
        results = [s for s in results if s["item"].lower() == item.lower()]
    if nature:
        results = [s for s in results if s["nature"].lower() == nature.lower()]
    if ability:
        al = ability.lower()
        results = [s for s in results
                   if any(al == a.lower() for a in s["abilities"])]
    if type:
        tl = type.lower()
        results = [s for s in results if any(tl == t.lower() for t in s["types"])]
    if tier:
        results = [s for s in results if s.get("tier") == tier]
    if set_index is not None:
        results = [s for s in results if s["setIndex"] == set_index]

    for stat, minv in (ev_min or {}).items():
        results = [s for s in results if s["evs"].get(stat, 0) >= minv]
    for stat, minv in (stat_min or {}).items():
        results = [s for s in results if s["stats"].get(stat, 0) >= minv]
    for stat, maxv in (stat_max or {}).items():
        results = [s for s in results if s["stats"].get(stat, 0) <= maxv]

    results = _sort(results, sort, order)
    return results


def _sort(results: list[dict], sort: str, order: str) -> list[dict]:
    reverse = order.lower() == "desc"

    if sort == "tier":
        # Sort by tier quality, keeping untiered sets last in BOTH directions.
        ranked = sorted(
            (s for s in results if s.get("tierRank") is not None),
            key=lambda s: (s["tierRank"], s["dexNum"], s["setIndex"]),
            reverse=reverse,
        )
        untiered = [s for s in results if s.get("tierRank") is None]
        return ranked + untiered

    def key(s: dict):
        if sort in STAT_KEYS:
            return s["stats"][sort]
        if sort == "species":
            return s["species"].lower()
        return s.get(sort, 0)

    # Secondary key keeps a stable, sensible ordering within ties.
    return sorted(results, key=lambda s: (key(s), s["dexNum"], s["setIndex"]),
                  reverse=reverse)


@lru_cache(maxsize=1)
def facets() -> dict[str, list]:
    sets = load_sets()
    items, natures, abilities, types, moves = set(), set(), set(), set(), set()
    for s in sets:
        items.add(s["item"])
        natures.add(s["nature"])
        abilities.update(s["abilities"])
        types.update(s["types"])
        moves.update(m["name"] for m in s["moves"])
    present_tiers = {s["tier"] for s in sets if s.get("tier")}
    return {
        "items": sorted(items),
        "natures": sorted(natures),
        "abilities": sorted(abilities),
        "types": sorted(types),
        "moves": sorted(moves),
        "setIndexes": sorted({s["setIndex"] for s in sets}),
        "tiers": [t for t in TIER_ORDER if t in present_tiers],
        "stats": STAT_KEYS,
        "total": len(sets),
    }
