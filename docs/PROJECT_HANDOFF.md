# OpsSphere — Project Handoff / Context Brief

**Purpose of this document:** hand a new AI assistant everything it needs to keep building this
project without re-deriving context from scratch. Read this whole file before touching any code.

---

## 1. What OpsSphere is

OpsSphere is a **multi-tenant enterprise operations platform** — a MERN-stack monorepo (MongoDB,
Express, React, Node.js, all in TypeScript) being built as an 18-day teaching/portfolio project.
"Multi-tenant" means many companies ("organizations") share one running app and one database, with
strict data isolation between them — that isolation rule, established Day 4, underpins everything
built afterward.

The project is being built **one day at a time**, following a fixed daily rhythm (see §5). Each
day adds one real, working module — never a stub, never mocked. Every day also produces a
plain-language HTML "learning note" in `docs/learning-notes/` explaining what was built and why,
aimed at a developer who knows JavaScript/Express/MongoDB but is newer to TypeScript.

**Two source documents drive the whole plan** (referenced everywhere in code comments, but **NOT
currently present in the repo** — see §7 for what this means for you):
- `OpsSphere_Build_Guide.pdf` — the SRS: modules, architecture, roles, data model.
- `OpsSphere_18_Day_Build_Schedule.pdf` — the day-by-day build plan.

If you don't have these PDFs, §6 of this document reconstructs everything currently knowable about
Days 13-18 from forward-looking hints already embedded in code comments and learning notes — treat
that reconstruction as a best-effort placeholder, not a confirmed spec, and say so if you use it.

---

## 2. Tech stack

- **Monorepo**: pnpm workspaces. Packages: `apps/api`, `apps/web`, `packages/shared-types`,
  `packages/validation`, `packages/eslint-config`, `packages/tsconfig`.
- **Backend**: Express 5, Mongoose 8, TypeScript strict mode + `noUncheckedIndexedAccess`, Zod for
  validation, `bcryptjs` for password hashing, `jsonwebtoken` for JWTs, `nodemailer` (→ Mailpit
  locally) for email, `pino`/`pino-http` for logging, `helmet` + `cors` + `cookie-parser`,
  **`socket.io` + `cookie` (Day 9, real-time)**, **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-
  presigner` + `multer` (Day 12, real file storage — see lib/storage.ts)**.
- **Frontend**: React + Vite, React Router v6 (nested routes), TanStack Query (server state),
  Zustand (local UI state, persisted to localStorage), Tailwind CSS, `lucide-react` icons, hand-
  built shadcn/ui-style components (the real shadcn CLI can't run in this environment),
  **`socket.io-client` (Day 9)**.
- **Infrastructure** (`docker-compose.yml`): MongoDB, Valkey/Redis, Mailpit (fake SMTP inbox, UI at
  `localhost:8025`), MinIO (S3-compatible object storage, console UI at `localhost:9001`, login
  `opssphere`/`opssphere123`). **Valkey is STILL provisioned but UNUSED by any code** — Day 9 could
  have used it for cross-instance Socket.IO pub/sub but didn't need to (a single server instance's
  built-in in-memory adapter is enough for now; wiring up the Redis/Valkey adapter is a reasonable
  upgrade if this ever runs on more than one server instance at once). **MinIO went from provisioned-
  but-unused to actually wired up on Day 12** (see §6) — its five env vars (`MINIO_ENDPOINT`,
  `MINIO_PORT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) had existed in `.env`/
  `.env.example` since Day 1 but were silently ignored by `config/env.ts`'s Zod schema until Day 12
  actually added them to it — worth remembering if you ever wonder why an env var in `.env` doesn't
  seem to be doing anything: check whether `env.ts`'s schema actually asks for it.
- **Ports**: API `localhost:4000` (health check `/api/v1/health/live`), Web `localhost:5173`.

---

## 3. Repository structure (as of Day 12)

