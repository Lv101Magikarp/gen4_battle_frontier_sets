#!/usr/bin/env python3
"""Build the trainer OVERWORLD (walking) sprite DB.

Two sources, because no single one is complete:

  1. Bulbagarden per-class articles. Most classes embed a Gen-4 overworld sprite,
     though the file naming is wildly inconsistent ("<C> HGSS OD", "<C> IV OD",
     bare "<C> OD", "<C> m/f ..."). We crawl each class page, keep only Gen-4
     overworld files whose core name matches the class exactly, and hotlink them
     (no bundling) — same approach as the battle sprites.

  2. The Spriters Resource HGSS "Trainers (Overworld)" sheet, for the handful of
     classes Bulbapedia has no Gen-4 overworld for (Bird Keeper, Dragon Tamer,
     PI, Poké Kid). Those cells are listed in SHEET_CELLS, cropped to a
     transparent 32x32 PNG, and bundled under public/sprites/trainers/overworld/.

Output:
  frontend/public/sprites/trainers/overworld/<key>.png   (only sheet-derived crops)
  frontend/src/engine/trainerOverworldSprites.generated.ts (class -> url|path map)

Any class with no sprite from either source is left null; the UI falls back to
the battle sprite.
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
OUT_DIR = ROOT / "frontend" / "public" / "sprites" / "trainers" / "overworld"
MANIFEST = ROOT / "frontend" / "src" / "engine" / "trainerOverworldSprites.generated.ts"
WEB_PREFIX = "sprites/trainers/overworld"

BP = "https://bulbapedia.bulbagarden.net/w/api.php"
AR = "https://archives.bulbagarden.net/w/api.php"
TSR_SHEET = "https://www.spriters-resource.com/media/assets/25/26955.png"
UA = "gen4-frontier-sprite-builder/1.0 (fan project)"

GENDERED = {
    "Ace Trainer", "Cyclist", "Pokéfan", "Pokémon Breeder",
    "Pokémon Ranger", "Psychic", "School Kid", "Tuber",
}

# TSR sheet grid geometry (10x8 blocks of 96x128; down-idle frame at this offset).
SHEET_COLS, SHEET_ROWS = 10, 8
CELL_W, CELL_H = 96, 128
FRAME_OX, FRAME_OY = 61, 32

# Classes Bulbapedia lacks a Gen-4 overworld for -> (col, row) on the TSR sheet.
# key is "<Class>" or "<Class>|male"/"|female". Fill from the contact sheet.
SHEET_CELLS: dict[str, tuple[int, int]] = {
    # e.g. "PI": (4, 7),
}

# Classes that reuse another class's overworld sprite in-game (no unique art).
# Explicit Bulbagarden image URLs, keyed like SHEET_CELLS. Highest priority.
URL_OVERRIDE: dict[str, str] = {
    "Bird Keeper": "https://archives.bulbagarden.net/media/upload/4/47/Ace_Trainer_f_IV_OD.png",
    "Dragon Tamer": "https://archives.bulbagarden.net/media/upload/f/f4/Ace_Trainer_m_IV_OD.png",
    "PI": "https://archives.bulbagarden.net/media/upload/3/31/Rich_Boy_IV_OD.png",
    "Poké Kid": "https://archives.bulbagarden.net/media/upload/8/8c/025OD_DP.png",
}

GEN4 = {"HGSS", "IV", "DPPt", "Pt", "DP"}
NON_G4 = {"I", "II", "III", "RSE", "FRLG", "XY", "ORAS", "SM", "USUM", "BDSP",
          "LGPE", "GO", "V", "VI", "VII", "VIII", "IX", "Masters", "SwSh", "SV", "Beta"}
ERA_RANK = {"HGSS": 0, "IV": 1, "BARE": 2, "DPPt": 3, "Pt": 4, "DP": 5}
GENDER_TOK = {"m": "male", "M": "male", "Male": "male",
              "f": "female", "F": "female", "Female": "female"}


def deacc(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def http_json(url: str) -> dict:
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(1.2)
    return {}


def images_on(page: str) -> list[str]:
    q = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "images",
                                "format": "json", "redirects": 1})
    return http_json(f"{BP}?{q}").get("parse", {}).get("images", [])


def parse_od(name: str):
    """(core, era, gender) for a Gen-4 '...OD.png' file, else None."""
    if not name.endswith("OD.png"):
        return None
    toks = name.replace("_", " ")[:-len(".png")].split(" ")
    if toks[-1] != "OD":
        return None
    toks = toks[:-1]
    era = gender = None
    core = []
    for t in toks:
        if t in GEN4 and era is None:
            era = t
        elif t in NON_G4:
            return None
        elif t in GENDER_TOK and gender is None:
            gender = GENDER_TOK[t]
        else:
            core.append(t)
    return " ".join(core), (era or "BARE"), gender


def pick(imgs: list[str], c: str, g: str | None) -> str | None:
    cc = deacc(c).lower()
    best = None
    for n in imgs:
        p = parse_od(n)
        if not p:
            continue
        core, era, gen = p
        if deacc(core).lower() != cc:
            continue
        if g is None:
            ok = True
        elif g == "male":
            ok = gen in (None, "male")
        else:
            ok = gen == "female"
        if not ok:
            continue
        rank = (ERA_RANK.get(era, 9), 0 if gen == g else 1)
        if best is None or rank < best[0]:
            best = (rank, n)
    return best[1] if best else None


def resolve_urls(files: list[str]) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    files = sorted(set(files))
    for i in range(0, len(files), 40):
        batch = files[i:i + 40]
        q = urllib.parse.urlencode({
            "action": "query", "titles": "|".join("File:" + f for f in batch),
            "prop": "imageinfo", "iiprop": "url", "format": "json",
        })
        data = http_json(f"{AR}?{q}")
        norm = {n["from"]: n["to"] for n in data["query"].get("normalized", [])}
        pages = {p["title"]: (p["imageinfo"][0]["url"].split("?")[0] if p.get("imageinfo") else None)
                 for p in data["query"]["pages"].values()}
        for f in batch:
            out[f] = pages.get(norm.get("File:" + f, "File:" + f))
        time.sleep(0.05)
    return out


def key_for(c: str, g: str | None) -> str:
    base = deacc(c).lower().replace(" ", "")
    return f"{base}-{g[0]}" if g else base


def fetch(url: str) -> bytes | None:
    for _ in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return r.read()
        except Exception:
            time.sleep(2)
    return None


def extract_sheet_cell(sheet: Image.Image, col: int, row: int) -> Image.Image:
    x = col * CELL_W + FRAME_OX
    y = row * CELL_H + FRAME_OY
    crop = sheet.crop((x, y, x + 32, y + 32)).convert("RGBA")
    bg = sheet.convert("RGB").getpixel((col * CELL_W + 2, row * CELL_H + 2))
    px = crop.load()
    for j in range(32):
        for i in range(32):
            r, gg, b, _ = px[i, j]
            if (r, gg, b) == bg:
                px[i, j] = (0, 0, 0, 0)
    return crop


def main() -> int:
    data = json.loads(TRAINERS.read_text())
    classes = sorted({t["class"] for t in data["trainers"]})
    variants = []
    for c in classes:
        variants += [(c, "male"), (c, "female")] if c in GENDERED else [(c, None)]

    # 1) Crawl Bulbapedia for each class.
    chosen: dict[tuple[str, str | None], str] = {}
    page_cache: dict[str, list[str]] = {}
    for c, g in variants:
        imgs = page_cache.get(c) or page_cache.setdefault(c, images_on(f"{c} (Trainer class)"))
        f = pick(imgs, c, g)
        if f:
            chosen[(c, g)] = f
        time.sleep(0.1)
    urls = resolve_urls(list(chosen.values()))

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 2) Sheet crops for the leftovers listed in SHEET_CELLS.
    sheet = None
    if SHEET_CELLS:
        raw = urllib.request.urlopen(urllib.request.Request(
            TSR_SHEET, headers={"User-Agent": UA, "Referer": "https://www.spriters-resource.com/"}),
            timeout=30).read()
        sheet = Image.open(io.BytesIO(raw))

    # Sprites are bundled (downloaded), not hotlinked, so the deployed site is
    # self-contained and we don't hammer Bulbagarden with an image burst per visit.
    file_to_key: dict[str, str] = {}
    manifest: dict[str, dict[str, str | None]] = {}
    report = []
    for c, g in variants:
        slot = "male" if g == "male" else "female" if g == "female" else "default"
        entry = manifest.setdefault(c, {})
        val = None
        src = "MISS"
        cellkey = c if g is None else f"{c}|{g}"
        if cellkey in URL_OVERRIDE:
            raw = fetch(URL_OVERRIDE[cellkey])
            if raw:
                k = key_for(c, g)
                Image.open(io.BytesIO(raw)).convert("RGBA").save(OUT_DIR / f"{k}.png")
                val = f"{WEB_PREFIX}/{k}.png"
                src = "reuse-override"
            else:
                src = "DOWNLOAD-FAILED"
        elif (c, g) in chosen and urls.get(chosen[(c, g)]):
            f = chosen[(c, g)]
            if f in file_to_key:
                val = f"{WEB_PREFIX}/{file_to_key[f]}.png"
                src = "bulba(dup)"
            else:
                raw = fetch(urls[f])
                if raw:
                    k = key_for(c, g)
                    Image.open(io.BytesIO(raw)).convert("RGBA").save(OUT_DIR / f"{k}.png")
                    file_to_key[f] = k
                    val = f"{WEB_PREFIX}/{k}.png"
                    src = "bulba"
                else:
                    src = "DOWNLOAD-FAILED"
        elif cellkey in SHEET_CELLS and sheet is not None:
            col, row = SHEET_CELLS[cellkey]
            img = extract_sheet_cell(sheet, col, row)
            k = key_for(c, g)
            (OUT_DIR / f"{k}.png").write_bytes(_png_bytes(img))
            val = f"{WEB_PREFIX}/{k}.png"
            src = f"sheet({col},{row})"
        entry[slot] = val
        report.append(f"{c:16s}{('/'+g) if g else '':7s} {src}")

    write_manifest(classes, manifest)
    print("\n".join(report))
    have = sum(1 for e in manifest.values() for v in e.values() if v)
    tot = sum(len(e) for e in manifest.values())
    print(f"\nOverworld coverage: {have}/{tot} | manifest -> {MANIFEST.relative_to(ROOT)}")
    return 0


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def ts_lit(v: str | None) -> str:
    return "null" if v is None else json.dumps(v)


def write_manifest(classes, manifest) -> None:
    lines = [
        "// AUTO-GENERATED by scripts/build_trainer_overworld.py — do not edit by hand.",
        "// Overworld (walking) sprite path per trainer class, bundled under public/.",
        "// Sourced from the Bulbagarden Archives (Gen-4 art) and, for the few classes it",
        "// lacks, the Spriters Resource HGSS overworld sheet. Null -> UI uses battle sprite.",
        "export type OverworldSprite = { default: string | null } | { male: string | null; female: string | null };",
        "",
        "export const TRAINER_OVERWORLD_SPRITES: Record<string, OverworldSprite> = {",
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
