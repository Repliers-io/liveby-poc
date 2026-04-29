# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (no schema/tables yet)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Map Boundary Explorer (`artifacts/map-explorer`)
- React + Vite full-screen map app
- Uses Mapbox GL JS for rendering
- Layer toggles: Counties (area), Cities, Neighborhoods, Schools
- Calls `/api/locations` backend proxy which forwards to Repliers API
- Requires `MAPBOX_TOKEN` secret (exposed as `VITE_MAPBOX_TOKEN` via vite.config.ts define)

### API Server (`artifacts/api-server`)
- Express 5 backend
- `/api/locations` route: proxies Repliers API with `REPLIERS_API_KEY` secret
- `/api/healthz` health check

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Secrets Required

- `REPLIERS_API_KEY` — Repliers API key for boundary data
- `MAPBOX_TOKEN` — Mapbox public token for map rendering

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
