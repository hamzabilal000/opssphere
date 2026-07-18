// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Wires URLs to controller functions - same pattern as auth.routes.ts. Two
// middlewares can now chain in front of a handler:
//   1. requireAuth              - are you logged in at all?
//   2. requireOrgMembership     - are you logged in AND a member of THIS org?
//   3. requirePermission(...)   - AND does your role specifically allow this?
// Order matters - each one depends on data the previous one set on `req`.
// ============================================================================

import { Router } from "express";
import {
  createOrganizationHandler,
  listMyOrganizationsHandler,
  getOrganizationHandler,
  listMembersHandler,
  updateMemberRoleHandler,
  listRolesHandler,
  createRoleHandler,
  deleteRoleHandler,
  listDepartmentsHandler,
  createDepartmentHandler,
  deleteDepartmentHandler,
  listTeamsHandler,
  createTeamHandler,
  deleteTeamHandler,
  createOrgInvitationHandler,
} from "./organization.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership, requirePermission } from "./tenant.middleware.js";
import { PERMISSIONS } from "@opssphere/shared-types";

export const organizationRouter = Router();

// No :organizationId yet - these two just need "are you logged in at all."
organizationRouter.post("/", requireAuth, createOrganizationHandler);
organizationRouter.get("/", requireAuth, listMyOrganizationsHandler);

// ---- Reads: any active member can see these (no requirePermission) --------
organizationRouter.get("/:organizationId", requireAuth, requireOrgMembership, getOrganizationHandler);
organizationRouter.get(
  "/:organizationId/members",
  requireAuth,
  requireOrgMembership,
  listMembersHandler
);
organizationRouter.get("/:organizationId/roles", requireAuth, requireOrgMembership, listRolesHandler);
organizationRouter.get(
  "/:organizationId/departments",
  requireAuth,
  requireOrgMembership,
  listDepartmentsHandler
);
organizationRouter.get("/:organizationId/teams", requireAuth, requireOrgMembership, listTeamsHandler);

// ---- Writes: membership alone isn't enough - the role must specifically
// grant the matching permission (see tenant.middleware.ts's requirePermission,
// and PERMISSIONS in shared-types for the full catalog) -------------------
organizationRouter.patch(
  "/:organizationId/members/:membershipId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.MEMBER_ROLE_UPDATE),
  updateMemberRoleHandler
);

organizationRouter.post(
  "/:organizationId/roles",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.ROLE_MANAGE),
  createRoleHandler
);
organizationRouter.delete(
  "/:organizationId/roles/:roleId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.ROLE_MANAGE),
  deleteRoleHandler
);

organizationRouter.post(
  "/:organizationId/departments",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  createDepartmentHandler
);
organizationRouter.delete(
  "/:organizationId/departments/:departmentId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  deleteDepartmentHandler
);

organizationRouter.post(
  "/:organizationId/teams",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TEAM_MANAGE),
  createTeamHandler
);
organizationRouter.delete(
  "/:organizationId/teams/:teamId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TEAM_MANAGE),
  deleteTeamHandler
);

organizationRouter.post(
  "/:organizationId/invitations",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.MEMBER_INVITE),
  createOrgInvitationHandler
);
