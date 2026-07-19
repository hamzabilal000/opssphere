// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Wires URLs to controller functions. Mounted at the SAME base path as
// organization.routes.ts ("/api/v1/organizations" - see app.ts) but as its
// own separate router, since projects are their own feature module even
// though every URL here still starts with "/:organizationId/projects" -
// every route needs requireAuth + requireOrgMembership first, exactly like
// Day 4-5's organization routes, since a project can never be reached
// without first proving you belong to the organization that owns it.
// ============================================================================

import { Router } from "express";
import {
  createProjectHandler,
  listProjectsHandler,
  getProjectHandler,
  updateProjectHandler,
  listProjectMembersHandler,
  addProjectMemberHandler,
  removeProjectMemberHandler,
  listMilestonesHandler,
  createMilestoneHandler,
  updateMilestoneHandler,
  deleteMilestoneHandler,
} from "./project.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership, requirePermission } from "../organizations/tenant.middleware.js";
import { PERMISSIONS } from "@opssphere/shared-types";

export const projectRouter = Router();

// ---- Reads: any active org member can see projects -------------------------
projectRouter.get("/:organizationId/projects", requireAuth, requireOrgMembership, listProjectsHandler);
projectRouter.get(
  "/:organizationId/projects/:projectId",
  requireAuth,
  requireOrgMembership,
  getProjectHandler
);
projectRouter.get(
  "/:organizationId/projects/:projectId/members",
  requireAuth,
  requireOrgMembership,
  listProjectMembersHandler
);
projectRouter.get(
  "/:organizationId/projects/:projectId/milestones",
  requireAuth,
  requireOrgMembership,
  listMilestonesHandler
);

// ---- Writes: membership alone isn't enough - see PERMISSIONS in
// shared-types and requirePermission in tenant.middleware.ts -------------
projectRouter.post(
  "/:organizationId/projects",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_CREATE),
  createProjectHandler
);
projectRouter.patch(
  "/:organizationId/projects/:projectId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_MANAGE),
  updateProjectHandler
);

projectRouter.post(
  "/:organizationId/projects/:projectId/members",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_MEMBER_MANAGE),
  addProjectMemberHandler
);
projectRouter.delete(
  "/:organizationId/projects/:projectId/members/:memberId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_MEMBER_MANAGE),
  removeProjectMemberHandler
);

projectRouter.post(
  "/:organizationId/projects/:projectId/milestones",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_MANAGE),
  createMilestoneHandler
);
projectRouter.patch(
  "/:organizationId/projects/:projectId/milestones/:milestoneId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_MANAGE),
  updateMilestoneHandler
);
projectRouter.delete(
  "/:organizationId/projects/:projectId/milestones/:milestoneId",
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.PROJECT_MANAGE),
  deleteMilestoneHandler
);
