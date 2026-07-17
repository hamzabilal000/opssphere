// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the same job as your usual server/index.js setup block:
//     let app = express()
//     app.use(cors({...}))
//     app.use(express.json())
//     app.use(cookieParser())
//     app.use('/t', t_router)
//     ...
//
// We just split it into two files instead of one:
//   - app.ts (this file)  -> builds the Express app and wires up middleware/routes
//   - index.ts            -> actually connects to Mongo and starts listening
//
// WHY split them? Later, when we write automated tests, a test file can
// import `createApp()` directly and fire fake requests at it WITHOUT
// needing a real running server or a real database — it just tests the
// routing/middleware logic in isolation. That's the only reason for the
// split; everything else works exactly like your usual single-file setup.
// ============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto"; // built into Node, generates unique IDs like "3fa8...".

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// TYPESCRIPT NOTE: `export function createApp() { ... }` — a totally normal
// function, exported so index.ts can import and call it. No special
// TypeScript syntax here at all, just a regular function that returns the
// finished `app` object at the bottom.
export function createApp() {
  const app = express();

  // helmet() sets a bunch of security-related HTTP headers automatically
  // (things like preventing your site from being embedded in a hidden
  // iframe elsewhere). You don't configure anything — just turn it on.
  app.use(helmet());

  // Same job as your usual:
  //     app.use(cors({ origin: "http://localhost:5173", credentials: true }))
  // `credentials: true` is what allows the browser to send cookies
  // (like the login session) along with requests — without it, cookies
  // get silently dropped.
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    })
  );

  // Same as `app.use(express.json())` — lets us read `req.body` as JSON.
  // `{ limit: "1mb" }` just caps how large a request body can be, so
  // someone can't crash the server by sending a giant payload.
  app.use(express.json({ limit: "1mb" }));

  // Same as `app.use(cookieParser())` in your other projects — lets us
  // read `req.cookies.whatever` later once auth is built.
  app.use(cookieParser());

  // ---- Request logging (new concept, worth explaining) ----------------
  // pino-http automatically logs "request started" / "request finished"
  // for every single request, using the `logger` we built earlier, AND
  // gives every request a unique ID (genReqId below) so all the log lines
  // from ONE request can be tied together later when debugging.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // If the request already arrived with an x-request-id header
        // (common when requests pass through multiple services), reuse it.
        // Otherwise, generate a fresh random one.
        const id = req.headers["x-request-id"]?.toString() ?? randomUUID();
        // TYPESCRIPT NOTE: `?.` is "optional chaining" — totally normal
        // modern JavaScript, not TypeScript-only. It means "try to call
        // .toString(), but if the thing before the `?.` is undefined/null,
        // just short-circuit to undefined instead of crashing."
        // `??` right after is the "nullish coalescing" operator: "if the
        // left side is null/undefined, use the right side instead."
        res.setHeader("x-request-id", id);
        return id;
      },
    })
  );

  // ---- Routes -----------------------------------------------------------
  // Same idea as `app.use('/t', t_router)` in your other projects — we're
  // mounting each module's routes under its own URL prefix. Every future
  // module (organizations, projects, ...) gets its own line added here,
  // the same way auth was added on Day 2.
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter);

  // If NOTHING above matched the request's URL, this runs (see
  // middleware/errorHandler.ts for what it does).
  app.use(notFoundHandler);

  // This MUST be the very last `app.use(...)` — Express only treats a
  // 4-argument function as an error handler, and only calls it after
  // everything else has run (see middleware/errorHandler.ts).
  app.use(errorHandler);

  return app;
}
