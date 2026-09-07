#!/usr/bin/env python3
"""Build the self-hosted trainer BATTLE (VS) sprite DB.

For every trainer class in data/trainers.json we download the game-accurate
HeartGold/SoulSilver battle sprite from the Bulbagarden Archives — preferring the
HGSS art and falling back to the Diamond/Pearl sprite HGSS reused for most classes.
The one class Bulbapedia has no Gen-4 sprite for (Policeman) is pulled from Pokémon
Showdown's Gen-4 set instead.

Sprites are BUNDLED (not hotlinked): downloading them makes the deployed site
self-contained and avoids Bulbagarden throttling image bursts on every visit.

Outputs:
  frontend/public/sprites/trainers/battle/<key>.png     (the images)
  frontend/src/engine/trainerBattleSprites.generated.ts  (class -> path map)

Re-run to refresh. Requires network access.
"""
from __future__ import annotations
import io
import json
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TRAINERS = ROOT / "data" / "trainers.json"
OUT_DIR = ROOT / "frontend" / "public" / "sprites" / "trainers" / "battle"
MANIFEST = ROOT / "frontend" / "src" / "engine" / "trainerBattleSprites.generated.ts"
WEB_PREFIX = "sprites/trainers/battle"

API = "https://archives.bulbagarden.net/w/api.php"
SHOWDOWN = "https://play.pokemonshowdown.com/sprites/trainers/"
UA = "gen4-frontier-sprite-builder/1.0 (fan project)"

GENDERED = {
    "Ace Trainer", "Cyclist", "Pokéfan", "Pokémon Breeder",
    "Pokémon Ranger", "Psychic", "School Kid", "Tuber",
}
# Classes Bulbapedia has no Gen-4 sprite for -> Showdown slug.
SHOWDOWN_OVERRIDE = {("Policeman", None): "policeman-gen4"}


def deacc(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def key_for(c: str, g: str | None) -> str:
    base = deacc(c).lower().replace(" ", "")
    return f"{base}-{g[0]}" if g else base


def http_json(url: str) -> dict:
    for _ in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(1.2)
    return {}


def resolve_bulba(titles: list[str]) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        q = urllib.parse.urlencode({
            "action": "query", "titles": "|".join(batch),
            "prop": "imageinfo", "iiprop": "url", "format": "json",
        })
        data = http_json(f"{API}?{q}")
        norm = {n["from"]: n["to"] for n in data.get("query", {}).get("normalized", [])}
        pages = {p["title"]: (p["imageinfo"][0]["url"] if p.get("imageinfo") else None)
                 for p in data.get("query", {}).get("pages", {}).values()}
        for t in batch:
            out[t] = pages.get(norm.get(t, t))
        time.sleep(0.05)
    return out


def bulba_candidates(c: str, g: str | None) -> list[str]:
    if g is None:
        return [f"File:Spr HGSS {c}.png", f"File:Spr DP {c}.png"]
    suf = " M" if g == "male" else " F"
    if g == "male":
        return [f"File:Spr HGSS {c}{suf}.png", f"File:Spr HGSS {c}.png",
                f"File:Spr DP {c}{suf}.png", f"File:Spr DP {c}.png"]
    return [f"File:Spr HGSS {c}{suf}.png", f"File:Spr DP {c}{suf}.png",
            f"File:Spr HGSS {c}.png", f"File:Spr DP {c}.png"]


def fetch(url: str) -> bytes | None:
    for _ in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return r.read()
        except Exception:
            time.sleep(2)
    return None


def main() -> int:
    data = json.loads(TRAINERS.read_text())
    classes = sorted({t["class"] for t in data["trainers"]})
    variants = []
    for c in classes:
        variants += [(c, "male"), (c, "female")] if c in GENDERED else [(c, None)]

    all_titles, cand_map = [], {}
    for c, g in variants:
        if (c, g) in SHOWDOWN_OVERRIDE:
            continue
        cand_map[(c, g)] = bulba_candidates(c, g)
        all_titles += cand_map[(c, g)]
    resolved = resolve_bulba(sorted(set(all_titles)))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    url_to_key: dict[str, str] = {}
    manifest: dict[str, dict[str, str | None]] = {}
    report = []
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
        entry = manifest.setdefault(c, {})
        if not url:
            entry[slot] = None
            report.append(f"{c:16s}{('/'+g) if g else '':7s} {src}")
            continue
        if url in url_to_key:
            entry[slot] = f"{WEB_PREFIX}/{url_to_key[url]}.png"
            continue
        key = key_for(c, g)
        raw = fetch(url)
        if not raw:
            entry[slot] = None
            report.append(f"{c:16s}{('/'+g) if g else '':7s} DOWNLOAD-FAILED")
            continue
        Image.open(io.BytesIO(raw)).convert("RGBA").save(OUT_DIR / f"{key}.png")
        url_to_key[url] = key
        entry[slot] = f"{WEB_PREFIX}/{key}.png"
        report.append(f"{c:16s}{('/'+g) if g else '':7s} {src:8s} {key}.png")

    write_manifest(classes, manifest)
    print("\n".join(report))
    miss = [c for c, e in manifest.items() if all(v is None for v in e.values())]
    print(f"\nBundled into {OUT_DIR.relative_to(ROOT)} | classes with no sprite: {miss or 'none'}")
    return 0


def ts_lit(v: str | None) -> str:
    return "null" if v is None else json.dumps(v)


def write_manifest(classes, manifest) -> None:
    lines = [
        "// AUTO-GENERATED by scripts/build_trainer_sprites.py — do not edit by hand.",
        "// Battle (VS) sprite paths per trainer class, bundled under public/. Sourced",
        "// from the Bulbagarden Archives (HGSS art, falling back to the DP sprite HGSS",
        "// reused); Policeman from Pokémon Showdown.",
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
    raise SystemExit(main())
