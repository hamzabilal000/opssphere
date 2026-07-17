// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Two different, unrelated things live in this file, both called "tokens"
// but used for completely different jobs — worth keeping straight:
//
// 1. ACCESS TOKENS (JWT) — proves "this browser is logged in as this user."
//    Sent to the browser as a cookie after login, then checked on every
//    request that needs to know who's asking (see auth.middleware.ts).
//
// 2. EMAIL VERIFICATION TOKENS — a one-time-use code emailed to a new user
//    so clicking the link proves "I actually own this email address."
//    Nothing to do with being logged in.
// ============================================================================

import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto"; // built into Node, no install needed
import { env } from "../../config/env.js";

// ----------------------------------------------------------------------------
// PART 1 — ACCESS TOKENS (JWT)
// ----------------------------------------------------------------------------
// A JWT ("JSON Web Token") is a signed string that encodes a small amount of
// data (here, just the user's id) plus a signature that proves WE issued it
// and it hasn't been tampered with. If your other projects have used
// `jwt.sign(...)` / `jwt.verify(...)` with the jsonwebtoken package before,
// this is exactly that — nothing new here except TypeScript's type hints.

// TYPESCRIPT NOTE: `interface AccessTokenPayload { sub: string }`
// `sub` ("subject") is a JWT convention meaning "who this token is about" —
// we're putting the user's database ID in there.
export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { sub: userId };
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"], // e.g. "15m"
  });
  // TYPESCRIPT NOTE: `as jwt.SignOptions["expiresIn"]` is a type assertion
  // (same concept as elsewhere in this project) — our env value is just a
  // plain string ("15m"), and we're telling TypeScript "trust me, this
  // matches the specific format the jsonwebtoken library expects here."
}

// Returns the decoded payload if the token is valid, or throws if it's
// missing, expired, or has been tampered with. jwt.verify() does all of
// that checking for us — we don't write any of that logic ourselves.
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
}

// ----------------------------------------------------------------------------
// PART 2 — EMAIL VERIFICATION TOKENS (not a JWT — just a random code)
// ----------------------------------------------------------------------------
// We generate a long random string, email the RAW version to the user as a
// link, but only ever save the HASHED version in the database. Same
// principle as passwords: if the database ever leaked, an attacker
// shouldn't be able to read out valid "verify me" links straight from it.

export function generateVerificationToken(): { rawToken: string; tokenHash: string } {
  // randomBytes(32) generates 32 random bytes, .toString("hex") turns that
  // into a long readable string of letters/numbers — this is the token we
  // put in the email link.
  const rawToken = randomBytes(32).toString("hex");

  // We hash it with SHA-256 before storing it (much faster than bcrypt —
  // that's fine here, because unlike a password, this token is already
  // long and random, not something a human chose).
  const tokenHash = hashVerificationToken(rawToken);

  return { rawToken, tokenHash };
}

export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ----------------------------------------------------------------------------
// SMALL HELPER — turns "15m" into 900000 (milliseconds)
// ----------------------------------------------------------------------------
// Cookies need their expiry in plain milliseconds, but we wrote our access
// token lifetime in .env as a friendly string ("15m"). This tiny function
// just converts one to the other, supporting the handful of unit letters
// we actually use (s = seconds, m = minutes, h = hours, d = days).
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) return 15 * 60 * 1000; // fallback: 15 minutes, just in case

  const [, amountStr, unit] = match;
  // TYPESCRIPT NOTE: destructuring an array like `const [, amountStr, unit] = match`
  // — the empty slot before the first comma means "skip this element"
  // (regex .exec() results always put the full matched text first, which
  // we don't need here).
  //
  // TYPESCRIPT NOTE: our regex GUARANTEES `unit` is one of "s"/"m"/"h"/"d"
  // whenever `match` succeeded, but TypeScript can't know that just from
  // the regex itself — it only sees "an array of strings, possibly with
  // missing entries." `?? "m"` (nullish coalescing, explained on Day 1)
  // gives it a safe fallback to satisfy that, even though in practice
  // we'll never actually hit the fallback.
  const amount = Number(amountStr);
  const unitToMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  // Another `?? ` fallback here for the same reason as above: our tsconfig
  // has `noUncheckedIndexedAccess` turned on (see packages/tsconfig/base.json),
  // which makes TypeScript treat EVERY `object[key]` lookup as possibly
  // undefined - a genuinely useful safety net in general, even though we
  // know this specific lookup will always succeed.
  const msPerUnit = unitToMs[unit ?? "m"] ?? 60 * 1000;
  return amount * msPerUnit;
}
