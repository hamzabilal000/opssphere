// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Wires URLs to controller functions - same pattern as auth.routes.ts. The
// one new thing here: routes with a `:organizationId` segment get a SECOND
// middleware, `requireOrgMembership`, chained in after `requireAuth`. Order
// matters - requireAuth must run first so `req.userId` exists before
// requireOrgMembership tries to use it.
// ============================================================================

import { Router } from "express";
import {
  createOrganizationHandler,
  listMyOrganizationsHandler,
  getOrganizationHandler,
  listMembersHandler,
} from "./organization.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership } from "./tenant.middleware.js";

export const organizationRouter = Router();

// No :organizationId yet - these two just need "are you logged in at all."
organizationRouter.post("/", requireAuth, createOrganizationHandler);
organizationRouter.get("/", requireAuth, listMyOrganizationsHandler);

// These two need "are you logged in AND actually a member of THIS org" -
// requireOrgMembership is what makes that second check real (see
// tenant.middleware.ts).
organizationRouter.get("/:organizationId", requireAuth, requireOrgMembership, getOrganizationHandler);
organizationRouter.get(
  "/:organizationId/members",
  requireAuth,
  requireOrgMembership,
  listMembersHandler
);
