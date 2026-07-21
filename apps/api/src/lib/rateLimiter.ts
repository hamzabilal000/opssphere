// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// DAY 16 ("Hardening"): slows down brute-force attempts against the auth
// routes that matter most - login, register, forgot-password, reset-
// password, and refresh. Without this, someone could script thousands of
// login attempts per second against one account, or spam the register/
// forgot-password routes to flood a real person's inbox.
//
// `express-rate-limit` does the counting; `rate-limit-redis` is the
// adapter that lets it store those counts in Valkey (Redis-compatible)
// INSTEAD OF in this one server's memory. Why that matters: if OpsSphere
// ever runs more than one API server instance behind a load balancer (the
// same reason Day 9's learning note mentions a Redis Socket.IO adapter as
// a future upgrade), an in-memory counter would let someone bypass the
// limit just by getting routed to a different instance. A shared Valkey
// store means the limit is enforced across ALL instances at once.
//
// VALKEY_URL has been sitting in .env/.env.example, completely unread,
// since Day 1 (see config/env.ts's comment) - the exact same "a schema
// without .strict() silently ignores env vars it doesn't ask for" gotcha
// Day 12 found for MinIO. This file is what finally reads it.
// ============================================================================

import { rateLimit, type Store } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// ----------------------------------------------------------------------------
// ONE shared Valkey client - same "one instance, imported where needed"
// idea as lib/logger.ts's `logger` and lib/socket.ts's `io`.
// ----------------------------------------------------------------------------
// `lazyConnect: true` means "don't even try to connect until the first
// real command is sent" - so an unreachable Valkey never slows down or
// blocks server BOOT (see config/env.ts's comment on MINIO_* for the same
// "match a startup check's failure severity to its actual blast radius"
// idea - rate limiting is a hardening LAYER, not something the whole app
// should depend on to start up).
// `maxRetriesPerRequest` + a capped `retryStrategy` stop ioredis from
// endlessly retrying a dead connection in the background - after a few
// quick attempts it gives up, and every subsequent rate-limit check just
// fails fast instead of hanging.
const valkeyClient = new Redis(env.VALKEY_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => (attempt > 3 ? null : Math.min(attempt * 200, 1000)),
});

let hasWarnedAboutValkey = false;
valkeyClient.on("error", (err) => {
  // Logged once, not on every single failed command - a dead Valkey
  // connection can produce a LOT of these very quickly otherwise.
  if (!hasWarnedAboutValkey) {
    logger.warn(
      { err },
      "Valkey (rate limiter store) is unreachable - rate limiting is degraded, but requests are still being allowed through (fail-open, not fail-closed)."
    );
    hasWarnedAboutValkey = true;
  }
});

const redisStore = new RedisStore({
  // rate-limit-redis expects a `sendCommand` function shaped like this -
  // ioredis's `.call(...)` does the same job. TYPESCRIPT NOTE: ioredis
  // types `.call` with very specific overloads (individual named Redis
  // commands, not a generic "any string, any args" signature), so a plain
  // spread of `args: string[]` doesn't type-check against any single
  // overload. `as (...a: string[]) => Promise<RedisReply>` tells
  // TypeScript "call this the generic way anyway" - the same kind of
  // small, deliberate cast every raw client library needs somewhere when
  // its types are stricter than the one generic use case actually needs.
  sendCommand: (valkeyClient.call as (...a: string[]) => Promise<RedisReply>).bind(valkeyClient),
});

// TYPESCRIPT/NODE NOTE: `RedisStore`'s constructor eagerly sends its two
// "load this Lua script" commands the moment it's created (see its
// `incrementScriptSha`/`getScriptSha` fields), WITHOUT anyone awaiting
// them yet. If Valkey is unreachable, those two promises reject almost
// immediately - and a promise that rejects with nothing ever attached to
// its `.catch()` is exactly what Node calls an "unhandled rejection,"
// which CRASHES the whole process by default (discovered by actually
// running this against no Valkey - it does exactly that). Our
// `failOpenStore.increment()` below correctly catches errors from the
// INCREMENT command itself, but that's a separate promise from these two
// - they need their own no-op `.catch()` so a dead Valkey degrades this
// feature instead of taking the whole server down with it.
redisStore.incrementScriptSha.catch(() => undefined);
redisStore.getScriptSha.catch(() => undefined);

// ----------------------------------------------------------------------------
// FAIL-OPEN WRAPPER
// ----------------------------------------------------------------------------
// THE ACTUAL HARDENING DECISION: if Valkey is down, `redisStore` above
// will throw on every `.increment()` call. The WRONG failure mode here
// would be letting that exception crash the request (or, worse, some
// naive rewrite that treats "couldn't check" as "assume they're over the
// limit" and locks EVERYONE out of login). Rate limiting is an extra
// safety layer on top of auth, not a replacement for it - so if the layer
// itself is broken, the correct move is to get out of the way and let the
// request through, exactly the same "degrade gracefully, don't take
// everything else down with you" instinct as Day 12's ensureBucketExists.
const failOpenStore: Store = {
  init: redisStore.init?.bind(redisStore),
  async increment(key: string) {
    try {
      return await redisStore.increment(key);
    } catch (err) {
      logger.warn({ err }, "Rate limiter store error on increment() - allowing this request through.");
      // A totalHits of 1 with no resetTime looks like "this is the very
      // first request from this key" to express-rate-limit - i.e. never
      // enough on its own to trigger a block.
      return { totalHits: 1, resetTime: undefined };
    }
  },
  async decrement(key: string) {
    try {
      await redisStore.decrement(key);
    } catch {
      // Not re-thrown on purpose - see the comment above increment().
    }
  },
  async resetKey(key: string) {
    try {
      await redisStore.resetKey(key);
    } catch {
      // Not re-thrown on purpose - see the comment above increment().
    }
  },
};

// DAY 16: 20 attempts per 15-minute window, per IP address. Generous
// enough that a real person mistyping their password a few times, or a
// team sharing an office IP, never notices it - tight enough to make
// scripted brute-forcing painfully slow.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: failOpenStore,
  // Routing the block through ApiError/errorHandler (rather than
  // express-rate-limit's own default response) keeps EVERY error response
  // in this API - rate-limited or not - the exact same { success, code,
  // message } shape the frontend already knows how to read.
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again."));
  },
});