```
OpsSphere/
├── apps/
│   ├── api/                        Express backend
│   │   └── src/
│   │       ├── config/env.ts        Zod-validated environment config, fails fast on boot
│   │       ├── lib/                 db.ts, logger.ts, password.ts, mailer.ts,
│   │       │                        socket.ts (Day 9 — Socket.IO server, auth, rooms),
│   │       │                        storage.ts (Day 12 — MinIO client, signed URLs)
│   │       ├── middleware/errorHandler.ts   ApiError class, errorHandler, notFoundHandler
│   │       ├── modules/
│   │       │   ├── auth/            user, session, invitation models + auth service/controller/routes
│   │       │   ├── organizations/   organization, membership, role, department, team models +
│   │       │   │                    tenant.middleware.ts (requireOrgMembership, requirePermission)
│   │       │   ├── projects/        project, project-member, milestone models + service/controller/routes
│   │       │   ├── tasks/           sprint, task, task-comment, task-attachment, time-entry models +
│   │       │   │                    service/controller/routes  (Day 8, extended Day 9 with comment
│   │       │   │                    edit/delete, @mentions, and socket event emission; extended Day
│   │       │   │                    11 with dependsOnTaskIds + embedded checklistItems on Task;
│   │       │   │                    extended Day 12 — TaskAttachment now supports real uploads too)
│   │       │   ├── tickets/         ticket, ticket-comment models + service/controller/routes
│   │       │   │                    (Day 10, ORG-level, not under a project)
│   │       │   ├── risks/           risk model + service/controller/routes (Day 11 -
│   │       │   │                    PROJECT-level, unlike tickets - see risk.model.ts)
│   │       │   └── health/          health.routes.ts
│   │       ├── app.ts                createApp() — assembles Express app, mounts every router
│   │       │                          (deliberately does NOT touch Socket.IO — see index.ts)
│   │       └── index.ts              connects to Mongo, builds a raw http.Server, attaches
│   │                                  Socket.IO to it (Day 9), THEN starts listening
│   └── web/                        React + Vite frontend
│       └── src/
│           ├── components/
│           │   ├── ui/               Button, Card, Input, States (Loading/Empty/Error), Toast
│           │   ├── shell/            ProtectedRoute, AppShell, Sidebar, Topbar
│           │   └── tasks/            TaskDetailModal (Day 8, extended Day 9 with comment edit/
│           │                         delete + mention highlighting; extended Day 11 with
│           │                         Dependencies + Checklist sections; extended Day 12 with a
│           │                         real file-upload control alongside the link-attachment form)
│           ├── Pages/                One file per route (RegisterPage, LoginPage, OverviewPage,
│           │                         OrganizationDetailPage, ProjectsListPage, ProjectDetailPage,
│           │                         TaskBoardPage, TicketsListPage, TicketDetailPage,
│           │                         RiskRegisterPage (Day 11), SessionsPage, ProfilePage, ...)
│           ├── lib/api.ts            Every fetch call to the backend, thin wrapper + typed functions
│           ├── lib/queries.ts        Every useQuery/useMutation hook, built on lib/api.ts
│           ├── lib/socket.ts         Day 9 — useProjectSocket() hook, one shared client connection
│           ├── store/activeOrgStore.ts   Zustand — "which organization is currently selected"
│           └── App.tsx               ONLY routes — no logic lives here, ever
├── packages/
│   ├── shared-types/src/index.ts    Every DTO/response shape + PERMISSIONS catalog + SOCKET_EVENTS
│   │                                 catalog (Day 9) — single source of truth both apps import from
│   ├── validation/src/index.ts      Every Zod schema — same schema validates on frontend AND backend
│   ├── eslint-config/                Shared lint rules
│   └── tsconfig/                     Shared base tsconfig
├── docs/
│   ├── learning-notes/               01 through 12 (HTML, styled, one per completed day)
│   └── PROJECT_HANDOFF.md            This file — keep it updated after every day (see §9)
├── docker-compose.yml               MongoDB, Valkey, Mailpit, MinIO
└── README.md                        Currently STALE — still says "Day 1 of 18", update this
                                      when you pick the project back up
```

---

## 4. Established conventions — READ THIS BEFORE WRITING ANY CODE

These patterns are consistent across every single day so far. Breaking them without a reason will
make the codebase feel inconsistent and will likely surprise whoever reads it next.

**Backend, every module follows this exact file split:**
- `*.model.ts` — Mongoose schema + `HydratedDocument` type, nothing else.
- `*.service.ts` — plain async functions, `(organizationId, ...ids, input) => plainObject`. No
  Express types anywhere in this file. Throws `ApiError` (from `middleware/errorHandler.ts`) for
  every expected failure (404 not found, 400 validation, 403 forbidden, 409 conflict). Every
  function that touches an existing record starts with a `findXOrThrow(organizationId, ...)`
  helper that filters by `organizationId` (never trusts `_id` alone) — this is THE core tenant-
  isolation pattern, established Day 4, repeated in every module since.
- `*.controller.ts` — 3-step shape only: `schema.safeParse(req.body)` → throw `ApiError(400, ...)`
  with `fieldErrorsFrom(parsed.error)` on failure → call the service → wrap the result in
  `{ success: true, data: {...} }` and respond. A local `fieldErrorsFrom` helper is copy-pasted
  into each controller file (small enough not to bother sharing).
- `*.routes.ts` — wires URLs to controller functions. Every organization-scoped route chains
  `requireAuth` → `requireOrgMembership` → (for writes) `requirePermission(PERMISSIONS.X)`. Reads
  generally skip the permission check (membership alone is enough to read). **Order of middleware
  matters and is never shuffled** — each one depends on `req` fields the previous one set.
- New feature routers are mounted in `app.ts` at whatever base path makes sense, following the
  pattern of the existing `organizationRouter` / `projectRouter` / `taskRouter` — multiple routers
  can share the same base path prefix as long as their specific paths don't collide.

**The permission system (Day 5 onward):**
- `PERMISSIONS` is a single `as const` object in `packages/shared-types/src/index.ts` — string
  values like `"org.manage"`, `"project.create"`, `"task.manage"`. Add new permissions there,
  following the `"module.action"` naming pattern.
- A Role is just `{ name, permissions: Permission[] }`. No hierarchy, no deny-rules, no
  inheritance — flat allow-list only, by design (see Day 5 note).
- `requirePermission(permission)` in `tenant.middleware.ts` checks `req.membershipPermissions`
  (set by `requireOrgMembership`) and throws a clean 403 if missing.
- **Every new permission string added must also get a label added to `PERMISSION_LABELS` in
  `apps/web/src/Pages/OrganizationDetailPage.tsx`** — this is a `Record<Permission, string>`, so
  TypeScript will refuse to compile if you forget (this exact mistake happened on Day 8 and was
  caught by `tsc`).

