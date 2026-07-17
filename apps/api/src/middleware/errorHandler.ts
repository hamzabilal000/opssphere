// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// In your other projects, every controller has its own try/catch that ends
// with something like:
//     res.json({ success: false, error: error.message, code: error.code })
//
// That's fine, but it means the exact response shape depends on whoever
// wrote that particular controller, and it's easy for them to drift apart
// over time (one controller returns `error`, another returns `message`, etc).
//
// This file centralizes that: ONE place decides what an error response
// looks like, for the ENTIRE API. Every route just needs to either:
//   (a) throw one of our own `ApiError`s for expected problems
//       (like "email already exists"), or
//   (b) let unexpected errors bubble up naturally (a bug, a crashed query)
// ...and this file catches both cases and replies consistently.
// ============================================================================

// TYPESCRIPT NOTE: `import type { NextFunction, Request, Response } from "express"`
// The word `type` here means "I only want the TYPE information from this
// import, not any actual code." Request/Response/NextFunction are just
// descriptions of "what shape does req/res/next have" — useful for
// autocomplete in your editor, but they don't exist as real JavaScript
// values at runtime. This line disappears completely once compiled.
import type { NextFunction, Request, Response } from "express";
import type { ApiErrorResponse } from "@opssphere/shared-types";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

// ----------------------------------------------------------------------------
// TYPESCRIPT NOTE: what is a "class" doing in here?
// ----------------------------------------------------------------------------
// `class ApiError extends Error` means: "make a new kind of error, based on
// JavaScript's built-in Error, but with a few extra fields attached
// (statusCode, code, errors)." This is regular JavaScript, not a
// TypeScript-only feature — you can `class X extends Y` in plain JS too.
//
// The TypeScript-specific part is writing `public statusCode: number` etc.
// directly inside the constructor's parentheses. That's shorthand for
// "accept this as a constructor argument AND automatically save it as
// `this.statusCode`" — it saves you from writing:
//     constructor(statusCode) { this.statusCode = statusCode }
// yourself.
//
// HOW WE'LL USE THIS: instead of manually building a `{ success: false, ... }`
// object every time something expected goes wrong, a controller can just do:
//     throw new ApiError(404, "RESOURCE_NOT_FOUND", "Ticket not found");
// ...and the errorHandler function below will turn that into the right
// HTTP response automatically.
export class ApiError extends Error {
  constructor(
    public statusCode: number, // e.g. 404, 403, 400
    public code: string, // a short machine-readable label, e.g. "RESOURCE_NOT_FOUND"
    message: string, // a human-readable message, e.g. "Ticket not found"
    public errors?: Array<{ field: string; message: string }> // optional: field-by-field validation errors
  ) {
    super(message); // hands the message up to JavaScript's built-in Error class
  }
}
// TYPESCRIPT NOTE: the `?` after `errors` (and inside `errors?:`) means
// "this property is OPTIONAL — it's fine to leave it out." Without the `?`,
// TypeScript would insist every ApiError include an `errors` array, even
// when there isn't one.

// This function runs whenever Express can't match ANY route to the
// request — i.e. a typo'd URL, or a route that genuinely doesn't exist.
export function notFoundHandler(req: Request, res: Response) {
  const body: ApiErrorResponse = {
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: "RESOURCE_NOT_FOUND",
  };
  res.status(404).json(body);
}

// ----------------------------------------------------------------------------
// THE MAIN ERROR HANDLER
// ----------------------------------------------------------------------------
// In Express, a function with FOUR parameters (err, req, res, next) is
// special — Express recognizes that shape specifically as an "error
// handling middleware" and only calls it when something throws or calls
// `next(err)`. This must always be the LAST `app.use(...)` in app.ts.
//
// TYPESCRIPT NOTE: `err: unknown`
// We don't know in advance what kind of thing got thrown — it could be our
// own ApiError, or it could be a totally unrelated bug (a typo, a null
// reference, anything). `unknown` is TypeScript's most honest, safest type:
// it means "this could be absolutely anything, so you MUST check what it
// actually is before using it" (that's what the `if (err instanceof ApiError)`
// check below is doing).
//
// eslint-disable-next-line comment: we have to accept `_next` as a 4th
// argument for Express to treat this as an error handler, even though we
// never actually call it ourselves. The underscore prefix (`_next`) is a
// common convention meaning "yes, I know I'm not using this parameter."
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Every request got a unique ID attached back in app.ts (see the
  // pino-http setup). Including it in the error response means that if a
  // user reports "I got an error," you can search your logs for this exact
  // ID and see everything that happened during that one request.
  const requestId = (req as Request & { id?: string }).id;
  // TYPESCRIPT NOTE: `req as Request & { id?: string }` is called a "type
  // assertion" — we're telling TypeScript "trust me, this Request object
  // also has an `id` field on it" (pino-http adds it at runtime, but
  // TypeScript doesn't know that automatically). You'll see `as` used
  // fairly often as an escape hatch like this.

  // Case 1: it's an error WE threw on purpose (see ApiError above) —
  // we already know exactly what status code and message to send back.
  if (err instanceof ApiError) {
    const body: ApiErrorResponse = {
      success: false,
      message: err.message,
      code: err.code,
      errors: err.errors,
      requestId,
    };
    return res.status(err.statusCode).json(body);
  }

  // Case 2: something we DIDN'T expect went wrong (a real bug). Log the
  // full details for ourselves, but don't leak internal details to the
  // person using the app in production — just say "something went wrong."
  logger.error({ err, requestId }, "Unhandled error");

  const body: ApiErrorResponse = {
    success: false,
    message: env.NODE_ENV === "production" ? "Something went wrong" : String(err),
    code: "INTERNAL_ERROR",
    requestId,
  };
  res.status(500).json(body);
}
