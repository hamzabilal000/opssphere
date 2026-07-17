// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// In your other projects you probably use `console.log("something happened")`
// everywhere. That works fine for small projects, but it has two problems
// once an app gets bigger:
//   1. Every log line looks different, so you can't easily search/filter them.
//   2. You can't easily tell WHICH request or WHICH user a log line belongs to.
//
// "pino" is a logging library that solves this by making every log line a
// small JSON object with the same fields every time (level, time, message).
// We create ONE logger here and import it everywhere else, instead of
// calling console.log directly, so all our logs look consistent.
// ============================================================================

import pino from "pino";
import { env } from "../config/env.js";

// TYPESCRIPT NOTE: importing from "../config/env.js" (not "../config/env.ts")
// This looks odd, but it's correct: when Node.js runs modern
// ("ESM") TypeScript projects, import paths need the FINAL file extension
// the file will have after compiling (.js), even though the actual file on
// disk right now is env.ts. TypeScript understands this convention and
// resolves it back to env.ts automatically. It just always looks a little
// strange the first time you see it.

// `pino(options)` creates a logger instance. We're passing it a plain
// JavaScript object with two settings:
export const logger = pino({
  // LOG_LEVEL comes from our validated env (see config/env.ts). It controls
  // how noisy the logs are: "debug" shows everything, "info" shows less,
  // "error" shows only real problems.
  level: env.LOG_LEVEL,

  // This next part just makes local development easier to read.
  // In production, pino prints raw JSON (great for log search tools, ugly
  // for a human staring at a terminal). Locally, we use "pino-pretty" to
  // print colorized, readable lines instead.
  //
  // TYPESCRIPT NOTE: the `?` in `condition ? valueIfTrue : valueIfFalse` is
  // called a "ternary" — it's just a compact if/else. This line means:
  // "if we're in development mode, use the pretty-print transport,
  //  otherwise (production/test) use `undefined`, which tells pino to just
  //  print plain JSON like normal."
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

// From now on, anywhere else in the API code, instead of:
//   console.log("user logged in")
// we'll write:
//   logger.info("user logged in")
// or, to attach extra structured data (very useful when debugging later):
//   logger.info({ userId: "abc123" }, "user logged in")
