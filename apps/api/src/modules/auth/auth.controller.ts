// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the Express-facing layer: read req.body, call the actual logic
// (auth.service.ts), and send a response. Directly comparable to your usual
// controller functions — same shape, same job. The main style difference
// from your usual pattern: instead of manually writing
//     if (!field1 || !field2) return res.status(400).json({...})
// we let Zod (see packages/validation) check the whole shape of req.body in
// one line, and instead of a manual try/catch in every function, unexpected
// errors get caught centrally (see Day 1's errorHandler.ts) — but we still
// throw our own ApiError for EXPECTED problems (bad input, wrong password).
// ============================================================================

import type { Request, Response } from "express";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createInvitationSchema,
  acceptInvitationSchema,
} from "@opssphere/validation";
import type { ApiSuccessResponse, AuthUser, SessionSummary, InvitationPreview } from "@opssphere/shared-types";
import * as authService from "./auth.service.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { parseDurationToMs } from "./auth.tokens.js";
import { env } from "../../config/env.js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./auth.middleware.js";
import { User } from "./user.model.js";

// Shared cookie settings for the ACCESS token — sent with every request
// (path: "/"), short-lived.
const accessCookieOptions = {
  httpOnly: true, // JavaScript in the browser can NEVER read this cookie — only the browser + server can
  secure: env.COOKIE_SECURE, // true in production (HTTPS only), false for local http:// development
  sameSite: "lax" as const, // a sensible default that still allows normal navigation-based flows
  path: "/",
};

// DAY 3: the REFRESH token gets its OWN cookie, scoped to only the auth
// routes (path: "/api/v1/auth") and living much longer. Splitting these
// into two cookies (rather than reusing one) means the browser only ever
// sends the long-lived, more sensitive token to the small set of routes
// that actually need it.
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/api/v1/auth",
};

// Small helper used by every handler that logs someone in (login, refresh,
// accept-invitation) — sets BOTH cookies at once so we never forget one.
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...accessCookieOptions,
    maxAge: parseDurationToMs(env.ACCESS_TOKEN_TTL),
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...refreshCookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, accessCookieOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions);
}

// Pulls the two pieces of "which device is this" info out of the request,
// to store alongside a Session. Neither is guaranteed to be present, which
// is exactly why SessionContext (auth.service.ts) marks both optional.
function getSessionContext(req: Request): authService.SessionContext {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  };
}

// ----------------------------------------------------------------------------
// REGISTER / VERIFY EMAIL  (unchanged from Day 2)
// ----------------------------------------------------------------------------

// POST /api/v1/auth/register
export async function registerHandler(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
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

// ----------------------------------------------------------------------------
// LOGIN / LOGOUT / ME  (updated for sessions + refresh tokens)
// ----------------------------------------------------------------------------

// POST /api/v1/auth/login
export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid email and password.");
  }

  const { user, accessToken, refreshToken } = await authService.loginUser(
    parsed.data,
    getSessionContext(req)
  );

  setAuthCookies(res, accessToken, refreshToken);

  const body: ApiSuccessResponse<{ user: AuthUser }> = {
    success: true,
    message: "Logged in successfully.",
    data: { user },
  };
  res.status(200).json(body);
}

// POST /api/v1/auth/logout
export async function logoutHandler(req: Request, res: Response) {
  // DAY 3: also revoke the session server-side, not just clear the
  // cookies. If we only cleared cookies, a copy of the refresh token
  // (stolen, or saved somewhere) would still work against /refresh even
  // after the user clicked "log out."
  if (req.sessionId) {
    await authService.revokeSession(req.userId ?? "", req.sessionId).catch(() => {
      // If the session was already gone/revoked, that's fine — logout
      // should always succeed from the user's point of view.
    });
  }

  clearAuthCookies(res);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Logged out.",
    data: null,
  };
  res.status(200).json(body);
}

// GET /api/v1/auth/me  (protected by the requireAuth middleware — see auth.routes.ts)
export async function getMeHandler(req: Request, res: Response) {
  const user = await User.findById(req.userId);

  if (!user) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Your account could not be found.");
  }

  const body: ApiSuccessResponse<{ user: AuthUser }> = {
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

// ----------------------------------------------------------------------------
// REFRESH  (new for Day 3)
// ----------------------------------------------------------------------------

// POST /api/v1/auth/refresh
export async function refreshHandler(req: Request, res: Response) {
  const rawRefreshToken = req.cookies[REFRESH_TOKEN_COOKIE];

  if (typeof rawRefreshToken !== "string" || rawRefreshToken.length === 0) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please log in again.");
  }

  const { accessToken, refreshToken } = await authService.refreshSession(
    rawRefreshToken,
    getSessionContext(req)
  );

  setAuthCookies(res, accessToken, refreshToken);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Session refreshed.",
    data: null,
  };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// SESSIONS  (new for Day 3) — all three routes are protected by requireAuth
