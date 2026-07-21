# Deploying OpsSphere

This project has only ever been run locally against Docker Compose during development (see
`docs/PROJECT_HANDOFF.md` §7 for exactly what could and couldn't be verified without a live
database). This guide is what to check before running it anywhere else - a staging server, a cloud
VM, a managed platform - written from the actual code, not a generic checklist.

## 1. Build steps

Each workspace package builds independently. From the repo root:

```bash
pnpm install
pnpm --filter @opssphere/shared-types build
pnpm --filter @opssphere/validation build
pnpm --filter @opssphere/api build      # tsc -> apps/api/dist
pnpm --filter @opssphere/web build      # vite build -> apps/web/dist
```

Build order matters: `shared-types` and `validation` are plain TypeScript packages that `api` and
`web` both import from directly (see `packages/*/package.json` - no separate publish step, they're
consumed as workspace dependencies). Build them first, or just run `pnpm install` at the root, which
resolves the workspace correctly either way.

`apps/api`'s production start command is `node dist/index.js` (see its `package.json`'s `start`
script). `apps/web`'s build output (`apps/web/dist`) is a static site - serve it from any static
host or a reverse proxy in front of the API; it is NOT served by the Express app itself anywhere in
this codebase.

## 2. Environment variables

Every variable below is validated by `apps/api/src/config/env.ts` on boot - the server refuses to
start at all if a required one is missing (see that file's comment on why: "fail fast, on boot, with
a clear error" instead of a mysterious failure minutes later). Anything with a default shown is
optional; anything without one is required.

| Variable | Required | Default | What it's for |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` disables pino-pretty's colorized log output and hides internal error details from API responses (see `errorHandler.ts`). |
| `PORT` | no | `4000` | The port the API listens on. |
| `WEB_ORIGIN` | no | `http://localhost:5173` | **Must match your real frontend's origin in production** - used for both CORS (`app.ts`) and building links inside emails (invitation/reset links). Getting this wrong either blocks the frontend from calling the API, or emails links pointing at localhost. |
| `MONGODB_URI` | **yes** | - | Full MongoDB connection string. |
| `ACCESS_TOKEN_SECRET` | **yes** | - | Signs 15-minute access tokens. **Generate a long, random, unique value for production** - never reuse the placeholder in `.env.example`. |
| `REFRESH_TOKEN_SECRET` | **yes** | - | Signs 30-day refresh tokens. Must be a DIFFERENT value than `ACCESS_TOKEN_SECRET` - same reasoning as never reusing a password. |
| `ACCESS_TOKEN_TTL` | no | `15m` | How long an access token lasts before Day 13's auto-refresh kicks in. |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | How long a refresh token (and therefore a session) lasts before requiring a real login again. |
| `COOKIE_SECURE` | no | `false` | **Must be `true` in any real deployment** - marks auth cookies `Secure`, so browsers only ever send them over HTTPS. Leaving this `false` in production means session cookies could be sent over plain HTTP. |
| `LOG_LEVEL` | no | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace`. |
| `SMTP_HOST` / `SMTP_PORT` | no | `localhost` / `1025` | **Point these at a real SMTP provider in production** - the defaults target Mailpit, a fake local inbox that only exists in `docker-compose.yml` for development. Without a real SMTP provider, verification emails, password resets, and invitations silently fail to deliver. |
| `MAIL_FROM` | no | `OpsSphere <no-reply@opssphere.local>` | The From address on every email the app sends. |
| `STORAGE_DRIVER` | no | `minio` | Only `minio` is a valid value right now (see env.ts's comment on why this is a `z.enum` of one - it's there so a future second storage backend has somewhere to be validated). |
| `MINIO_ENDPOINT` / `MINIO_PORT` | no | `localhost` / `9000` | Where the S3-compatible storage server lives. Works unchanged against real AWS S3 or any S3-compatible provider, not just MinIO - only the endpoint/credentials change. |
| `MINIO_BUCKET` | no | `opssphere` | The bucket task attachments are uploaded into. Must already exist, or be creatable by the credentials below (`lib/storage.ts`'s `ensureBucketExists()` tries to create it on boot, and only WARNS if it can't - see the note below). |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | **yes** | - | Credentials for the storage bucket above. |
| `VALKEY_URL` | no | `redis://localhost:6379` | Backs Day 16's rate limiter. **The app still runs correctly without a real Valkey** (see the note below) - but rate limiting silently stops doing anything. |

## 3. Pre-launch checklist

- [ ] `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` are long, random, and different from each
      other and from anything in `.env.example`.
- [ ] `COOKIE_SECURE=true`, and the API is actually served over HTTPS (a `Secure` cookie is silently
      dropped by the browser over plain HTTP - login will appear to succeed but the session won't
      persist).
- [ ] `WEB_ORIGIN` matches the real frontend's URL exactly (scheme and host both).
- [ ] `SMTP_HOST`/`SMTP_PORT` point at a real provider - Mailpit's defaults only work on your own
      machine.
- [ ] MinIO/S3 credentials point at a real, persistent bucket - the local Docker MinIO's data volume
      is not something you'd want to rely on outside development.
- [ ] A real Valkey instance is reachable if you want rate limiting to actually rate-limit anything
      (see the fail-open note below).
- [ ] `pnpm --filter @opssphere/web build` was run AFTER setting the real API's public URL in
      whatever reverse-proxy config sits in front of it (the frontend talks to `/api/v1/...`
      relative paths - see `apps/web/vite.config.ts`'s dev proxy for the local equivalent - so your
      production reverse proxy needs to route `/api/v1` and `/socket.io` to the API the same way).

## 4. Things that fail OPEN, not closed - know this before you rely on them

Two features in this codebase are deliberately built to degrade gracefully rather than block the
whole app if their backing infrastructure is unreachable. This is the right call for what they do,
but it means a broken dependency can go unnoticed if you're not watching the logs:

- **File uploads** (`lib/storage.ts`'s `ensureBucketExists()`) - if MinIO/S3 is unreachable on boot,
  the API still starts. Every actual upload attempt afterward will fail with a clear error, but
  nothing else breaks.
- **Rate limiting** (`lib/rateLimiter.ts`) - if Valkey is unreachable, login/register/password-reset
  routes still work completely normally, just without any real rate limiting protecting them. This
  is intentional (see `docs/PROJECT_HANDOFF.md` §4's "Hardening" convention block) - but it means a
  dead Valkey in production is a SILENT loss of a security layer, not a visible outage. Watch for the
  `"Valkey (rate limiter store) is unreachable"` warning in the logs.

## 5. What's never been tested outside a developer's own machine

Every learning note in `docs/learning-notes/` discloses this explicitly per day, but as a summary:
this codebase has never been run against a real production-like deployment (a real domain, real
HTTPS, a real SMTP provider, a real multi-instance setup) by the assistant that built it - only
reasoned through and smoke-tested at the routing/auth-gate level in a sandbox with no real database
or infrastructure available at all. Treat the checklist above as a starting point, not a guarantee,
and test each item for real before depending on it.
