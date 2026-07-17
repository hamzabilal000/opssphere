// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Same job as one of your route files (e.g. teacher.route.js): wire up URLs
// to controller functions. One note worth calling out — in Express 5
// (what this project uses), if an `async` route handler throws or rejects,
// Express AUTOMATICALLY forwards that error to our errorHandler (Day 1)
// by itself. In Express 4 you'd have to manually wrap every async handler
// in a try/catch and call next(err) yourself — Express 5 removed that
// requirement, which is why none of our controller functions do that here.
// ============================================================================

import { Router } from "express";
import {
  registerHandler,
  verifyEmailHandler,
  loginHandler,
  logoutHandler,
  getMeHandler,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", registerHandler);
authRouter.get("/verify-email", verifyEmailHandler);
authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);

// `requireAuth` runs BEFORE `getMeHandler` — if the cookie is missing or
// invalid, requireAuth throws before getMeHandler ever runs.
authRouter.get("/me", requireAuth, getMeHandler);