**Multi-tenancy / ownership rules:**
- NEVER trust an id from `req.params` directly for anything security-relevant — always re-derive
  `organizationId` from `req.organizationId` (set by `requireOrgMembership` after a real DB check),
  and always filter queries by it.
- "Referential integrity" pattern: deleting something that's still referenced elsewhere is BLOCKED
  with a 409, not cascaded. (Example: can't delete a Sprint while Tasks still point at it; can't
  delete a Task while it still has subtasks.)
- "Ownership-or-permission" pattern: some writes (task attachment/time-entry/comment
  edit-or-delete since Day 9; ticket edit and ticket status-change since Day 10) are allowed for
  whoever created the record, OR anyone holding the relevant `*.manage`/`*.assign` permission —
  checked in the service layer, not via `requirePermission` at the route level, since it's not a
  flat permission check. **"Ownership" can mean different things on the same model** — Day 10's
  Ticket is the first example: editing details = you're the ticket's CREATOR; changing status =
  you're the ticket's current ASSIGNEE. Don't assume ownership always means "whoever created it."
- **Org-level vs. project-level modules**: most modules so far nest under a project
  (`projectId` on Task/Sprint). Day 10's Ticket deliberately does NOT — it only has an
  `organizationId`, mounted at the same route depth as `organizationRouter` itself, not under
  `project.routes.ts`. Day 11's Risk went back to PROJECT-level (like Task/Sprint) — the rule of
  thumb: whole-company concern → org-level; belongs to one project's plan → project-level.
- **Small embedded sub-lists live directly on their parent document, not as a new top-level
  model** (Day 11's `Task.checklistItems`, a Mongoose subdocument array): reach for this when the
  child only ever makes sense attached to one parent, is small, and doesn't need its own
  permission model — same "keep it embedded" instinct as Day 8's `position` field. If a child
  needs its own permission rules, ownership, or is queried independently of its parent, it should
  still be a real top-level model (e.g. TaskComment) instead.
- **Cycle detection**: Day 11's task dependencies (`dependsOnTaskIds`) introduced the first real
  graph-walk in the codebase — `assertNoDependencyCycle` in `task.service.ts` walks forward
  through the dependency graph before saving, rejecting anything that would let a task depend on
  itself indirectly. If a future day adds another self-referential "this points at another one of
  its own kind" relationship, this is the pattern to reuse (BFS with a `visited` set, checked
  BEFORE the write, not after).

**File storage (Day 12 onward):**
- `apps/api/src/lib/storage.ts` holds the ONE MinIO/S3-compatible client instance — same "one shared
  instance, imported where needed" idea as `lib/logger.ts`'s `logger` and `lib/socket.ts`'s `io`.
  Other files never build their own client — they call the exported helpers
  (`uploadFileToStorage`/`deleteFileFromStorage`/`getSignedDownloadUrl`).
- **Files are never streamed through our own Express server on the way OUT.** A short-lived (15
  minute) presigned URL is generated fresh every time an uploaded file is listed, and the browser
  downloads directly from MinIO. If a future day adds another kind of file (avatars, org logos,
  ...), reuse this same presigned-URL pattern rather than building a `GET .../raw` streaming route.
- **Match a startup check's failure severity to its actual blast radius.** `config/env.ts` crashes
  the whole server (`process.exit(1)`) if auth secrets are missing, because NOTHING works without
  them. `lib/storage.ts`'s `ensureBucketExists()` deliberately does NOT crash the server if MinIO is
  unreachable — it logs a warning and lets everything else keep working, since file uploads are one
  feature among many. Don't reflexively copy the "fail fast and hard" pattern for every new
  integration; ask what actually breaks if this one thing is down.
- **A schema without `.strict()` silently ignores env vars it doesn't ask for.** `.env`/
  `.env.example` had MinIO's 5 env vars sitting in them since Day 1, doing NOTHING, because
  `config/env.ts`'s Zod schema never listed them — a real, live example of this gotcha, not a
  hypothetical one. If an env var seems to have no effect, check whether `env.ts` actually validates
  it before assuming the value itself is wrong.

