"""Build data/tiers.json from the Battle Factory tier-list Google Sheet.

The sheet ranks every one of the 950 sets into a quality tier (X, S, A+, A-, B, C,
D+, D-, E, F) laid out as columns, grouped into "Factory Tier" blocks (Tier 1 / IV0,
Tier 2 / IV4, Tier 3 / IV8, Tier 4+). A cell holds a Pokémon token whose trailing
digit is the set index (no digit in the Tier 1 block => set index 1).

Output: data/tiers.json = { "<set-id>": {tier, tierRank, tierGroup, iv} }.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from parse_sets import _slug, load_all_rows

DATA = Path(__file__).resolve().parent.parent / "data"
CACHE = DATA / "raw" / "factory_tiers.csv"
SHEET_CSV = (
    "https://docs.google.com/spreadsheets/d/"
    "14tdALdEvdrDWJ0TXyU04Nr95xuNlWrvmfUE-BM5ohnk/export?format=csv&gid=0"
)

TIER_RE = re.compile(r"(\S+)\s+Tier")
BLOCK_RE = re.compile(r"Tier\s*(\d+)")
IV_RE = re.compile(r"IV\s*(\d+)")

TIER_RANK = {"X": 0, "S": 1, "A+": 2, "A-": 3, "B": 4, "C": 5,
             "D+": 6, "D-": 7, "E": 8, "F": 9}


def fetch_csv(use_cache: bool = True) -> str:
    if use_cache and CACHE.exists():
        return CACHE.read_text(encoding="utf-8")
    req = urllib.request.Request(SHEET_CSV, headers={"User-Agent": "gen4-bf-sets/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        text = resp.read().decode("utf-8")
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(text, encoding="utf-8")
    return text


def column_tiers(header: list[str]) -> dict[int, str]:
    """Map each column index to its quality tier letter, from the header row."""
    mapping: dict[int, str] = {}
    current: str | None = None
    for col, cell in enumerate(header):
        m = TIER_RE.search(cell)
        if m and m.group(1) in TIER_RANK:
            current = m.group(1)
        if current is not None and col >= 2:
            mapping[col] = current
    return mapping


def resolve_set_id(token: str, has_suffix: bool, valid_ids: set[str]) -> str | None:
    """Map a cell token to a valid set id, trying both suffix interpretations.

    Trailing digit is the set index; Tier 1 tokens usually have no suffix (index 1),
    but the sheet has occasional stray digits, so we try both and keep what matches.
    """
    token = token.strip()
    candidates: list[tuple[str, int]] = []
    if token[-1:].isdigit():
        candidates.append((token[:-1].strip(), int(token[-1])))  # suffix = index
    candidates.append((token, 1))  # whole token is the species, index 1
    if not has_suffix:
        candidates.reverse()  # prefer the no-suffix reading in the Tier 1 block
    for species, idx in candidates:
        set_id = f"{_slug(species)}-{idx}"
        if set_id in valid_ids:
            return set_id
    return None


def main() -> None:
    text = fetch_csv(use_cache=CACHE.exists())
    rows = list(csv.reader(io.StringIO(text)))
    col_tier = column_tiers(rows[0])

    valid_ids = {r["id"] for r in load_all_rows()}

    tiers: dict[str, dict] = {}
    unmatched: list[str] = []
    block_group: str | None = None
    block_iv: int | None = None
    is_tier1 = False

    for row in rows[2:]:  # skip header + description rows
        label = row[0].strip() if row else ""
        bm = BLOCK_RE.search(label)
        if bm:  # a block-label row ALSO carries that block's first row of Pokémon
            first_line = label.splitlines()[0].strip()
            block_group = first_line
            ivm = IV_RE.search(label)
            block_iv = int(ivm.group(1)) if ivm else None
            is_tier1 = bm.group(1) == "1"
        if block_group is None:
            continue

        for col in range(2, len(row)):
            cell = row[col].strip()
            if not cell or cell.isdigit():  # empty or a block count marker
                continue
            tier = col_tier.get(col)
            if tier is None:
                continue
            set_id = resolve_set_id(cell, has_suffix=not is_tier1, valid_ids=valid_ids)
            if set_id is None:
                unmatched.append(cell)
                continue
            tiers[set_id] = {
                "tier": tier,
                "tierRank": TIER_RANK[tier],
                "tierGroup": block_group,
                "iv": block_iv,
            }

    out = DATA / "tiers.json"
    out.write_text(json.dumps(tiers, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out} with {len(tiers)} tiered sets.")
    print(f"  coverage: {len(tiers)}/{len(valid_ids)} sets")
    if unmatched:
        print(f"  UNMATCHED tokens ({len(unmatched)}): {unmatched[:20]}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
