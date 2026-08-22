"""FastAPI app serving the Gen IV Battle Frontier set database."""
from __future__ import annotations

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .search import (
    DEFAULT_TIER4_IV,
    TIER4_IVS,
    facets,
    load_sets,
    search,
    with_computed_stats,
)
from .stats import STAT_KEYS


def _clamp_tier4_iv(value: int) -> int:
    """Snap the requested Tier 4+ IV to the nearest allowed value."""
    return min(TIER4_IVS, key=lambda v: abs(v - value))


# Battle Factory levels: Lv 50 and Open Level (100). Anything else snaps to 50.
LEVELS = [50, 100]


def _clamp_level(value: int) -> int:
    return 100 if value == 100 else 50

app = FastAPI(
    title="Gen 4 Battle Frontier Sets API",
    description="Search the Generation IV Battle Frontier Pokémon sets.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm() -> None:
    load_sets()  # populate the cache and fail fast if the dataset is missing
    facets()


def _parse_stat_filters(request: Request) -> tuple[dict, dict, dict]:
    """Extract per-stat filters from query params.

    Computed-stat range: `<stat>Min` / `<stat>Max`   (e.g. speMin=100)
    EV minimum:          `ev<Stat>Min`                (e.g. evAtkMin=252)
    """
    ev_min: dict[str, int] = {}
    stat_min: dict[str, int] = {}
    stat_max: dict[str, int] = {}
    for key, value in request.query_params.items():
        if not value:
            continue
        try:
            ival = int(value)
        except ValueError:
            continue
        for stat in STAT_KEYS:
            if key == f"{stat}Min":
                stat_min[stat] = ival
            elif key == f"{stat}Max":
                stat_max[stat] = ival
            elif key == f"ev{stat.capitalize()}Min":
                ev_min[stat] = ival
    return ev_min, stat_min, stat_max


@app.get("/api/search")
def api_search(
    request: Request,
    q: str | None = None,
    move: str | None = None,
    item: str | None = None,
    nature: str | None = None,
    ability: str | None = None,
    type: str | None = None,
    tier: str | None = None,
    setIndex: int | None = None,
    tier4Iv: int = Query(DEFAULT_TIER4_IV, ge=0, le=31),
    level: int = Query(50, ge=50, le=100),
    sort: str = "dexNum",
    order: str = Query("asc", pattern="^(asc|desc)$"),
):
    tier4_iv = _clamp_tier4_iv(tier4Iv)
    lvl = _clamp_level(level)
    ev_min, stat_min, stat_max = _parse_stat_filters(request)
    results = search(
        q=q, move=move, item=item, nature=nature, ability=ability, type=type,
        tier=tier, set_index=setIndex, ev_min=ev_min, stat_min=stat_min,
        stat_max=stat_max, tier4_iv=tier4_iv, level=lvl, sort=sort, order=order,
    )
    return {"count": len(results), "tier4Iv": tier4_iv, "tier4Ivs": TIER4_IVS,
            "level": lvl, "results": results}


@app.get("/api/sets")
def api_sets(
    tier4Iv: int = Query(DEFAULT_TIER4_IV, ge=0, le=31),
    level: int = Query(50, ge=50, le=100),
):
    tier4_iv = _clamp_tier4_iv(tier4Iv)
    lvl = _clamp_level(level)
    results = with_computed_stats(load_sets(), tier4_iv, lvl)
    return {"count": len(results), "tier4Iv": tier4_iv, "tier4Ivs": TIER4_IVS,
            "level": lvl, "results": results}


@app.get("/api/facets")
def api_facets():
    return facets()


@app.get("/api/health")
def health():
    return {"status": "ok", "sets": len(load_sets())}