**Real-time (Day 9 onward):**
- `apps/api/src/lib/socket.ts` holds the ONE Socket.IO server instance (module-level variable,
  same "one shared instance, imported where needed" idea as `lib/logger.ts`'s `logger`). Other
  files never touch `io` directly — they call the exported `emitToProject(projectId, event,
  payload)` helper, which is a safe no-op if sockets were never initialized (true for every
  smoke-test script, which only calls `createApp()`).
- Socket auth reuses the EXACT SAME access token cookie `requireAuth` checks — verified in an
  `io.use(...)` middleware (Socket.IO's equivalent of Express middleware) during the handshake,
  before a connection is even accepted. There is no separate "socket login."
- A socket doesn't automatically receive anything — it has to explicitly `join-project` a room
  (`project:<projectId>`), and that handler RE-CHECKS a real Membership row before letting the join
  succeed (same Day-4 "never trust an id, re-check it against a real record" golden rule, applied
  to socket rooms instead of HTTP routes).
- Controllers emit AFTER the database write succeeds, never before — a broadcast should never
  announce something that didn't actually happen. Event NAME strings live in `SOCKET_EVENTS`
  (shared-types), same "one canonical list" idea as `PERMISSIONS`.
- On the frontend, `lib/socket.ts`'s `useProjectSocket(organizationId, projectId, handlers)` hook
  is how a page listens. Handlers should almost always just call
  `queryClient.invalidateQueries({ queryKey: [...] })` on the SAME key the relevant `useQuery` hook
  already uses — reusing TanStack Query's existing fetch/cache/render pipeline instead of building
  a separate "apply this pushed data directly" code path.

**Frontend conventions:**
- `App.tsx` contains ONLY `<Routes>`/`<Route>` — no logic, ever. Nested route groups:
  `ProtectedRoute` (login check) wraps `AppShell` (sidebar+topbar) wraps individual pages.
- All server data fetching goes through `lib/api.ts` (typed fetch functions, reusing
  `CreateXInput`/`UpdateXInput` types from `@opssphere/validation`) → `lib/queries.ts`
  (`useQuery`/`useMutation` hooks, one per operation, mutations call `queryClient.invalidateQueries`
  on success). Pages call the hooks, never `lib/api.ts` directly.
- Query keys are arrays that mirror the URL structure:
  `["organizations", orgId, "projects", projectId, "tasks", taskId, "comments"]`.
- Shared UI: `Card`, `Button` (variants: primary/secondary/danger/ghost), `Input`,
  `LoadingState`/`EmptyState`/`ErrorState`, `useToast()`. Reuse these, don't reinvent styling.
- **`canManage` frontend heuristic**: pages check `organization.myRole !== "Member"` to decide
  whether to show admin-ish buttons/forms at all. This is explicitly documented everywhere as a
  **UX nicety, not real security** — the backend's `requirePermission` is what actually enforces
  access. A user who submits a hidden form anyway just gets a clean 403 back.

**TypeScript / types:**
- `packages/shared-types` holds every DTO shape (`XSummary` interfaces) — both apps import from
  it, so a renamed field breaks compilation everywhere it's used, immediately.
- `packages/validation` holds every Zod schema, and exports `z.infer<>` types (`CreateXInput`,
  `UpdateXInput`) — these are what both the API controller AND the frontend mutation hooks use, so
  frontend and backend can never quietly disagree about what a valid request body looks like.
- **Zod fields with `.default(...)` are still REQUIRED in the inferred TypeScript type** (the
  default only applies during actual `.parse()`/`.safeParse()` at runtime) — every frontend call
  site must pass the field explicitly (e.g. `description: ""`), even though it becomes optional
  effectively once parsed server-side. This tripped up Day 8's first draft and was caught by `tsc`.

**Code comments:** every file has long, plain-English comments aimed at someone who knows
JavaScript/Express/MongoDB but is newer to TypeScript — explaining both WHAT the code does and any
new TypeScript syntax the moment it first appears. This is a deliberate teaching-project style
choice, not incidental — keep it up.

---

## 5. The daily build rhythm — follow this exact loop for every new day

1. **Extract the spec** for that day from the SRS/schedule (or, if those PDFs are missing, from
   whatever forward-looking hints already exist in code comments — see §6 — and make a reasonable,
   clearly-labeled judgment call).
2. **Design first**: what new Mongoose models are needed, what new permissions (if any), what new
   Zod schemas, what the referential-integrity / ownership rules should be. Add new permission
   strings to `PERMISSIONS` in shared-types, new types/DTOs to shared-types, new schemas to
   `packages/validation`.
3. **Backend**: models → service → controller → routes → mount the new router in `app.ts`.
4. **Frontend**: `lib/api.ts` functions → `lib/queries.ts` hooks → new Page/component(s) → wire
   into `App.tsx` and any relevant nav link.
5. **Verify** (see §7 for exact methodology) — typecheck all 4 packages, production build the
   frontend, run an auth-gate smoke test against the new routes. Be honest in the write-up about
   what's actually been verified vs. what still needs a human to test locally against a real
   database.
6. **Write the learning note**: `docs/learning-notes/0N-topic-name.html`, copying the exact HTML
   template/CSS from the previous day's note (navy/teal color scheme, `.hero`, `.callout`, `.step`,
   table-based verification summary). Structure: one-paragraph summary → 2-4 new concepts explained
   simply → step-by-step walkthrough → new files in one picture → one "design detail worth
   understanding" callout → what was deliberately left simple → how to try it yourself → what was
   actually verified (table) → what's next.
7. **Git**: only commit/push yourself if the user explicitly asks for it in that message. Otherwise
   just report what changed and hand the user the exact `git add -A && git commit -m "..." && git
   push` commands to run themselves. Do not assume — check the literal wording of the request each
   time.

---

## 6. Day-by-day status

### ✅ Day 1 — Project Foundation
Monorepo scaffold only — no real feature yet. pnpm workspaces set up, Docker Compose (Mongo,
Valkey, Mailpit, MinIO), Express app skeleton with `env.ts` (Zod-validated config, fails fast),
`db.ts`, a health-check route (`/api/v1/health/live`), and a React app that calls it and shows a
status card. Established the `createApp()` / `index.ts` split (so future tests can import the app
without a real running server).

### ✅ Day 2 — Authentication Core
Register, email verification (via Mailpit), login, logout. `User` model, bcrypt password hashing,
JWT access tokens in an httpOnly cookie, hashed one-time verification codes. Deliberately vague
"invalid email or password" error on login (prevents account enumeration). Established the
`ApiError` + `errorHandler`/`notFoundHandler` pattern and the controller 3-step shape used ever
since.

### ✅ Day 3 — Sessions, Recovery & Invitations
Split into short-lived access tokens (15 min) + long-lived refresh tokens (30 days) with rotation
on every use. Reuse detection: presenting an already-rotated-away refresh token revokes the entire
session immediately (signals a stolen token). `Session` model (see/revoke logged-in devices),
forgot/reset password (revokes all sessions on reset), plain invitations (no org yet — that's
Day 5). Established the generic "one-time hashed token" pattern reused for verification, reset, and
invitations.

### ✅ Day 4 — Organizations & Multi-Tenancy
`Organization` + `Membership` (user↔org↔role join, roles were just `"owner"|"member"` at this
point) models. **`tenant.middleware.ts`'s `requireOrgMembership`** — the single most important file
in the whole project — re-checks every `:organizationId` in a URL against a real Membership record
before trusting it. Establishes the golden rule quoted everywhere since: *"never trust an
organization id from the client, always re-derive and re-check it."*

### ✅ Day 5 — Roles & Permissions
Replaced the fixed owner/member split with a real permission system: `PERMISSIONS` catalog (named
strings), `Role` documents (`name` + `permissions[]`), `Membership.roleId` pointing at a real Role.
Every org auto-gets two undeletable "system roles" (Owner = every permission, Member = none).
`requirePermission(permission)` middleware added. Also added `Department` and `Team` (simple
groupings) and org-scoped invitations (invite + assign a role in one step). Flat allow-list only —
no deny-rules, no hierarchy, by design.

### ✅ Day 6 — Frontend App Shell
First frontend-focused day. Real navigation: `Sidebar` (org switcher) + `Topbar` + `AppShell`
layout, replacing the "one plain form per page" look. TanStack Query (`lib/queries.ts`) and Zustand
(`store/activeOrgStore.ts`, persisted) finally put to use — both were installed Day 1 but unused
until now. Shared UI kit built by hand (`Button`/`Card`/`Input`/`States`/`Toast`) since the real
shadcn/ui CLI can't run in this environment. Old monolithic `DashboardPage.tsx` split into
`OverviewPage`, `OrganizationDetailPage`, `SessionsPage`, `ProfilePage`.

### ✅ Day 7 — Projects & Members
First "real business data" module. `Project`, `ProjectMember` (project-level lead/member roles,
deliberately much simpler than org-level custom Roles), `Milestone` models. New permissions:
`project.create`, `project.manage`, `project.member.manage`. Adding someone to a project re-checks
they're an ACTIVE org member first (same "re-check against a real record" principle as Day 4).
`project.routes.ts` mounted at the same `/api/v1/organizations` base path as org routes, in its own
router file (a pattern repeated for tasks in Day 8). No delete for projects — only status changes
(active/completed/archived); deleting would raise unanswered questions about members/milestones.

### ✅ Day 8 — Tasks, Board & Sprints
The actual day-to-day work surface. `Sprint` (dated work window), `Task` (subtasks are just Tasks
with `parentTaskId` set — no separate model; `position` for simple append-to-end-of-column
ordering, NOT full reorder-and-shift), `TaskComment`, `TaskAttachment` (deliberately a name+URL
link, not a real file upload — MinIO integration is a disclosed future step), `TimeEntry` (minutes
+ note + workDate, no billable/rate fields). Four-column Kanban board (`todo`/`in_progress`/
`in_review`/`done` — not SRS-specified exactly, a reasonable small default). **The one real
server-validated business rule**: `moveTask` blocks marking a task "done" while it still has an
open subtask, returning a clean 409. New permissions: `task.manage`, `sprint.manage`. Comments/
attachments/time-entries are deliberately permission-free (any active member can use them) with an
"ownership OR `task.manage`" rule for deleting someone else's. Frontend: `TaskBoardPage.tsx`
(native HTML5 drag-and-drop, sprint filter/creation) + `TaskDetailModal.tsx` (assignees, subtasks,
comments, attachments, time entries). Board only shows top-level cards; subtasks live inside the
parent's modal, not as their own board cards (documented UI simplification, not a backend limit).

### ✅ Day 9 — Real-Time
The first genuinely different communication shape in the project: Socket.IO, a connection that
stays open so the server can push messages without being asked. `apps/api/src/lib/socket.ts` is
the whole server-side piece — auth reuses the same access-token cookie `requireAuth` checks (no
separate socket login), and sockets join a `project:<id>` "room" only after a real Membership
re-check (same Day-4 golden rule, applied to rooms). `index.ts` changed from `app.listen(...)`
directly to building a raw `http.Server` first so Socket.IO can share the same port — `createApp()`
itself is untouched, so every prior day's `createApp()`-only smoke test still works unmodified.
Task create/update/move/delete and comment create/update/delete all broadcast to their project's
room via `emitToProject(...)`, using canonical event-name strings from the new `SOCKET_EVENTS`
catalog in shared-types (same "one source of truth" idea as `PERMISSIONS`). Two smaller features
ride along: comments can now be edited (`updatedAt` tracked, shows "(edited)") and deleted
(ownership-or-`task.manage`, same rule as attachments/time-entries), and @mentions — deliberately
simple: `@` immediately followed by a project member's EXACT email, no autocomplete picker (a
disclosed scope choice, not a limitation of the underlying feature). Frontend:
`apps/web/src/lib/socket.ts`'s `useProjectSocket()` hook, used by `TaskBoardPage.tsx` (a live
"Live"/"Offline" badge, board updates invalidate the same TanStack Query key Day 8 already used)
and `TaskDetailModal.tsx` (comment edit/delete UI, mention highlighting). Vite's dev proxy gained a
`/socket.io` entry with `ws: true` alongside the existing `/api` entry. Valkey/Redis is still
unused — a single server instance doesn't need Socket.IO's Redis adapter, only multi-instance
deployments would.

