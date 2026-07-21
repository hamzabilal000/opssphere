// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Your app needs a bunch of settings to run: which port to listen on, the
// database address, secret keys for logins, etc. Normally in your other
// projects you'd just do `process.env.SECRET` wherever you needed it.
//
// The problem: if you misspell a variable name, or forget to set it, you
// don't find out until that exact line of code runs — sometimes minutes
// after the server "started successfully". That's confusing to debug.
//
// This file fixes that by checking EVERY setting, ONCE, the moment the app
// boots. If anything is missing or wrong, the app refuses to start and tells
// you exactly what's wrong. Everywhere else in the code, we import `env`
// from this file instead of touching `process.env` directly.
// ============================================================================

// TYPESCRIPT NOTE: `import { z } from "zod"` is the TypeScript/modern-JS way
// of writing what you'd normally write as `const { z } = require("zod")`.
// `import ... from ...` and `require(...)` do the same job (pull in a
// library) — `import` is just the newer syntax that TypeScript/Vite/modern
// Node prefer.
import { z } from "zod";

// "dotenv/config" reads your `.env` file and loads its contents into
// `process.env`, automatically, just by importing it. This is the same
// dotenv package you already use with `require('dotenv').config()` in
// your other projects — just written the `import` way.
import "dotenv/config";

// TYPESCRIPT NOTE: what is a "schema"?
// Zod lets us describe the SHAPE we expect our settings to have — kind of
// like a checklist. `z.object({ ... })` means "I expect an object with
// exactly these fields." Each field then says what TYPE of value is
// allowed (a string, a number, one of a fixed list of choices, etc).
const envSchema = z.object({
  // z.enum([...]) means "this value must be exactly one of these three
  // strings." .default("development") means "if it's missing, just assume
  // this value instead of failing."
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // z.coerce.number() means "even though environment variables are always
  // TEXT (e.g. the string \"4000\"), please convert it to an actual number
  // for me." .int().positive() adds extra rules: must be a whole number,
  // must be greater than zero.
  PORT: z.coerce.number().int().positive().default(4000),

  // A plain string, but it must look like a real URL, e.g. "http://localhost:5173"
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),

  // .min(1, "message") means "this string can't be empty — and if it is,
  // show this specific error message" instead of a generic one.
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  ACCESS_TOKEN_SECRET: z.string().min(1, "ACCESS_TOKEN_SECRET is required"),
  REFRESH_TOKEN_SECRET: z.string().min(1, "REFRESH_TOKEN_SECRET is required"),
  ACCESS_TOKEN_TTL: z.string().default("15m"), // "15m" = 15 minutes, just a plain string for now
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // COOKIE_SECURE arrives from .env as the literal text "true" or "false"
  // (env vars are ALWAYS text). .transform(...) lets us convert that text
  // into a real boolean (true/false) that the rest of the code can use
  // directly, e.g. `if (env.COOKIE_SECURE) { ... }`.
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // New for Day 2 (Authentication) — where to send emails during
  // development. All three have sensible defaults matching Mailpit
  // (see docker-compose.yml), so your existing .env file still works even
  // without adding these lines yourself.
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default("OpsSphere <no-reply@opssphere.local>"),

  // DAY 12 — object storage (MinIO, an S3-compatible server; see
  // docker-compose.yml). These five lines have actually been sitting in
  // .env/.env.example since Day 1, but NOTHING read them until today - a
  // Zod schema without `.strict()` just silently ignores env vars it
  // doesn't ask for, so they were doing nothing at all. `STORAGE_DRIVER`
  // is a z.enum with only one allowed value on purpose: if this project
  // ever adds a second storage backend (e.g. local disk for a laptop demo
  // with no Docker), this is where that choice would be validated - for
  // now, setting anything else is almost certainly a typo, and "fail fast
  // on boot" should catch that the same way it catches everything else.
  STORAGE_DRIVER: z.enum(["minio"]).default("minio"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_BUCKET: z.string().min(1, "MINIO_BUCKET is required").default("opssphere"),
  MINIO_ACCESS_KEY: z.string().min(1, "MINIO_ACCESS_KEY is required"),
  MINIO_SECRET_KEY: z.string().min(1, "MINIO_SECRET_KEY is required"),
});

// .safeParse(...) checks `process.env` (all your real environment variables)
// against the schema above. Unlike .parse(), it does NOT throw an error —
// instead it gives back an object telling us whether it succeeded or failed,
// so we can handle the failure ourselves in a friendly way below.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  // .flatten().fieldErrors turns Zod's internal error format into a simple
  // { PORT: ["expected number, got string"], ... } object that's easy to read.
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1); // stop the app completely — don't let it start half-broken
}

// TYPESCRIPT NOTE: `export const env = parsed.data;`
// `export` makes this variable available to other files via
// `import { env } from "./config/env.js"`. `parsed.data` is the validated,
// cleaned-up version of process.env — PORT is now a real number, not text,
// COOKIE_SECURE is a real true/false, and every field is guaranteed to exist.
export const env = parsed.data;

// TYPESCRIPT NOTE: `export type Env = typeof env;`
// This line creates a TYPE (not a value) called `Env`, based on whatever
// shape `env` turns out to have. Types are TypeScript-only — they exist
// purely to help your editor autocomplete and catch mistakes, and they
// disappear completely when the code is compiled to plain JavaScript.
// You won't need this line often, but it's handy if another file wants to
// say "this function accepts something shaped like our env object."
export type Env = typeof env;
