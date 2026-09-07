#!/usr/bin/env python3
"""Resolve trainer BATTLE (VS) sprite URLs into a generated manifest.

These sprites are *hotlinked* from the Bulbagarden Archives (a stable image host),
not bundled — same approach the app already uses for PokéAPI/Showdown sprites. For
every trainer class in data/trainers.json we pick the game-accurate HeartGold/
SoulSilver sprite, preferring the HGSS art and falling back to the Diamond/Pearl
sprite HGSS reused for most classes. The one class Bulbapedia has no Gen-4 sprite
for (Policeman) is hotlinked from Pokémon Showdown's Gen-4 set instead.

Output:
  frontend/src/engine/trainerBattleSprites.generated.ts   (class -> URL map)

Re-run to refresh URLs after Bulbagarden re-uploads. Requires network access.
"""
from __future__ import annotations
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRAINERS = ROOT / "data" / "trainers.json"
MANIFEST = ROOT / "frontend" / "src" / "engine" / "trainerBattleSprites.generated.ts"

API = "https://archives.bulbagarden.net/w/api.php"
SHOWDOWN = "https://play.pokemonshowdown.com/sprites/trainers/"
UA = "gen4-frontier-sprite-builder/1.0 (fan project)"

# Classes with distinct male/female trainers in the dataset.
GENDERED = {
    "Ace Trainer", "Cyclist", "Pokéfan", "Pokémon Breeder",
    "Pokémon Ranger", "Psychic", "School Kid", "Tuber",
}

# Classes Bulbapedia has no Gen-4 sprite for -> Showdown slug.
SHOWDOWN_OVERRIDE = {("Policeman", None): "policeman-gen4"}


def http_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def resolve_bulba(titles: list[str]) -> dict[str, str | None]:
    """{requested File: title -> stable image url or None}."""
    out: dict[str, str | None] = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        q = urllib.parse.urlencode({
            "action": "query", "titles": "|".join(batch),
            "prop": "imageinfo", "iiprop": "url", "format": "json",
        })
        data = http_json(f"{API}?{q}")
        norm = {n["from"]: n["to"] for n in data["query"].get("normalized", [])}
        pages = {
            p["title"]: (p["imageinfo"][0]["url"] if p.get("imageinfo") else None)
            for p in data["query"]["pages"].values()
        }
        for t in batch:
            url = pages.get(norm.get(t, t))
            out[t] = url.split("?")[0] if url else None  # drop volatile ?updated
        time.sleep(0.05)
    return out


def bulba_candidates(c: str, g: str | None) -> list[str]:
    if g is None:
        return [f"File:Spr HGSS {c}.png", f"File:Spr DP {c}.png"]
    suf = " M" if g == "male" else " F"
    if g == "male":
        # The genderless sprite is the male default, so a male may use it before DP.
        return [
            f"File:Spr HGSS {c}{suf}.png", f"File:Spr HGSS {c}.png",
            f"File:Spr DP {c}{suf}.png", f"File:Spr DP {c}.png",
        ]
    # Female: prefer a real female sprite (either era) before collapsing to the
    # genderless/male default.
    return [
        f"File:Spr HGSS {c}{suf}.png", f"File:Spr DP {c}{suf}.png",
        f"File:Spr HGSS {c}.png", f"File:Spr DP {c}.png",
    ]


def main() -> int:
    data = json.loads(TRAINERS.read_text())
    classes = sorted({t["class"] for t in data["trainers"]})

    variants: list[tuple[str, str | None]] = []
    for c in classes:
        variants += [(c, "male"), (c, "female")] if c in GENDERED else [(c, None)]

    all_titles: list[str] = []
    cand_map: dict[tuple[str, str | None], list[str]] = {}
    for c, g in variants:
        if (c, g) in SHOWDOWN_OVERRIDE:
            continue
        cand_map[(c, g)] = bulba_candidates(c, g)
        all_titles += cand_map[(c, g)]
    resolved = resolve_bulba(all_titles)

    manifest: dict[str, dict[str, str | None]] = {}
    report: list[str] = []
    for c, g in variants:
        url, src = None, "MISS"
        if (c, g) in SHOWDOWN_OVERRIDE:
            url, src = f"{SHOWDOWN}{SHOWDOWN_OVERRIDE[(c, g)]}.png", "SHOWDOWN"
        else:
            for t in cand_map[(c, g)]:
                if resolved.get(t):
                    url = resolved[t]
                    src = "HGSS" if "Spr HGSS" in t else "DP"
                    break
        slot = "male" if g == "male" else "female" if g == "female" else "default"
        manifest.setdefault(c, {})[slot] = url
        report.append(f"{c:16s}{('/'+g) if g else '':7s} {src}")

    write_manifest(classes, manifest)
    print("\n".join(report))
    miss = [c for c, e in manifest.items() if all(v is None for v in e.values())]
    print(f"\nWrote {MANIFEST.relative_to(ROOT)} | classes with no sprite: {miss or 'none'}")
    return 0


def ts_lit(v: str | None) -> str:
    return "null" if v is None else json.dumps(v)


def write_manifest(classes: list[str], manifest: dict[str, dict[str, str | None]]) -> None:
    lines = [
        "// AUTO-GENERATED by scripts/build_trainer_sprites.py — do not edit by hand.",
        "// Battle (VS) sprite URLs per trainer class, HOTLINKED from the Bulbagarden",
        "// Archives (HGSS art, falling back to the DP sprite HGSS reused). Policeman,",
        "// which has no Gen-4 Bulbapedia sprite, comes from Pokémon Showdown.",
        "export type BattleSprite = { default: string | null } | { male: string | null; female: string | null };",
        "",
        "export const TRAINER_BATTLE_SPRITES: Record<string, BattleSprite> = {",
    ]
    for c in classes:
        e = manifest.get(c, {})
        if "default" in e:
            lines.append(f"  {json.dumps(c, ensure_ascii=False)}: {{ default: {ts_lit(e['default'])} }},")
        else:
            lines.append(
                f"  {json.dumps(c, ensure_ascii=False)}: "
                f"{{ male: {ts_lit(e.get('male'))}, female: {ts_lit(e.get('female'))} }},"
            )
    lines.append("};")
    MANIFEST.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
