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
  refreshHandler,
  listSessionsHandler,
  revokeSessionHandler,
  revokeOtherSessionsHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  createInvitationHandler,
  getInvitationPreviewHandler,
  acceptInvitationHandler,
  acceptInvitationAsExistingUserHandler,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

export const authRouter = Router();

// ---- Day 1-2: register / verify / login / logout / me --------------------
authRouter.post("/register", registerHandler);
authRouter.get("/verify-email", verifyEmailHandler);
authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, getMeHandler);

// ---- Day 3: refresh --------------------------------------------------------
// No requireAuth here on purpose — by the time someone calls /refresh,
// their ACCESS token has usually already expired (that's the whole point).
// This route checks the separate, longer-lived refresh cookie itself
// (see auth.controller.ts's refreshHandler).
authRouter.post("/refresh", refreshHandler);

// ---- Day 3: sessions ("where you're logged in") ---------------------------
authRouter.get("/sessions", requireAuth, listSessionsHandler);
authRouter.delete("/sessions/:id", requireAuth, revokeSessionHandler);
authRouter.delete("/sessions", requireAuth, revokeOtherSessionsHandler);

// ---- Day 3: forgot / reset password ----------------------------------------
authRouter.post("/forgot-password", forgotPasswordHandler);
authRouter.post("/reset-password", resetPasswordHandler);

// ---- Day 3: invitations -----------------------------------------------------
// Creating an invitation requires being logged in; previewing/accepting one
// does NOT (the whole point is the invitee doesn't have an account yet).
authRouter.post("/invitations", requireAuth, createInvitationHandler);
authRouter.get("/invitations/:token", getInvitationPreviewHandler);
authRouter.post("/invitations/:token/accept", acceptInvitationHandler);

// ---- Day 15: accepting an invitation as an ALREADY-EXISTING account -------
// The opposite of the route above: THIS one requires being logged in
// (requireAuth) - it's for someone who already has an OpsSphere account
// and is just joining a second organization, not creating a new one.
authRouter.post("/invitations/:token/accept-existing", requireAuth, acceptInvitationAsExistingUserHandler);
