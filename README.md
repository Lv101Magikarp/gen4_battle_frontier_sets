# Gen 4 Battle Frontier Sets

A webapp to search the **Generation IV (Diamond/Pearl/Platinum + HeartGold/SoulSilver)
Battle Frontier** Pokémon sets — the movesets used by NPC opponents at the Frontier facilities.

- **Backend:** FastAPI (Python) REST API that loads a static JSON dataset into memory.
- **Frontend:** React + Vite + TypeScript SPA with a search bar, rich filters, and animated cards.
- **Data:** scraped once from Bulbapedia and committed as `data/sets.json` (no runtime scraping / DB).

## Features

Search & filter sets by:

- Species / name (search-as-you-type)
- Move
- Held item
- Nature
- Move type
- EV spread
- **Ability** — derived from Pokédex data (the source lists *possible* abilities for the
  species, not the exact one the in-game set uses)
- **Computed final stat** (e.g. Speed > 100) — stats are computed at **Level 50** with a
  user-adjustable **IV** input (default 31). Real Frontier IVs vary by set difficulty, so
  treat these as an approximation.
- **Set index (1–4)** — a species may have 1, 2, or 4 sets; the index is the order the set
  appears in the source table.
- **Battle Factory tier (X → F)** — each set's community quality ranking (Godly X … Atrocious F)
  from a Battle Factory tier-list spreadsheet, plus the Factory round/IV group it belongs to.

## Project layout

```
data/          raw/ (cached wikitext), pokedex.json, sets.json (committed dataset)
scripts/       parse_sets.py, build_pokedex.py, scrape.py
backend/       FastAPI app + tests
frontend/      Vite React + TS app
```

## Setup

### 1. Data (only needed to regenerate `data/sets.json`; it is already committed)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python scripts/build_pokedex.py   # fetches base stats/types/abilities from PokéAPI -> data/pokedex.json
python scripts/build_tiers.py     # fetches the Battle Factory tier-list sheet -> data/tiers.json
python scripts/scrape.py          # fetches Bulbapedia + joins pokedex/tiers -> data/sets.json
```

### 2. Backend

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && uvicorn app.main:app --reload --port 8000
```

API: `http://localhost:8000/api/search`, `/api/sets`, `/api/facets`, docs at `/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api to :8000)
```

## Data source & attribution

Set data is derived from Bulbapedia:
[List of Battle Frontier Pokémon in Generation IV](https://bulbapedia.bulbagarden.net/wiki/List_of_Battle_Frontier_Pok%C3%A9mon_in_Generation_IV/Group_1)
(Groups 1 & 2). Base stats, types, and abilities are from [PokéAPI](https://pokeapi.co/)
(fetched at build time, committed as static JSON). Battle Factory tiers come from a community
tier-list spreadsheet. Content © their respective owners; this project is a fan-made reference
tool.