// ----------------------------------------------------------------------------

// GET /api/v1/auth/sessions
export async function listSessionsHandler(req: Request, res: Response) {
  const sessions = await authService.listSessions(req.userId ?? "", req.sessionId ?? null);

  const body: ApiSuccessResponse<{ sessions: SessionSummary[] }> = {
    success: true,
    data: { sessions },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/auth/sessions/:id
export async function revokeSessionHandler(req: Request, res: Response) {
  // TYPESCRIPT NOTE: Express types a route param as possibly `string[]`
  // (repeated-segment routes like "/:id+" could produce an array) even
  // though OUR route ("/sessions/:id") only ever produces a plain string.
  // `String(...)` guarantees a single string either way, satisfying the
  // compiler without changing real behavior for this route.
  const sessionId = String(req.params.id ?? "");
  await authService.revokeSession(req.userId ?? "", sessionId);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Session revoked.",
    data: null,
  };
  res.status(200).json(body);
}

// DELETE /api/v1/auth/sessions  ("log out everywhere else")
export async function revokeOtherSessionsHandler(req: Request, res: Response) {
  await authService.revokeOtherSessions(req.userId ?? "", req.sessionId ?? "");

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "All other sessions were logged out.",
    data: null,
  };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// FORGOT PASSWORD / RESET PASSWORD  (new for Day 3)
// ----------------------------------------------------------------------------

// POST /api/v1/auth/forgot-password
export async function forgotPasswordHandler(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid email address.");
  }

  await authService.forgotPassword(parsed.data.email);

  // NEUTRAL MESSAGE ON PURPOSE — see the big comment in auth.service.ts's
  // forgotPassword function. This exact same message is returned whether
  // or not an account with that email actually exists.
  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
    data: null,
  };
  res.status(200).json(body);
}

// POST /api/v1/auth/reset-password
export async function resetPasswordHandler(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = Object.entries(parsed.error.flatten().fieldErrors).map(([field, messages]) => ({
      field,
      message: messages?.[0] ?? "Invalid value",
    }));
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", errors);
  }

  await authService.resetPassword(parsed.data.token, parsed.data.password);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Password reset. Please log in with your new password.",
    data: null,
  };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// INVITATIONS  (new for Day 3)
// ----------------------------------------------------------------------------

// POST /api/v1/auth/invitations  (protected by requireAuth)
export async function createInvitationHandler(req: Request, res: Response) {
  const parsed = createInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid email address.");
  }

  await authService.createInvitation(req.userId ?? "", parsed.data.email);

  const body: ApiSuccessResponse<null> = {
    success: true,
    message: "Invitation sent.",
    data: null,
  };
  res.status(201).json(body);
}

// GET /api/v1/auth/invitations/:token  (public — the invitee isn't logged in yet)
export async function getInvitationPreviewHandler(req: Request, res: Response) {
  const preview = await authService.getInvitationPreview(String(req.params.token ?? ""));

  const body: ApiSuccessResponse<InvitationPreview> = {
    success: true,
    data: preview,
  };
  res.status(200).json(body);
}

// POST /api/v1/auth/invitations/:token/accept  (public)
export async function acceptInvitationHandler(req: Request, res: Response) {
  const parsed = acceptInvitationSchema.safeParse({ token: req.params.token, password: req.body.password });
  if (!parsed.success) {
    const errors = Object.entries(parsed.error.flatten().fieldErrors).map(([field, messages]) => ({
      field,
      message: messages?.[0] ?? "Invalid value",
    }));
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", errors);
  }

  const { user, accessToken, refreshToken } = await authService.acceptInvitation(
    parsed.data.token,
    parsed.data.password,
    getSessionContext(req)
  );

  setAuthCookies(res, accessToken, refreshToken);

  const body: ApiSuccessResponse<{ user: AuthUser }> = {
    success: true,
    message: "Account created. You're now logged in.",
    data: { user },
  };
  res.status(201).json(body);
}

// POST /api/v1/auth/invitations/:token/accept-existing  (protected by
// requireAuth - DAY 15's "join a second organization" route. No password
// in the body at all: proving who you are comes from already being
// logged in, not from this endpoint.)
export async function acceptInvitationAsExistingUserHandler(req: Request, res: Response) {
  const { organizationId } = await authService.acceptInvitationAsExistingUser(
    String(req.params.token ?? ""),
    req.userId ?? ""
  );

  const body: ApiSuccessResponse<{ organizationId: string }> = {
    success: true,
    message: "Invitation accepted.",
    data: { organizationId },
  };
  res.status(200).json(body);
}
