// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the same job as an "authteacher"-style middleware in your other
// projects: check that a valid login cookie is attached to the request,
// and if so, let the request continue with `req.user` set; if not, reject
// it with a 401 before it ever reaches the actual route logic.
//
// Compare directly to your usual pattern:
//     function authteacher(req, res, next) {
//         let token = req.cookies.token
//         let user = jwt.verify(token, secret)
//         if (user == null) { return res.json({ error: "..." }) }
//         req.user = user
//         next()
//     }
// This file does the same thing, with try/catch (jwt.verify THROWS on a
// bad token rather than returning null) and TypeScript types added.
// ============================================================================

import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./auth.tokens.js";
import { ApiError } from "../../middleware/errorHandler.js";

// ----------------------------------------------------------------------------
// TYPESCRIPT NOTE: "augmenting" Express's Request type
// ----------------------------------------------------------------------------
// Express's built-in `Request` type doesn't know about `.userId` — we're
// inventing that field ourselves in the line `req.userId = payload.sub`
// below. This special block tells TypeScript "every Request, everywhere in
// this project, now ALSO optionally has a userId field." Without this,
// TypeScript would show an error every time we tried to read `req.userId`
// in a later route. You only need one block like this per custom field,
// usually written once and rarely touched again.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      // DAY 3: which Session document this request's access token belongs
      // to - lets logout revoke the right session, and lets the sessions
      // list mark which row is "this device."
      sessionId?: string;
    }
  }
}

export const ACCESS_TOKEN_COOKIE = "opssphere_access_token";

// DAY 3: the refresh token's own cookie. It's set with `path:
// "/api/v1/auth"` (see auth.controller.ts) so the browser ONLY attaches it
// to requests under /api/v1/auth/* (refresh, logout) — not to every single
// API call the way the access token cookie is. That way, if the access
// token cookie ever leaked through some unrelated route, the much
// longer-lived refresh token still wouldn't be exposed alongside it.
export const REFRESH_TOKEN_COOKIE = "opssphere_refresh_token";

// This is the middleware itself — same 3-argument (req, res, next) shape
// you always use. Any route that should require login gets this added in
// front of it, e.g.:
//     authRouter.get("/me", requireAuth, getMeHandler)
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies[ACCESS_TOKEN_COOKIE];

  if (!token) {
    // We throw here instead of calling res.json() directly — remember,
    // errorHandler.ts (see Day 1) catches anything thrown anywhere in the
    // request and turns it into a consistent JSON response automatically.
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "You must be logged in.");
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub; // now available to every route handler after this middleware
    req.sessionId = payload.sid;
    next(); // "I'm done, let the request continue to the actual route"
  } catch {
    // jwt.verify throws if the token is expired, malformed, or tampered
    // with — we treat all of those the same way: not logged in.
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Your session has expired. Please log in again.");
  }
}
