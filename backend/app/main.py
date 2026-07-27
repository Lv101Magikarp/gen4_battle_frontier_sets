"""FastAPI app serving the Gen IV Battle Frontier set database."""
from __future__ import annotations

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .search import facets, load_sets, search, with_computed_stats
from .stats import STAT_KEYS

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
    iv: int = Query(31, ge=0, le=31),
    sort: str = "dexNum",
    order: str = Query("asc", pattern="^(asc|desc)$"),
):
    ev_min, stat_min, stat_max = _parse_stat_filters(request)
    results = search(
        q=q, move=move, item=item, nature=nature, ability=ability, type=type,
        tier=tier, set_index=setIndex, ev_min=ev_min, stat_min=stat_min,
        stat_max=stat_max, iv=iv, sort=sort, order=order,
    )
    return {"count": len(results), "iv": iv, "results": results}


@app.get("/api/sets")
def api_sets(iv: int = Query(31, ge=0, le=31)):
    results = with_computed_stats(load_sets(), iv)
    return {"count": len(results), "iv": iv, "results": results}


@app.get("/api/facets")
def api_facets():
    return facets()


@app.get("/api/health")
def health():
    return {"status": "ok", "sets": len(load_sets())}
