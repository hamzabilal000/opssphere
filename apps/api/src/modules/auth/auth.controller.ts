// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the Express-facing layer: read req.body, call the actual logic
// (auth.service.ts), and send a response. Directly comparable to your usual
// controller functions — same shape, same job. The main style difference
// from your usual pattern: instead of manually writing
//     if (!field1 || !field2) return res.status(400).json({...})
// we let Zod (see auth.validation.ts) check the whole shape of req.body in
// one line, and instead of a manual try/catch in every function, unexpected
// errors get caught centrally (see Day 1's errorHandler.ts) — but see
// registerHandler below, we still catch expected ones with a plain if.
// ============================================================================

import type { Request, Response } from "express";
import { registerSchema, loginSchema } from "@opssphere/validation";
import type { ApiSuccessResponse } from "@opssphere/shared-types";
import type { AuthUser } from "@opssphere/shared-types";
import * as authService from "./auth.service.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { parseDurationToMs } from "./auth.tokens.js";
import { env } from "../../config/env.js";
import { ACCESS_TOKEN_COOKIE } from "./auth.middleware.js";
import { User } from "./user.model.js";

// Shared cookie settings, used every place we set or clear the login
// cookie, so they can never accidentally drift out of sync with each other.
const cookieOptions = {
  httpOnly: true, // JavaScript in the browser can NEVER read this cookie — only the browser + server can
  secure: env.COOKIE_SECURE, // true in production (HTTPS only), false for local http:// development
  sameSite: "lax" as const, // a sensible default that still allows normal navigation-based flows
  path: "/",
};

// POST /api/v1/auth/register
export async function registerHandler(req: Request, res: Response) {
  // .safeParse (not .parse) — same reasoning as the pagination schema in
  // Day 1: it hands back a result object instead of throwing, so we can
  // turn a bad request into our own clean 400 response.
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    // .flatten().fieldErrors turns Zod's internal format into
    // { email: ["..."], password: ["..."] } — easy to loop over.
    const errors = Object.entries(parsed.error.flatten().fieldErrors).map(([field, messages]) => ({
      field,
      message: messages?.[0] ?? "Invalid value",
    }));
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", errors);
  }

  const authUser = await authService.registerUser(parsed.data);

  const body: ApiSuccessResponse<{ user: AuthUser }> = {
    success: true,
    message: "Account created. Check your email to verify your address.",
    data: { user: authUser },
  };
  res.status(201).json(body);
}

// GET /api/v1/auth/verify-email?token=...
export async function verifyEmailHandler(req: Request, res: Response) {
  const token = req.query.token;

  // TYPESCRIPT NOTE: `typeof token !== "string"` — Express types query
  // parameters loosely (a query string COULD technically repeat a key and
  // arrive as an array), so we explicitly check it's the plain string we
  // expect before using it.
  if (typeof token !== "string" || token.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "A verification token is required.");
  }

  await authService.verifyEmail(token);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Email verified. You can now log in.",
    data: null,
  };
  res.status(200).json(body);
}

// POST /api/v1/auth/login
export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid email and password.");
  }

  const { user, accessToken } = await authService.loginUser(parsed.data);

  // res.cookie(name, value, options) — same idea as any cookie-setting
  // you've done before with cookie-parser. maxAge is in milliseconds,
  // which is why we convert "15m" using parseDurationToMs.
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: parseDurationToMs(env.ACCESS_TOKEN_TTL),
  });

  const body: ApiSuccessResponse<{ user: AuthUser }> = {
    success: true,
    message: "Logged in successfully.",
    data: { user },
  };
  res.status(200).json(body);
}

// POST /api/v1/auth/logout
export async function logoutHandler(_req: Request, res: Response) {
  // clearCookie needs to be called with the SAME options (path, etc.) used
  // when the cookie was originally set, or the browser won't remove it.
  res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Logged out.",
    data: null,
  };
  res.status(200).json(body);
}

// GET /api/v1/auth/me  (protected by the requireAuth middleware — see auth.routes.ts)
export async function getMeHandler(req: Request, res: Response) {
  // By the time we get here, requireAuth (auth.middleware.ts) has already
  // confirmed the cookie is valid and attached req.userId for us.
  const user = await User.findById(req.userId);

  if (!user) {
    // Rare edge case: the token was valid, but the user was deleted since
    // it was issued. Treat it the same as "not logged in."
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Your account could not be found.");
  }

  const body: ApiSuccessResponse<{
    user: { id: string; email: string; isEmailVerified: boolean; createdAt: string };
  }> = {
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    },
  };
  res.status(200).json(body);
}
