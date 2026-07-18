// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer, same shape as auth.controller.ts: parse/validate
// req.body, call the service, send a response envelope. Day 5 adds a LOT of
// handlers, but every single one follows the exact same three-step shape as
// the Day 4 ones already here - validate, call the service, respond.
// ============================================================================

import type { Request, Response } from "express";
import {
  createOrganizationSchema,
  createRoleSchema,
  createDepartmentSchema,
  createTeamSchema,
  updateMembershipRoleSchema,
  createOrgInvitationSchema,
} from "@opssphere/validation";
import type {
  ApiSuccessResponse,
  OrganizationSummary,
  MembershipSummary,
  RoleSummary,
  DepartmentSummary,
  TeamSummary,
} from "@opssphere/shared-types";
import * as organizationService from "./organization.service.js";
import { ApiError } from "../../middleware/errorHandler.js";

// Small shared helper - every handler below that validates a body uses the
// exact same "turn Zod's error into our field-by-field format" logic, so
// it's pulled out once instead of copy-pasted nine times.
function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return Object.entries(error.flatten().fieldErrors).map(([field, messages]) => ({
    field,
    message: messages?.[0] ?? "Invalid value",
  }));
}

// ----------------------------------------------------------------------------
// ORGANIZATIONS  (Day 4, unchanged in shape)
// ----------------------------------------------------------------------------

// POST /api/v1/organizations
export async function createOrganizationHandler(req: Request, res: Response) {
  const parsed = createOrganizationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const organization = await organizationService.createOrganization(req.userId ?? "", parsed.data);

  const body: ApiSuccessResponse<{ organization: OrganizationSummary }> = {
    success: true,
    message: "Organization created.",
    data: { organization },
  };
  res.status(201).json(body);
}

// GET /api/v1/organizations
export async function listMyOrganizationsHandler(req: Request, res: Response) {
  const organizations = await organizationService.listMyOrganizations(req.userId ?? "");

  const body: ApiSuccessResponse<{ organizations: OrganizationSummary[] }> = {
    success: true,
    data: { organizations },
  };
  res.status(200).json(body);
}

// GET /api/v1/organizations/:organizationId
// Protected by requireAuth + requireOrgMembership (see organization.routes.ts) -
// by the time this runs, req.organizationId and req.membershipRoleName are
// already SERVER-VERIFIED (see tenant.middleware.ts), not just copied from
// the URL.
export async function getOrganizationHandler(req: Request, res: Response) {
  const organization = await organizationService.getOrganization(
    req.organizationId ?? "",
    req.membershipRoleName ?? "Member"
  );

  const body: ApiSuccessResponse<{ organization: OrganizationSummary }> = {
    success: true,
    data: { organization },
  };
  res.status(200).json(body);
}

// GET /api/v1/organizations/:organizationId/members
export async function listMembersHandler(req: Request, res: Response) {
  const members = await organizationService.listMembers(req.organizationId ?? "");

  const body: ApiSuccessResponse<{ members: MembershipSummary[] }> = {
    success: true,
    data: { members },
  };
  res.status(200).json(body);
}

// PATCH /api/v1/organizations/:organizationId/members/:membershipId
export async function updateMemberRoleHandler(req: Request, res: Response) {
  const parsed = updateMembershipRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  await organizationService.updateMemberRole(
    req.organizationId ?? "",
    String(req.params.membershipId ?? ""),
    parsed.data.roleId,
    req.userId ?? ""
  );

  const body: ApiSuccessResponse<null> = { success: true, message: "Member role updated.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// ROLES  (Day 5, new)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/roles
export async function listRolesHandler(req: Request, res: Response) {
  const roles = await organizationService.listRoles(req.organizationId ?? "");
  const body: ApiSuccessResponse<{ roles: RoleSummary[] }> = { success: true, data: { roles } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/roles
export async function createRoleHandler(req: Request, res: Response) {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const role = await organizationService.createRole(req.organizationId ?? "", parsed.data);
  const body: ApiSuccessResponse<{ role: RoleSummary }> = {
    success: true,
    message: "Role created.",
    data: { role },
  };
  res.status(201).json(body);
}

// DELETE /api/v1/organizations/:organizationId/roles/:roleId
export async function deleteRoleHandler(req: Request, res: Response) {
  await organizationService.deleteRole(req.organizationId ?? "", String(req.params.roleId ?? ""));
  const body: ApiSuccessResponse<null> = { success: true, message: "Role deleted.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// DEPARTMENTS  (Day 5, new)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/departments
export async function listDepartmentsHandler(req: Request, res: Response) {
  const departments = await organizationService.listDepartments(req.organizationId ?? "");
  const body: ApiSuccessResponse<{ departments: DepartmentSummary[] }> = {
    success: true,
    data: { departments },
  };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/departments
export async function createDepartmentHandler(req: Request, res: Response) {
  const parsed = createDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const department = await organizationService.createDepartment(req.organizationId ?? "", parsed.data);
  const body: ApiSuccessResponse<{ department: DepartmentSummary }> = {
    success: true,
    message: "Department created.",
    data: { department },
  };
  res.status(201).json(body);
}

// DELETE /api/v1/organizations/:organizationId/departments/:departmentId
export async function deleteDepartmentHandler(req: Request, res: Response) {
  await organizationService.deleteDepartment(req.organizationId ?? "", String(req.params.departmentId ?? ""));
  const body: ApiSuccessResponse<null> = { success: true, message: "Department deleted.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// TEAMS  (Day 5, new)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/teams
export async function listTeamsHandler(req: Request, res: Response) {
  const teams = await organizationService.listTeams(req.organizationId ?? "");
  const body: ApiSuccessResponse<{ teams: TeamSummary[] }> = { success: true, data: { teams } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/teams
export async function createTeamHandler(req: Request, res: Response) {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const team = await organizationService.createTeam(req.organizationId ?? "", parsed.data);
  const body: ApiSuccessResponse<{ team: TeamSummary }> = {
    success: true,
    message: "Team created.",
    data: { team },
  };
  res.status(201).json(body);
}

// DELETE /api/v1/organizations/:organizationId/teams/:teamId
export async function deleteTeamHandler(req: Request, res: Response) {
  await organizationService.deleteTeam(req.organizationId ?? "", String(req.params.teamId ?? ""));
  const body: ApiSuccessResponse<null> = { success: true, message: "Team deleted.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// ORG-SCOPED INVITATIONS  (Day 5, new)
// ----------------------------------------------------------------------------

// POST /api/v1/organizations/:organizationId/invitations
export async function createOrgInvitationHandler(req: Request, res: Response) {
  const parsed = createOrgInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  await organizationService.createOrgInvitation(req.organizationId ?? "", req.userId ?? "", parsed.data);

  const body: ApiSuccessResponse<null> = { success: true, message: "Invitation sent.", data: null };
  res.status(201).json(body);
}
