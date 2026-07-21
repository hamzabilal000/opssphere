# OpsSphere

Multi-tenant enterprise operations platform - MERN monorepo (React, Express, MongoDB, Node.js,
TypeScript), built as an 18-day teaching/portfolio project. "Multi-tenant" means many companies
("organizations") share one running app and one database, with strict data isolation between them.

See the companion documents for full context:
- `OpsSphere_Build_Guide.pdf` / `OpsSphere_18_Day_Build_Schedule.pdf` - the original SRS and
  day-by-day plan (referenced throughout the code, but not present in this repo - see
  `docs/PROJECT_HANDOFF.md` §1/§6 for what that means and how the later days were reconstructed).
- `docs/learning-notes/` - a plain-language HTML note for every day, explaining what was built and
  why, aimed at someone who knows JavaScript/Express/MongoDB but is newer to TypeScript.
- `docs/PROJECT_HANDOFF.md` - the full technical handoff: conventions, architecture decisions,
  verification methodology, and day-by-day history. Read this first if you're picking up the code.
- `docs/DEPLOYMENT.md` - environment variables, build steps, and a pre-launch checklist for running
  this somewhere other than a local machine.
- `docs/DEMO_SCRIPT.md` - a guided walkthrough hitting one representative feature from each day,
  useful for a live demo or portfolio interview.

## Requirements

- Node.js 20+
- pnpm 9+
- Docker Desktop (for MongoDB, Valkey, Mailpit, MinIO)

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
- Mailpit inbox: http://localhost:8025 (fake SMTP - every email the app sends lands here)
- MinIO console: http://localhost:9001 (login `opssphere` / `opssphere123`)

## What's actually in here

Every organization gets its own members, roles, projects, tasks, tickets, and files - fully isolated
from every other organization in the same database (see `tenant.middleware.ts`'s
`requireOrgMembership`, the single most important file in the project).

- **Auth & sessions** - register/verify/login, short-lived access tokens + rotating 30-day refresh
  tokens with reuse detection, password reset, and an automatic silent-refresh-and-retry on the
  frontend so a 30-day session actually feels like one.
- **Organizations, roles & permissions** - a flat, named-permission system (no hierarchy, editable
  through the app - including system roles' permissions, not just custom ones), departments, teams,
  and invitations that work for both brand-new emails and people who already have an OpsSphere
  account joining a second organization.
- **Projects, tasks & sprints** - a Kanban board with true drag-and-drop reordering (not just
  append-to-end), subtasks, dependencies (with cycle detection), checklists, comments with
  @mentions, real file uploads (MinIO, presigned URLs), and manual time tracking.
- **Support tickets & a risk register** - an org-level helpdesk queue and a project-level risk
  register with a server-computed likelihood x impact score.
- **Real-time** - Socket.IO board updates (everyone looking at the same board sees changes
  instantly) and a live notifications system (mentions, task assignments) with its own per-user
  delivery room, independent of whichever board someone's actually looking at.
- **Hardening** - Valkey-backed rate limiting on every brute-forceable auth route (fails open, never
  locks everyone out if Valkey itself is down), a React error boundary, and basic accessibility
  fixes (keyboard-dismissible modals, aria-labels).
- **Polish** - a Cmd/Ctrl+K command palette for jumping straight to any organization or project.

## Project structure

```
opssphere/
├── apps/
│   ├── web/          React + Vite frontend
│   └── api/           Express API
├── packages/
│   ├── shared-types/   Types shared by web and api (DTOs, response envelopes, PERMISSIONS/
│   │                   SOCKET_EVENTS catalogs)
│   ├── validation/     Shared Zod schemas - the SAME schema validates on frontend and backend
│   ├── eslint-config/  Shared lint rules
│   └── tsconfig/       Shared base tsconfig
├── docker-compose.yml  Local dev infrastructure (MongoDB, Valkey, Mailpit, MinIO)
└── docs/
    ├── learning-notes/     One HTML note per day (01 through 18)
    ├── PROJECT_HANDOFF.md  The full technical handoff - read this first
    ├── DEPLOYMENT.md       Environment variables, build steps, pre-launch checklist
    └── DEMO_SCRIPT.md      A guided walkthrough of the whole app
```

See `apps/api/src/modules/` and `apps/web/src/Pages/` for the actual module-by-module breakdown -
every module follows the same file split (`*.model.ts` / `*.service.ts` / `*.controller.ts` /
`*.routes.ts` on the backend; `lib/api.ts` → `lib/queries.ts` → a Page component on the frontend),
documented in full in `docs/PROJECT_HANDOFF.md` §4.

## Status

**Feature-complete per the reconstructed 18-day plan** (see `docs/PROJECT_HANDOFF.md` §6 for the
full day-by-day history, and its note on why "reconstructed" - the original schedule PDF was never
available while building this). Every day added one real, working feature - never a stub, never
mocked. One enhancement flagged since Day 5 (deny-rules/overrides on top of the flat permission
model) was deliberately scoped out of all 18 days and remains open for anyone continuing past this
point.

Verification throughout has been layered: TypeScript across all 4 packages, a full frontend
production build, and routing/auth-gate smoke tests run in an environment with no real MongoDB
available. Every learning note is explicit about what was actually verified vs. what still needs a
human to click through locally against a real database - see `docs/DEPLOYMENT.md` before running
this anywhere other than a local machine.