### ✅ Day 10 — Support Tickets
`PERMISSIONS.TICKET_ASSIGN`, reserved and unused since Day 5, finally gets a real module. `Ticket`
+ `TicketComment` models — deliberately ORG-level (no `projectId`, unlike everything since Day 7),
mounted at the same route depth as `organizationRouter`. Any active member can file a ticket and
comment on any ticket (no permission gate, same low-risk reasoning as task comments) — this is the
first module a plain "Member"-role user can actually use themselves, not just watch a manager use.
Two DIFFERENT ownership-or-permission rules live on the one model: editing a ticket's own details
(title/description/priority) needs you to be its CREATOR (or hold `ticket.assign`); changing its
STATUS needs you to be its current ASSIGNEE (or hold `ticket.assign`); assigning/reassigning has NO
ownership exception at all — a flat `requirePermission(TICKET_ASSIGN)` route-level check, its own
separate `PATCH .../assign` endpoint rather than folded into the general update route. Priority
(`low`/`medium`/`high`/`urgent`) is this day's own small, undocumented-by-the-SRS design choice.
Ticket comments are deliberately kept at Day-8 simplicity (no edit/delete/@mentions, no Socket.IO
live updates) — reusing Day 9's richer machinery here is a disclosed future upgrade, not today's
job. Frontend: `TicketsListPage.tsx` (status/"only mine" filters, a file-a-ticket form with no
`canManage` gate) + `TicketDetailPage.tsx`, plus a new "Tickets" sidebar link.

