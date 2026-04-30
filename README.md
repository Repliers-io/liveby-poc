# LiveBy POC — Map Boundary Explorer

**Live demo:** https://58374f10-579b-4ccb-9c8e-df48914c032d-00-xcaipo3y8g91.kirk.replit.dev/

A full-screen, interactive map application for exploring real estate boundaries and listings, built on the [Repliers API](https://repliers.com) and [LiveBy](https://liveby.com) location data.

---

## Features

- **Boundary layers** — Toggle between Counties, Cities, Neighborhoods, Postal Codes, School Districts, and Schools
- **Click to isolate** — Click any boundary to zoom in, highlight it, and open a details drawer
- **Demographics drawer** — Population, income, age, and household breakdowns per boundary
- **School details drawer** — School info including state rank and star rating
- **Market Statistics tab** — Active listing counts, median price, days on market, and price trends per boundary
- **Listing markers** — Up to 300 listings plotted as animated bloom dots filtered to the selected boundary
- **Listing filters** — Filter by property type, beds, baths, and price range
- **Listing detail drawer** — Full property details with photo carousel, location mini-maps, and clickable location cards that navigate to that boundary on the map
- **Viewport-bound filtering** — Boundaries and listings update as you pan and zoom

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Frontend | React + Vite + TypeScript |
| Map | MapLibre GL JS (CARTO dark matter style) |
| Charts | Recharts |
| Data fetching | TanStack Query v5 |
| Backend | Express 5 + TypeScript |
| API contract | OpenAPI 3 → Orval codegen (Zod + React Query hooks) |
| Validation | Zod |
| Build | esbuild |

---

## Project Structure

```
.
├── artifacts/
│   ├── map-explorer/       # React + Vite frontend
│   └── api-server/         # Express API proxy
├── lib/
│   └── api-spec/           # OpenAPI spec + Orval codegen
└── scripts/                # Shared utility scripts
```

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+

### Secrets

Create the following environment secrets before running:

| Secret | Description |
|---|---|
| `REPLIERS_API_KEY` | Repliers API key for boundary and listing data |
| `MAPBOX_TOKEN` | Mapbox public token for map tile rendering |
| `SESSION_SECRET` | A long, random string used to sign session cookies (e.g. generate one with `openssl rand -hex 32`) |

### Install

```bash
pnpm install
```

### Run

Start both the API server and frontend in separate terminals:

```bash
# API server
pnpm --filter @workspace/api-server run dev

# Frontend
pnpm --filter @workspace/map-explorer run dev
```

---

## API Routes

| Route | Description |
|---|---|
| `GET /api/locations` | Boundary polygons for a given lat/lng and type |
| `GET /api/listings` | Listings within a boundary |
| `GET /api/listing/:mlsNumber` | Single listing detail with location boundaries |
| `GET /api/statistics` | Market statistics for a boundary |
| `GET /api/healthz` | Health check |

---

## Codegen

The API contract is defined in `lib/api-spec/openapi.yaml`. After modifying it, regenerate the React Query hooks and Zod schemas:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Typecheck

```bash
pnpm run typecheck
```
