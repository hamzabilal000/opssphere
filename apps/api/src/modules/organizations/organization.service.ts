// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The actual business rules for organizations, roles, departments, teams,
// and org-scoped invitations - same separation as auth.service.ts: this
// file has no idea what Express is, it just takes plain arguments in and
// returns plain data out.
// ============================================================================

import { Organization } from "./organization.model.js";
import { Membership } from "./membership.model.js";
import { Role } from "./role.model.js";
import { Department } from "./department.model.js";
import { Team } from "./team.model.js";
import { User } from "../auth/user.model.js";
import { Invitation } from "../auth/invitation.model.js";
import { generateOneTimeToken } from "../auth/auth.tokens.js";
import { sendInvitationEmail } from "../../lib/mailer.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import { ALL_PERMISSIONS } from "@opssphere/shared-types";
import type {
  CreateOrganizationInput,
  CreateRoleInput,
  CreateDepartmentInput,
  CreateTeamInput,
  CreateOrgInvitationInput,
} from "@opssphere/validation";
import type { OrganizationSummary, MembershipSummary, RoleSummary, DepartmentSummary, TeamSummary } from "@opssphere/shared-types";

const INVITATION_TOKEN_TTL_DAYS = 7;

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

  // DAY 5: every new organization gets two SYSTEM roles seeded
  // automatically - "Owner" (every permission that exists) and "Member"
  // (no permissions - a safe, do-nothing-special-yet baseline). Nothing
  // stops an admin from creating more roles later; these two just always
  // exist so there's never a moment where an org has no roles at all.
  const [ownerRole] = await Promise.all([
    Role.create({ organizationId: org._id, name: "Owner", permissions: ALL_PERMISSIONS, isSystemRole: true }),
    Role.create({ organizationId: org._id, name: "Member", permissions: [], isSystemRole: true }),
  ]);

  // Whoever CREATES an organization automatically becomes its first
  // "Owner" - there's no separate "assign an owner" step for Day 4/5.
  await Membership.create({
    organizationId: org._id,
    userId,
    roleId: ownerRole._id,
    status: "active",
  });

  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    timeZone: org.timeZone,
    businessHours: org.businessHours,
    createdAt: org.createdAt.toISOString(),
    myRole: "Owner",
  };
}

// ----------------------------------------------------------------------------
// LIST MY ORGANIZATIONS
// ----------------------------------------------------------------------------
export async function listMyOrganizations(userId: string): Promise<OrganizationSummary[]> {
  const memberships = await Membership.find({ userId, status: "active" });
  if (memberships.length === 0) return [];

  const organizationIds = memberships.map((m) => m.organizationId);
  const roleIds = memberships.map((m) => m.roleId);

  // Two `$in` queries instead of one query per membership in a loop - same
  // "don't query inside a loop" principle as Day 4.
  const [orgs, roles] = await Promise.all([
    Organization.find({ _id: { $in: organizationIds } }),
    Role.find({ _id: { $in: roleIds } }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r._id.toString(), r.name]));
  const roleIdByOrgId = new Map(memberships.map((m) => [m.organizationId.toString(), m.roleId.toString()]));

  return orgs.map((org) => {
    const roleId = roleIdByOrgId.get(org._id.toString());
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      timeZone: org.timeZone,
      businessHours: org.businessHours,
      createdAt: org.createdAt.toISOString(),
      myRole: (roleId && roleNameById.get(roleId)) ?? "Member",
    };
  });
}

// ----------------------------------------------------------------------------
// GET ONE ORGANIZATION
// ----------------------------------------------------------------------------
// By the time this runs, tenant.middleware.ts's requireOrgMembership has
// ALREADY confirmed the caller belongs to this org - that's why this
// function doesn't repeat any access checks itself, and why it can safely
// accept `myRoleName` as a plain argument instead of re-deriving it.
export async function getOrganization(organizationId: string, myRoleName: string): Promise<OrganizationSummary> {
  const org = await Organization.findById(organizationId);
  if (!org) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Organization not found.");
  }

  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    timeZone: org.timeZone,
    businessHours: org.businessHours,
    createdAt: org.createdAt.toISOString(),
    myRole: myRoleName,
  };
}

