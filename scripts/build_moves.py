"""Build data/moves.json: Generation IV base power, damage class, type, and
accuracy for every move that appears in the Battle Frontier set list, fetched
from PokéAPI.

Run once; the output is committed so the app has no runtime dependency on PokéAPI
(mirrors scripts/build_pokedex.py). The move list is read from the already-built
data/sets.json + data/trainers.json rather than re-parsing wikitext.

PokéAPI reports a move's CURRENT stats plus a `past_values` list. Each past-value
entry records the values that were in effect BEFORE the change introduced in its
`version_group` (confirmed empirically: Surf shows past@x-y power=95, current=90,
i.e. it was 95 through Gen VI XY and dropped afterwards). So the Gen IV value of a
field is the value from the earliest change that happened AFTER Gen IV, falling
back to the current value when nothing changed after Gen IV. See gen4_value().
"""
from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
POKEAPI = "https://pokeapi.co/api/v2/move/{slug}"

# version-group name -> generation number.
VG_GEN = {
    "red-blue": 1, "yellow": 1,
    "gold-silver": 2, "crystal": 2,
    "ruby-sapphire": 3, "emerald": 3, "firered-leafgreen": 3, "colosseum": 3, "xd": 3,
    "diamond-pearl": 4, "platinum": 4, "heartgold-soulsilver": 4,
    "black-white": 5, "black-2-white-2": 5,
    "x-y": 6, "omega-ruby-alpha-sapphire": 6,
    "sun-moon": 7, "ultra-sun-ultra-moon": 7, "lets-go-pikachu-lets-go-eevee": 7,
    "sword-shield": 8, "brilliant-diamond-and-shining-pearl": 8, "legends-arceus": 8,
    "scarlet-violet": 9,
}

CATEGORY = {"physical": "Physical", "special": "Special", "status": "Status"}

# Move names in the datasets whose PokéAPI slug is not a plain lowercase-hyphen
# slug of the name (mostly Gen IV "SolarBeam"-style typography, plus renames).
SLUG_OVERRIDES = {
    "AncientPower": "ancient-power",
    "BubbleBeam": "bubble-beam",
    "DoubleSlap": "double-slap",
    "DragonBreath": "dragon-breath",
    "DynamicPunch": "dynamic-punch",
    "ExtremeSpeed": "extreme-speed",
    "Faint Attack": "feint-attack",
    "FeatherDance": "feather-dance",
    "GrassWhistle": "grass-whistle",
    "Hi Jump Kick": "high-jump-kick",
    "PoisonPowder": "poison-powder",
    "Selfdestruct": "self-destruct",
    "Softboiled": "soft-boiled",
    "SolarBeam": "solar-beam",
    "ThunderPunch": "thunder-punch",
    "ThunderShock": "thunder-shock",
    "ViceGrip": "vice-grip",
}


def plain_slug(name: str) -> str:
    s = name.lower().strip()
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        elif ch in " -_'.":
            out.append("-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def api_slug(name: str) -> str:
    return SLUG_OVERRIDES.get(name, plain_slug(name))


def gen4_value(field: str, current, past_values: list[dict]):
    """Reconstruct the Gen IV value of `field` from PokéAPI current + past_values.

    A past_value entry holds the values in effect BEFORE the change introduced in
    its version_group, so the Gen IV value is the value from the earliest change
    that happened strictly after Gen IV; if a field is null in that entry it was
    unchanged there (look at the next later change), and if no later change touched
    it the Gen IV value equals the current value.
    """
    later = sorted(
        (p for p in past_values if VG_GEN.get(p["version_group"]["name"], 99) > 4),
        key=lambda p: VG_GEN.get(p["version_group"]["name"], 99),
    )
    for p in later:
        val = p.get(field)
        if field == "type":
            val = val["name"] if val else None
        if val is not None:
            return val
    return current


def fetch_move(name: str) -> tuple[str, dict | None]:
    url = POKEAPI.format(slug=api_slug(name))
    req = urllib.request.Request(url, headers={"User-Agent": "gen4-bf-sets/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  MISS {name} ({api_slug(name)}): {exc}", file=sys.stderr)
        return name, None

    past = data.get("past_values", [])
    power = gen4_value("power", data["power"], past)
    accuracy = gen4_value("accuracy", data["accuracy"], past)
    move_type = gen4_value("type", data["type"]["name"], past)

    return name, {
        "type": move_type.capitalize(),
        "category": CATEGORY[data["damage_class"]["name"]],
        "basePower": power,      # null for status / OHKO / fixed / variable moves
        "accuracy": accuracy,    # null for always-hit moves
    }


def move_names() -> list[str]:
    names: dict[str, None] = {}
    for fname in ("sets.json", "trainers.json"):
        raw = json.loads((DATA / fname).read_text(encoding="utf-8"))
        rows = raw["sets"] if isinstance(raw, dict) else raw
        for row in rows:
            for mv in row["moves"]:
                names.setdefault(mv["name"], None)
    return sorted(names)


def main() -> None:
    names = move_names()
    print(f"Fetching {len(names)} moves from PokéAPI...", file=sys.stderr)

    moves: dict[str, dict] = {}
    misses: list[str] = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(fetch_move, nm): nm for nm in names}
        for fut in as_completed(futures):
            nm, entry = fut.result()
            if entry is None:
                misses.append(nm)
            else:
                moves[nm] = entry

    ordered = {nm: moves[nm] for nm in names if nm in moves}
    out = DATA / "moves.json"
    out.write_text(json.dumps(ordered, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out} with {len(ordered)} moves.")

    if misses:
        print(f"MISSED {len(misses)} moves (add SLUG_OVERRIDES): {misses}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