### ✅ Day 11 — Task Dependencies, Checklists & Risk Register
The three features the Day 8 comments explicitly deferred ("should have, not today's job"). Two
live as new fields directly ON `Task` — `dependsOnTaskIds` (other tasks in the same project that
must be "done" first; `task.service.ts`'s `assertNoDependencyCycle` walks the dependency graph
forward before saving to reject any cycle, and `moveTask`'s existing "done" block was extended to
also check open dependencies, same shape as its existing open-subtask check) and `checklistItems`
(a Mongoose embedded subdocument array — a small to-do list with genuinely NO ownership concept at
all, unlike comments/attachments/time-entries: any active member can add/toggle/rename/remove ANY
item). The risk register is a real new module, `apps/api/src/modules/risks/` — deliberately
PROJECT-level (like Task/Sprint), not org-level like Day 10's Ticket, since a risk belongs to one
project's plan. `PERMISSIONS.RISK_MANAGE` is FLAT with no ownership exception (unlike Ticket) —
tracking a risk's severity/status/mitigation plan is a coordinator-level activity. `riskScore`
(1-9) is computed server-side from likelihood × impact, never stored, so it can't drift out of
sync. Every checklist mutation reuses the EXISTING `SOCKET_EVENTS.TASK_UPDATED` event (no new event
added) since a checklist item lives embedded on the task — the board's Day-9 live-update wiring
picks it up with zero new frontend socket code. Frontend: `TaskDetailModal.tsx` gained
Dependencies (toggleable chips + a "Blocked" badge) and Checklist sections; a new
`RiskRegisterPage.tsx` is linked from `ProjectDetailPage.tsx`'s header, next to "Board."

### 🔧 Post-Day-11 fix — Role permission editing (not a numbered day, but real, shipped work)
A real usability bug surfaced while using the app: `createOrganization` (Day 5) snapshots
`ALL_PERMISSIONS` into a new org's "Owner" role ONCE, at creation time — it's a copy, not a live
reference. Every later day that added a new permission string (`task.manage` on Day 8,
`ticket.assign` on Day 10, `risk.manage` on Day 11) never retroactively added it to
ALREADY-EXISTING roles. An org created early in this project's life ends up with an Owner role
permanently missing newer permissions — and until now there was no way to fix that except a direct
database edit, since `organization.service.ts` only ever had `createRole`/`deleteRole`, no
`updateRole`. Added: `updateRoleSchema` (validation), `updateRole` (service — deliberately allowed
to edit a SYSTEM role's `permissions`, unlike `deleteRole` which still blocks system roles outright;
renaming a system role is still blocked), `PATCH /organizations/:organizationId/roles/:roleId`
(route, same `role.manage` permission gate as create/delete), and a frontend inline-edit UI on
`OrganizationDetailPage.tsx`'s Roles card (an "Edit" pencil next to every role, including Owner/
Member, with a "Select all" shortcut). **New convention worth knowing**: system roles (Owner/
Member) can now have their PERMISSIONS edited through the app, just not their NAME — if a future
day adds another permission to the catalog, this is now the intended way for an existing org to pick
it up, instead of needing a database migration.

