"""Pydantic response schemas (used for OpenAPI docs / validation)."""
from __future__ import annotations

from pydantic import BaseModel


class Move(BaseModel):
    name: str
    type: str


class Stats(BaseModel):
    hp: int
    atk: int
    def_: int
    spa: int
    spd: int
    spe: int


class SetOut(BaseModel):
    id: str
    dexNum: int
    species: str
    setIndex: int
    setCount: int
    item: str
    nature: str
    moves: list[Move]
    evs: dict[str, int]
    types: list[str]
    abilities: list[str]
    baseStats: dict[str, int]
    stats: dict[str, int]
    tier: str | None = None
    tierRank: int | None = None
    tierGroup: str | None = None
    tierIv: int | None = None


class SearchResponse(BaseModel):
    count: int
    iv: int
    results: list[SetOut]


class Facets(BaseModel):
    items: list[str]
    natures: list[str]
    abilities: list[str]
    types: list[str]
    moves: list[str]
    setIndexes: list[int]
    tiers: list[str]
    stats: list[str]
    total: int
