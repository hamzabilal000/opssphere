// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer, same shape as auth.controller.ts: parse/validate
// req.body, call the service, send a response envelope.
// ============================================================================

import type { Request, Response } from "express";
import { createOrganizationSchema } from "@opssphere/validation";
import type { ApiSuccessResponse, OrganizationSummary, MembershipSummary } from "@opssphere/shared-types";
import * as organizationService from "./organization.service.js";
import { ApiError } from "../../middleware/errorHandler.js";

// POST /api/v1/organizations
export async function createOrganizationHandler(req: Request, res: Response) {
  const parsed = createOrganizationSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = Object.entries(parsed.error.flatten().fieldErrors).map(([field, messages]) => ({
      field,
      message: messages?.[0] ?? "Invalid value",
    }));
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", errors);
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
// by the time this runs, req.organizationId and req.membershipRole are
// already SERVER-VERIFIED (see tenant.middleware.ts), not just copied from
// the URL.
export async function getOrganizationHandler(req: Request, res: Response) {
  const organization = await organizationService.getOrganization(
    req.organizationId ?? "",
    req.membershipRole ?? "member"
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
