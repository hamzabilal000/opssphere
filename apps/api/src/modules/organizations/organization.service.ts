// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The actual business rules for creating and reading organizations - same
// separation as auth.service.ts: this file has no idea what Express is,
// it just takes plain arguments in and returns plain data out.
// ============================================================================

import { Organization } from "./organization.model.js";
import { Membership } from "./membership.model.js";
import { User } from "../auth/user.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { CreateOrganizationInput } from "@opssphere/validation";
import type { OrganizationSummary, MembershipSummary, MembershipRole } from "@opssphere/shared-types";

// ----------------------------------------------------------------------------
// CREATE ORGANIZATION
// ----------------------------------------------------------------------------
export async function createOrganization(
  userId: string,
  input: CreateOrganizationInput
): Promise<OrganizationSummary> {
  const existing = await Organization.findOne({ slug: input.slug });
  if (existing) {
    throw new ApiError(409, "CONFLICT", "That slug is already taken. Try a different one.");
  }

  const org = await Organization.create({
    name: input.name,
    slug: input.slug,
    timeZone: input.timeZone,
    businessHours: input.businessHours,
  });

  // Whoever CREATES an organization automatically becomes its first
  // "owner" - there's no separate "assign an owner" step for Day 4.
  await Membership.create({
    organizationId: org._id,
    userId,
    role: "owner",
    status: "active",
  });

  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    timeZone: org.timeZone,
    businessHours: org.businessHours,
    createdAt: org.createdAt.toISOString(),
    myRole: "owner",
  };
}

// ----------------------------------------------------------------------------
// LIST MY ORGANIZATIONS
// ----------------------------------------------------------------------------
export async function listMyOrganizations(userId: string): Promise<OrganizationSummary[]> {
  // Step 1: find every Membership row for this user (every org they
  // belong to, regardless of role).
  const memberships = await Membership.find({ userId, status: "active" });

  if (memberships.length === 0) return [];

  // Step 2: fetch all those organizations in ONE query using `$in`,
  // rather than one query per membership in a loop - the same "don't
  // query inside a loop" principle you'd apply in any other stack.
  const organizationIds = memberships.map((m) => m.organizationId);
  const orgs = await Organization.find({ _id: { $in: organizationIds } });

  // Step 3: stitch each org together with the CURRENT user's role in it.
  // A plain `Map` here is just a fast lookup table keyed by organization
  // id string, so we don't re-scan `memberships` for every org.
  const roleByOrgId = new Map<string, MembershipRole>(
    memberships.map((m) => [m.organizationId.toString(), m.role])
  );

  return orgs.map((org) => ({
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    timeZone: org.timeZone,
    businessHours: org.businessHours,
    createdAt: org.createdAt.toISOString(),
    myRole: roleByOrgId.get(org._id.toString()) ?? "member",
  }));
}

// ----------------------------------------------------------------------------
// GET ONE ORGANIZATION
// ----------------------------------------------------------------------------
// By the time this runs, tenant.middleware.ts's requireOrgMembership has
// ALREADY confirmed the caller belongs to this org - that's why this
// function doesn't repeat any access checks itself, and why it can safely
// accept `myRole` as a plain argument instead of re-deriving it.
export async function getOrganization(
  organizationId: string,
  myRole: MembershipRole
): Promise<OrganizationSummary> {
  const org = await Organization.findById(organizationId);
  if (!org) {
    // Very unlikely to happen (the membership check already confirmed the
    // org exists), but Organizations could theoretically be deleted later -
    // handling this case now costs nothing and avoids a confusing crash.
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Organization not found.");
  }

  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    timeZone: org.timeZone,
    businessHours: org.businessHours,
    createdAt: org.createdAt.toISOString(),
    myRole,
  };
}

// ----------------------------------------------------------------------------
// LIST MEMBERS OF AN ORGANIZATION
// ----------------------------------------------------------------------------
export async function listMembers(organizationId: string): Promise<MembershipSummary[]> {
  const memberships = await Membership.find({ organizationId }).sort({ createdAt: 1 });
  if (memberships.length === 0) return [];

  const userIds = memberships.map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } });
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return memberships.map((m) => ({
    id: m._id.toString(),
    userId: m.userId.toString(),
    email: emailByUserId.get(m.userId.toString()) ?? "unknown",
    role: m.role,
    status: m.status,
    joinedAt: m.createdAt.toISOString(),
  }));
}