// ----------------------------------------------------------------------------
// LIST MEMBERS OF AN ORGANIZATION
// ----------------------------------------------------------------------------
export async function listMembers(organizationId: string): Promise<MembershipSummary[]> {
  const memberships = await Membership.find({ organizationId }).sort({ createdAt: 1 });
  if (memberships.length === 0) return [];

  const userIds = memberships.map((m) => m.userId);
  const roleIds = memberships.map((m) => m.roleId);
  const [users, roles] = await Promise.all([
    User.find({ _id: { $in: userIds } }),
    Role.find({ _id: { $in: roleIds } }),
  ]);
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));
  const roleNameById = new Map(roles.map((r) => [r._id.toString(), r.name]));

  return memberships.map((m) => ({
    id: m._id.toString(),
    userId: m.userId.toString(),
    email: emailByUserId.get(m.userId.toString()) ?? "unknown",
    roleId: m.roleId.toString(),
    roleName: roleNameById.get(m.roleId.toString()) ?? "unknown",
    status: m.status,
    joinedAt: m.createdAt.toISOString(),
  }));
}

// ----------------------------------------------------------------------------
// UPDATE A MEMBER'S ROLE  (with the "last owner can't demote themselves" rule)
// ----------------------------------------------------------------------------
export async function updateMemberRole(
  organizationId: string,
  membershipId: string,
  newRoleId: string,
  actingUserId: string
): Promise<void> {
  const membership = await Membership.findOne({ _id: membershipId, organizationId });
  if (!membership) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Member not found.");
  }

  const newRole = await Role.findOne({ _id: newRoleId, organizationId });
  if (!newRole) {
    throw new ApiError(400, "VALIDATION_ERROR", "That role does not belong to this organization.");
  }

  // THE SRS RULE: "The last remaining owner can't demote themselves." We
  // only need to check this if (a) it's the ACTING user changing their OWN
  // role, and (b) their CURRENT role is the system "Owner" role, and
  // (c) the new role is something other than Owner.
  const currentRole = await Role.findById(membership.roleId);
  const isActingUserOwnMembership = membership.userId.toString() === actingUserId;
  const isCurrentlyOwner = currentRole?.name === "Owner" && currentRole.isSystemRole;
  const isDemotingAwayFromOwner = newRole.name !== "Owner" || !newRole.isSystemRole;

  if (isActingUserOwnMembership && isCurrentlyOwner && isDemotingAwayFromOwner) {
    const ownerRole = await Role.findOne({ organizationId, name: "Owner", isSystemRole: true });
    const ownerCount = ownerRole
      ? await Membership.countDocuments({ organizationId, roleId: ownerRole._id, status: "active" })
      : 0;

    if (ownerCount <= 1) {
      throw new ApiError(
        409,
        "CONFLICT",
        "You're the last owner of this organization - promote someone else to Owner first."
      );
    }
  }

  membership.roleId = newRole._id;
  await membership.save();
}

