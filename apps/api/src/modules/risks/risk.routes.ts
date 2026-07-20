// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Wires URLs to controller functions. Mounted at the SAME base path as
// project.routes.ts/task.routes.ts ("/api/v1/organizations" - see app.ts),
// one level deeper: every URL here starts with "/:organizationId/projects/
// :projectId/risks/..." since a risk is PROJECT-level (unlike Day 10's
// org-level Ticket - see risk.model.ts for why).
//
// PERMISSION SPLIT (see PERMISSIONS in shared-types + risk.service.ts):
//   - Reading the register: just active org membership, same as every
//     other module.
//   - Creating/editing/deleting a risk: risk.manage, FLAT, no ownership
//     exception - see risk.service.ts's updateRisk comment for why this is
//     a deliberately different split from Day 10's Ticket.
// ============================================================================

import { Router } from "express";
import { listRisksHandler, createRiskHandler, updateRiskHandler, deleteRiskHandler } from "./risk.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership, requirePermission } from "../organizations/tenant.middleware.js";
import { PERMISSIONS } from "@opssphere/shared-types";

export const riskRouter = Router();

const base = "/:organizationId/projects/:projectId/risks";

riskRouter.get(base, requireAuth, requireOrgMembership, listRisksHandler);
riskRouter.post(
  base,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.RISK_MANAGE),
  createRiskHandler
);
riskRouter.patch(
  `${base}/:riskId`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.RISK_MANAGE),
  updateRiskHandler
);
riskRouter.delete(
  `${base}/:riskId`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.RISK_MANAGE),
  deleteRiskHandler
);