### ✅ Day 12 — Real File Storage (most recently completed)
Wired up the MinIO service that had been sitting in `docker-compose.yml`, completely unused, since
Day 1 — including discovering its 5 env vars (`MINIO_ENDPOINT`/`MINIO_PORT`/`MINIO_BUCKET`/
`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`) had also been sitting in `.env`/`.env.example` since Day 1,
silently ignored because `config/env.ts`'s Zod schema never listed them. New `lib/storage.ts` is the
one file that talks to MinIO: `ensureBucketExists()` (called on boot, creates the bucket if missing,
warns-but-doesn't-crash if MinIO is unreachable — a deliberately different severity than `env.ts`'s
hard fail on bad secrets), `uploadFileToStorage`/`deleteFileFromStorage`, and
`getSignedDownloadUrl` (a 15-minute presigned URL — the browser downloads straight from MinIO, our
API never streams file bytes on the way out). `TaskAttachment` (Day 8) now supports EITHER a link
(`url`) OR a real upload (`storageKey`/`mimeType`/`sizeBytes`) — never both, enforced in
`task.service.ts` since Mongoose has no "exactly one of these fields" validator built in. New route:
`POST .../tasks/:taskId/attachments/upload`, multipart via `multer` (memory storage, 10 MB limit),
same "any active member, no permission gate" rule as Day 8's link attachments. Frontend:
`TaskDetailModal.tsx` gained a file-upload control that shows both kinds of attachment in one
identical-looking list.

---

### ⚠️ Days 13-18 — NOT YET BUILT. Reconstructed from hints only — verify against the real SRS/schedule PDFs if you can find them.

The schedule and build-guide PDFs referenced by the README are **not present in this repo**. What
follows for Days 13-18 is reconstructed **only** from forward-looking comments already written into
the Day 1-12 code and learning notes. Treat the day numbers below with **decreasing confidence** the
further you go — Days 13-15 are educated guesses about ordering; Day 18 has zero hints anywhere.

**Days 13-15 — unordered, but these unbuilt features are explicitly on the list somewhere:**
- **Automatic access-token refresh** — the frontend has never actually called `POST /auth/refresh`
  automatically; `lib/api.ts` explicitly flags this as a "later day" task since Day 3. Needs an
  `apiRequest` wrapper upgrade: on a 401 `AUTHENTICATION_REQUIRED`, silently call `/refresh` once
  and retry the original request.
- **Permission model enhancements** — deny-rules or overrides on top of the flat allow-list (Day 5
  explicitly scoped these out, calling them a possible future addition, no day given).
- **Drag-and-drop true reordering** — Day 8's `position` field only supports append-to-end; true
  "insert at this exact slot and shift everything else" is called out as "a reasonable future
  upgrade," no day given.
- **Multi-organization invitations** — inviting an email that already has an OpsSphere account into
  a second org isn't supported yet (Day 5 explicitly rejects this case with an error).

**Day 16 — "Hardening"** *(named explicitly once)*
Accessibility and responsive-breakpoint polish beyond what Tailwind gives for free, per the Day 6
learning note: *"real accessibility/responsive polish is a Day 16 'Hardening' task per the
roadmap."* Likely also covers things typically bundled under "hardening" in a project like this —
rate limiting (Valkey would be a natural fit here too), input sanitization review, security headers
audit, error-boundary coverage — though only the accessibility/responsive piece is actually
confirmed by a comment.

**Day 17 — Polish** *(named explicitly once)*
Per the Day 6 learning note: *"Command palette, keyboard shortcuts, and a notifications drawer are
explicitly Day 17 polish, not today."*

**Day 18 — unknown** *(zero hints anywhere in the codebase)*
No comment anywhere references "Day 18." For an 18-day plan ending here, a final wrap-up day
(deployment docs, a demo script, final QA pass, README cleanup) would be a typical shape for a
capstone day — but this is a guess, not a documented fact. Flag it as such if you reach this point
and don't have the real schedule PDF.

**If you find the actual `OpsSphere_Build_Guide.pdf` / `OpsSphere_18_Day_Build_Schedule.pdf`,
treat them as authoritative over everything in this section** — this reconstruction exists only
because those files were missing when this handoff was written.

---

## 7. Verification methodology (no live database available in this environment)

This sandbox has never had a real, running MongoDB to test against — every day's "verification"
has used the same layered approach, and you should keep doing the same unless your environment
actually has Docker/Mongo available:

1. **Fresh sync**: `rsync -a --delete --exclude 'node_modules' --exclude '.git' <repo> <scratch
   copy>`. **The `--delete` flag is mandatory** — omitting it left stale deleted files behind once
   and caused false type errors that took real debugging time to track down.
2. `pnpm install` in the scratch copy.
3. `tsc --noEmit` in each of the 4 packages (`shared-types`, `validation`, `apps/api`, `apps/web`)
   — run in dependency order, though in practice cross-package type errors surface regardless.
4. `vite build` in `apps/web` for a stronger frontend check than `tsc` alone catches (e.g. actual
   bundling issues).
5. A **temporary smoke-test script** (`dayN-smoke.ts`, deleted after use) that imports `createApp()`
   from `app.ts`, starts a real HTTP server on a random port via plain `node:http`, and fires
   `fetch()` at every new route with no auth cookie — asserting every one comes back `401
   AUTHENTICATION_REQUIRED` (proves the route is wired up and gated correctly) and that a bogus URL
   still 404s. This tests routing/middleware wiring WITHOUT needing a database. Requires dummy env
   vars (`MONGODB_URI`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `WEB_ORIGIN`) since
   `env.ts` validates on import; set `LOG_LEVEL=fatal` (not `"silent"` — not a valid value in this
   schema) to keep pino-http's request logs from burying the test output.
