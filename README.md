# OpsSphere

Multi-tenant enterprise operations platform - MERN monorepo (React, Express, MongoDB, Node.js, TypeScript).

See the companion documents for full context:
- `OpsSphere_Build_Guide.pdf` - modules, architecture, roles, data model
- `OpsSphere_18_Day_Build_Schedule.pdf` - day-by-day build plan
- `docs/learning-notes/` - a plain-language note explaining each piece as it's built

## Requirements

- Node.js 20+
- pnpm 9+
- Docker Desktop (for MongoDB, Redis/Valkey, Mailpit, MinIO)

## Getting started

```bash
# 1. Install dependencies for every workspace
pnpm install

# 2. Start local infrastructure (MongoDB, Valkey, Mailpit, MinIO)
pnpm docker:up

# 3. Copy environment variables
cp .env.example apps/api/.env

# 4. Run the API and the frontend together
pnpm dev
```

- API: http://localhost:4000 (health check at `/api/v1/health/live`)
- Web: http://localhost:5173
- Mailpit inbox: http://localhost:8025
- MinIO console: http://localhost:9001

## Project structure

```
opssphere/
├── apps/
│   ├── web/          React + Vite frontend
│   └── api/           Express API (and, later, background workers)
├── packages/
│   ├── shared-types/   Types shared by web and api (DTOs, response envelopes)
│   ├── validation/     Shared Zod schemas
│   ├── eslint-config/  Shared lint rules
│   └── tsconfig/       Shared base tsconfig
├── docker-compose.yml  Local dev infrastructure
└── docs/learning-notes/ Plain-language notes on what was built and why
```

## Status

Day 1 of 18 - foundation only (monorepo, Docker services, health-checked API,
and a frontend that can talk to it). See `docs/learning-notes/01-project-foundation.html`.
