# Gen 4 Battle Frontier Sets

A vibecoded webapp to search the **Generation IV (Diamond/Pearl/Platinum + HeartGold/SoulSilver)
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
- **Computed final stat** (e.g. Speed > 100) — stats are computed at **Level 50** using the
  IV fixed by each set's tier (Tier 1/2/3 = 0/4/8 IVs). Tier 4+ sets are used across rounds 8+
  with 12/16/20/24/31 IVs; a selector picks which to preview (default 31).
- **Set index (1–4)** — a species may have 1, 2, or 4 sets; the index is the order the set
  appears in the source table.
- **Magpie rating (X → F)** — each set's community quality ranking (Godly X … Atrocious F) from a
  Battle Factory tier-list spreadsheet, plus the round/IV tier it belongs to.

Other UX:

- **Pin sets** — click any card to pin it; pinned sets stay in a tray at the top across every
  search and persist between visits (stored in `localStorage`).
- **Infinite scroll** — results (and their sprites) load in batches as you scroll.

## Project layout

```
data/          raw/ (cached sources), pokedex.json, tiers.json, sets.json, trainers.json (committed datasets)
scripts/       parse_sets.py, build_pokedex.py, build_tiers.py, scrape.py, build_trainers.py
backend/       FastAPI app + tests
frontend/      Vite React + TS app
  src/engine/  client-side stats + search (static mode)
  src/dataClient.ts   API vs static data-source switch
.github/workflows/deploy-pages.yml   GitHub Pages deploy
```

## Setup

### 1. Data (only needed to regenerate `data/sets.json`; it is already committed)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python scripts/build_pokedex.py   # fetches base stats/types/abilities from PokéAPI -> data/pokedex.json
python scripts/build_tiers.py     # fetches the Battle Factory tier-list sheet -> data/tiers.json
python scripts/scrape.py          # fetches Bulbapedia + joins pokedex/tiers -> data/sets.json
python scripts/build_trainers.py  # fetches Bulbapedia trainer roster -> data/trainers.json
```

The **Trainers** view (opponent database) is powered by `data/trainers.json`: 300 Battle
Frontier trainers with their per-round appearances, index-derived Battle Factory IV, and
Pokémon roster (deduplicated set table). It renders entirely client-side.

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

## Static build (GitHub Pages) — no backend required

The frontend can run entirely in the browser: it loads `data/sets.json` and runs the same
filter/sort/stat logic client-side (`src/engine/`). The FastAPI backend stays for local dev, but
the hosted site is pure static files. The data source is selected at build time:

- `npm run dev` / `npm run build` → **API mode** (talks to FastAPI at `/api`).
- `npm run build:static` → **static mode** (bundles `sets.json`, runs the engine in-browser).

Local preview of the static build:

```bash
cd frontend
VITE_BASE=/ npm run build:static
npm run preview      # serves dist/ (server-less)
```

### Deploying to GitHub Pages

1. Push this repo to GitHub with the default branch `main`.
2. In **Settings → Pages**, set **Source = GitHub Actions**.
3. The workflow at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
   runs on every push to `main`: it installs deps, runs `npm run build:static`, and publishes
   `frontend/dist`. It sets `VITE_BASE=/<repo-name>/` automatically so asset/dataset URLs
   resolve under `https://<user>.github.io/<repo>/`.
4. No Python runs in CI — the committed `data/sets.json` is copied into the build.

> For a **user/organization site** (`<user>.github.io`) or a **custom domain**, the site is at
> the root, so set `VITE_BASE=/` (edit the workflow's `env`).

## Data source & attribution

Set data is derived from Bulbapedia:
[List of Battle Frontier Pokémon in Generation IV](https://bulbapedia.bulbagarden.net/wiki/List_of_Battle_Frontier_Pok%C3%A9mon_in_Generation_IV/Group_1)
(Groups 1 & 2). Base stats, types, and abilities are from [PokéAPI](https://pokeapi.co/)
(fetched at build time, committed as static JSON). Battle Factory tiers come from a community
tier-list spreadsheet. Content © their respective owners; this project is a fan-made reference
tool.