// ----------------------------------------------------------------------------
// ROLES
// ----------------------------------------------------------------------------
export async function listRoles(organizationId: string): Promise<RoleSummary[]> {
  const roles = await Role.find({ organizationId }).sort({ createdAt: 1 });
  return roles.map((r) => ({
    id: r._id.toString(),
    name: r.name,
    permissions: r.permissions,
    isSystemRole: r.isSystemRole,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createRole(organizationId: string, input: CreateRoleInput): Promise<RoleSummary> {
  const existing = await Role.findOne({ organizationId, name: input.name });
  if (existing) {
    throw new ApiError(409, "CONFLICT", "A role with that name already exists in this organization.");
  }

  const role = await Role.create({
    organizationId,
    name: input.name,
    permissions: input.permissions,
    isSystemRole: false, // only createOrganization's seeding step can create a system role
  });

  return {
    id: role._id.toString(),
    name: role.name,
    permissions: role.permissions,
    isSystemRole: role.isSystemRole,
    createdAt: role.createdAt.toISOString(),
  };
}

export async function deleteRole(organizationId: string, roleId: string): Promise<void> {
  const role = await Role.findOne({ _id: roleId, organizationId });
  if (!role) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Role not found.");
  }

  if (role.isSystemRole) {
    throw new ApiError(409, "CONFLICT", "The built-in Owner and Member roles can't be deleted.");
  }

  // Referential-integrity check: don't delete a role that's still assigned
  // to someone - that would leave a Membership pointing at nothing. This
  // is the same idea as a foreign-key constraint in SQL, just enforced by
  // hand since MongoDB doesn't have one built in.
  const inUseCount = await Membership.countDocuments({ organizationId, roleId });
  if (inUseCount > 0) {
    throw new ApiError(
      409,
      "CONFLICT",
      `This role is still assigned to ${inUseCount} member(s). Reassign them first.`
    );
  }

  await role.deleteOne();
}

// ----------------------------------------------------------------------------
// DEPARTMENTS
// ----------------------------------------------------------------------------
export async function listDepartments(organizationId: string): Promise<DepartmentSummary[]> {
  const departments = await Department.find({ organizationId }).sort({ createdAt: 1 });
  return departments.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function createDepartment(
  organizationId: string,
  input: CreateDepartmentInput
): Promise<DepartmentSummary> {
  const existing = await Department.findOne({ organizationId, name: input.name });
  if (existing) {
    throw new ApiError(409, "CONFLICT", "A department with that name already exists.");
  }

  const department = await Department.create({ organizationId, name: input.name });
  return { id: department._id.toString(), name: department.name, createdAt: department.createdAt.toISOString() };
}

export async function deleteDepartment(organizationId: string, departmentId: string): Promise<void> {
  const department = await Department.findOne({ _id: departmentId, organizationId });
  if (!department) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Department not found.");
  }

  const teamsUsingIt = await Team.countDocuments({ organizationId, departmentId });
  if (teamsUsingIt > 0) {
    throw new ApiError(409, "CONFLICT", `This department still has ${teamsUsingIt} team(s) in it.`);
  }

  await department.deleteOne();
}

// ----------------------------------------------------------------------------
// TEAMS
// ----------------------------------------------------------------------------
export async function listTeams(organizationId: string): Promise<TeamSummary[]> {
  const teams = await Team.find({ organizationId }).sort({ createdAt: 1 });
  return teams.map((t) => ({
    id: t._id.toString(),
    name: t.name,
    departmentId: t.departmentId?.toString(),
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function createTeam(organizationId: string, input: CreateTeamInput): Promise<TeamSummary> {
  const existing = await Team.findOne({ organizationId, name: input.name });
  if (existing) {
    throw new ApiError(409, "CONFLICT", "A team with that name already exists.");
  }

  if (input.departmentId) {
    const department = await Department.findOne({ _id: input.departmentId, organizationId });
    if (!department) {
      throw new ApiError(400, "VALIDATION_ERROR", "That department does not belong to this organization.");
    }
  }

  const team = await Team.create({ organizationId, name: input.name, departmentId: input.departmentId });
  return {
    id: team._id.toString(),
    name: team.name,
    departmentId: team.departmentId?.toString(),
    createdAt: team.createdAt.toISOString(),
  };
}

export async function deleteTeam(organizationId: string, teamId: string): Promise<void> {
  const team = await Team.findOne({ _id: teamId, organizationId });
  if (!team) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Team not found.");
  }
  await team.deleteOne();
}

// ----------------------------------------------------------------------------
// ORG-SCOPED INVITATIONS  (Day 3 built plain, org-less invitations - this
// is the "wired up fully" version the Day 5 plan calls for: an invitation
// now carries WHICH organization and WHICH role the invitee will get.)
// ----------------------------------------------------------------------------
export async function createOrgInvitation(
  organizationId: string,
  invitedByUserId: string,
  input: CreateOrgInvitationInput
): Promise<void> {
  const role = await Role.findOne({ _id: input.roleId, organizationId });
  if (!role) {
    throw new ApiError(400, "VALIDATION_ERROR", "That role does not belong to this organization.");
  }

  const org = await Organization.findById(organizationId);
  if (!org) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Organization not found.");
  }

  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) {
    const alreadyMember = await Membership.findOne({ organizationId, userId: existingUser._id });
    if (alreadyMember) {
      throw new ApiError(409, "CONFLICT", "That person is already a member of this organization.");
    }
    // NOTE: Day 5 keeps this simple and doesn't yet support inviting an
    // EXISTING OpsSphere user (who already has a password) into a second
    // organization - acceptInvitation (auth.service.ts) always creates a
    // brand new account. Supporting "join a second org with your existing
    // login" is a reasonable Day 6+ improvement, called out here rather
    // than silently mishandled.
    throw new ApiError(
      409,
      "CONFLICT",
      "An account with this email already exists. Inviting existing users into a second organization isn't supported yet."
    );
  }

  const { rawToken, tokenHash } = generateOneTimeToken();
  const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await Invitation.create({
    email: input.email,
    tokenHash,
    status: "pending",
    invitedByUserId,
    expiresAt,
    organizationId: org._id,
    roleId: role._id,
  });

  const acceptUrl = `${env.WEB_ORIGIN}/accept-invitation?token=${rawToken}`;
  await sendInvitationEmail(input.email, acceptUrl);
}