6. **An attempt was made once (Day 7 re-verification) to spin up `mongodb-memory-server` for true
   end-to-end database testing** — it was unreliable in this specific sandboxed environment
   (backgrounded install processes didn't survive across separate tool-call boundaries, leaving an
   empty package directory despite an apparently-successful install). It was abandoned; if your
   environment can reliably run background processes or you have Docker, this is worth revisiting
   — it would let you verify actual data flows (not just routing/auth-gates), which is the biggest
   current gap in verification confidence.
7. **If a day introduces a dependency that only ONE package needs for testing (not for the app
   itself)** — e.g. Day 9 needed `socket.io-client` inside `apps/api`'s smoke test, purely to act as
   a test client, even though `socket.io-client` is really a frontend dependency — installing it
   with plain `pnpm add` from inside that package's directory can silently do nothing (it appears to
   resolve packages but never actually writes to that package's `package.json`/`node_modules`).
   What actually works: run `pnpm --filter <package-name> add -D <package>` from the WORKSPACE ROOT
   (e.g. `pnpm --filter @opssphere/api add -D socket.io-client`). This is scratch-copy-only — never
   add a real dependency to a package's actual `package.json` just because a smoke test needed it.
8. **Testing something that requires a WebSocket/long-lived connection instead of a single
   request/response** (first needed Day 9): start the server exactly like every other smoke test
   (`createApp()` + a plain `http.Server`, but also call `initSocketServer(server)` this time), then
   connect a real `socket.io-client` instance at the resulting random port and assert on
   `connect`/`connect_error` events instead of a `fetch()` response. You can verify "rejects with no
   auth" and "rejects with a bad token" this way with zero database involvement (the rejection
   happens in `io.use(...)`, before any DB query) — but anything past that (a DB-backed check like
   the `join-project` membership lookup) hits the exact same "no live database" wall as everything
   else in this environment, and should be disclosed as unverified the same way.

**Always be explicit in the learning note's "what was actually verified" table about the
difference between what was actually tested (types, build, routing, auth-gates) and what still
needs a human to click through locally against a real database (the actual create → use → confirm
loops).** Never claim more confidence than what was actually run.

---

## 8. Current state / how to resume

- Git: as of Day 12, the working tree has the Day 12 changes (plus the post-Day-11 role-permission-
  editing fix) staged but **not yet committed** (the user has not asked for an automatic push since
  Day 7 — check `git log` and `git status` first before assuming anything about what's actually
  committed; don't assume Days 8-12 are pushed just because Day 7 was).
- Real local testing of Day 12 needs the user's own Docker MinIO container actually running
  (`docker compose up -d minio`, console at `localhost:9001`) - this sandbox has never had one
  available, same gap as the database in every prior day.
- The README.md's "Status" line is stale (still says "Day 1 of 18") — worth fixing whenever
  convenient, it's a one-line change.
- No `.env` file is assumed to exist in this sandbox — real local development (`pnpm dev` against
  actual Docker services) has never been run or confirmed working end-to-end by the assistant; only
  the user, running it on their own machine with Docker Desktop, can confirm that. This now also
  covers the actual live loop of Day 9's real-time features (two browsers, one board) — never
  witnessed directly, only reasoned through and smoke-tested at the connection/auth-gate level.
- Node.js 20+ and pnpm 9+ are required per the README; this sandbox's pnpm had to be installed via
  `npm install -g pnpm@9` and invoked by its absolute path in `~/.npm-global/bin/pnpm` — corepack's
  usual `corepack enable` failed here with an `EACCES` symlink permission error, so don't assume
  corepack will "just work" in whatever environment you're in either.

---

## 9. Keep this file updated — every day, not just once

**As of Day 9, the user explicitly asked for this file to be kept current going forward, after
every day's work, the same way it was written after Day 8.** This is now a standing instruction,
not a one-time favor — treat updating this file as the FINAL step of §5's daily rhythm (after the
learning note, before handing back git commands), every single day from here on, without needing
to be asked again.

**What to actually touch, each time:**
- §2 (tech stack) — only if the day added a real dependency (not test-only scratch installs).
- §3 (repository structure) — add new files/folders, update the "as of Day N" header.
- §4 (conventions) — only if the day introduced a genuinely NEW pattern (a new cross-cutting idea,
  the way Day 9 added the whole "real-time" convention block). Don't add an entry for every small
  detail — this section is for patterns future days should actually reuse.
- §6 — move the day from the "not yet built" reconstruction into a new "✅ Day N —" entry with real,
  accurate detail (what models/permissions/files, the one interesting design decision, what was
  deliberately left simple). Delete or shrink whatever part of the old reconstruction that day just
  resolved, the way Day 9 was removed from the Day 9-18 guess-list once it was actually built.
- §7 (verification methodology) — only if the day's verification needed a genuinely new technique
  (like Day 9's WebSocket-testing approach). Most days won't need a change here.
- §8 (current state) — always update: the "as of Day N" git/committed-state line, and anything
  about the local environment that changed.

**What NOT to do:** don't let this file balloon into a second copy of every learning note. Keep
each day's §6 entry to one solid paragraph — the learning note is where the full explanation lives;
this file is a MAP for another AI picking up the project cold, not the whole territory.

---

**Bottom line for whoever picks this up next**: follow §5's rhythm exactly (including this file's
own update step, §9), respect the conventions in §4 (they're consistent across 12,000+ lines of
code so far — don't introduce a different style), verify using §7's methodology, and be honest
about the Day 13-18 uncertainty in §6 until you can get your hands on the real schedule PDF.
