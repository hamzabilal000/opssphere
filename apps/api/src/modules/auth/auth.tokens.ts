// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Three different, unrelated things live in this file, all loosely called
// "tokens" but used for completely different jobs:
//
// 1. ACCESS TOKENS (JWT) — proves "this browser is logged in as this user,"
//    right now. Short-lived (15 minutes) on purpose.
//
// 2. REFRESH TOKENS (JWT) — NEW on Day 3. A longer-lived token whose only
//    job is "let this browser get a fresh access token without making the
//    user type their password again." See the big comment in Part 2 for
//    why these need extra care.
//
// 3. ONE-TIME TOKENS (not a JWT — just a random code) — used for email
//    verification (Day 2), and now ALSO for password reset and invitations
//    (Day 3). Same exact pattern all three times: generate a random code,
//    email the raw version, store only a hash of it.
// ============================================================================

import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto"; // built into Node, no install needed
import { env } from "../../config/env.js";

// ----------------------------------------------------------------------------
// PART 1 — ACCESS TOKENS (unchanged from Day 2)
// ----------------------------------------------------------------------------
export interface AccessTokenPayload {
  sub: string; // "subject" - the user's database ID
  // DAY 3: optional session id - lets requireAuth know WHICH session this
  // request is using, so logout can revoke the right one and the sessions
  // list can mark "(this device)" without a second lookup.
  sid?: string;
}

export function signAccessToken(userId: string, sessionId?: string): string {
  const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
}

// ----------------------------------------------------------------------------
// PART 2 — REFRESH TOKENS (new today) — and WHY rotation/reuse detection matters
// ----------------------------------------------------------------------------
// An access token only lasts 15 minutes on purpose — if one ever leaked
// (stolen laptop, XSS bug, whatever), the damage window is small. But we
// don't want to force a full password re-entry every 15 minutes either.
//
// The refresh token is the trade-off: it lives much longer (see
// REFRESH_TOKEN_TTL_DAYS in .env, default 30 days), and its ONLY job is to
// mint a new access token when the old one expires, via POST /auth/refresh.
//
// Because it's long-lived, we protect it much more carefully than an access
// token:
//   - It's tied to a specific Session document in the database (see
//     session.model.ts), not just trusted on its signature alone.
//   - Every time it's used, we ROTATE it — the old one stops working and a
//     brand new one is issued, even though the underlying session continues.
//   - If an ALREADY-ROTATED-AWAY token ever gets used again, that's a red
//     flag someone has a stolen copy of an old token — so we revoke the
//     entire session immediately (see auth.service.ts's refreshSession
//     function for exactly how that check works).
export interface RefreshTokenPayload {
  sub: string; // user id
  sid: string; // session id (see session.model.ts) - which Session this token belongs to
}

export function signRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, sid: sessionId };
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
}

// A refresh token is never stored in the database in raw form either — same
// "one-way hash" principle as passwords. We hash it with plain SHA-256 (not
// bcrypt) because, like the one-time tokens below, it's already long and
// random rather than something a human picked.
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ----------------------------------------------------------------------------
// PART 3 — ONE-TIME TOKENS (email verification, password reset, invitations)
// ----------------------------------------------------------------------------
// The exact same pattern, reused for three different features - generate a
// long random string, email the RAW version, store only a HASH of it. If
// the database ever leaked, an attacker still couldn't read out valid
// "verify me" / "reset my password" / "join this account" links from it.
export function generateOneTimeToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashOneTimeToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashOneTimeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ----------------------------------------------------------------------------
// SMALL HELPER — turns "15m" into 900000 (milliseconds), used for cookie maxAge
// ----------------------------------------------------------------------------
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) return 15 * 60 * 1000; // fallback: 15 minutes, just in case

  const [, amountStr, unit] = match;
  const amount = Number(amountStr);
  const unitToMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const msPerUnit = unitToMs[unit ?? "m"] ?? 60 * 1000;
  return amount * msPerUnit;
}
