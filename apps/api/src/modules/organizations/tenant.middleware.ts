// ============================================================================
// WHAT THIS FILE DOES (in plain English) - THE MOST IMPORTANT FILE IN DAY 4,
// EXTENDED FOR DAY 5
// ----------------------------------------------------------------------------
// This file has TWO middlewares now:
//
// 1. requireOrgMembership (Day 4) - for any URL shaped like
//    /api/v1/organizations/:organizationId/..., confirm the logged-in user
//    is ACTUALLY a member of that exact organization before letting the
//    request continue. As of Day 5, it ALSO loads that member's Role and
//    attaches its permissions to the request, since almost every route
//    needs both checks together anyway.
//
// 2. requirePermission (Day 5, new) - a step FURTHER than membership: not
//    just "are you a member" but "does your role specifically allow THIS
//    action." This is what makes the Day 5 acceptance test work: "an admin
//    creates a custom role with two permissions, assigns it, and a user
//    without one of those permissions gets a clean 403."
//
// THE GOLDEN RULE THIS FILE ENFORCES (straight from the SRS):
//   "Never trust an organization ID that comes from the client. Always
//    re-derive it from the logged-in user's session, and re-check it
//    against the record being accessed."
//   "Enforce permissions on the backend - hiding a button on the frontend
//    is a UX nicety, never real security."
// ============================================================================

import type { NextFunction, Request, Response } from "express";
import { Membership } from "./membership.model.js";
import { Role } from "./role.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { Permission } from "@opssphere/shared-types";

// Same "augment Express's Request type" pattern used in auth.middleware.ts -
// every request now optionally carries the SERVER-VERIFIED organization id,
// the caller's role name, and their permissions list. Every later module
// (projects, tickets, ...) should read `req.organizationId` for its
// queries - NEVER `req.params.organizationId` directly - precisely because
// this file is what proves the former is safe to trust and the latter, on
// its own, is not.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      organizationId?: string;
      membershipId?: string;
      membershipRoleId?: string;
      membershipRoleName?: string;
      membershipPermissions?: Permission[];
    }
  }
}

// Must run AFTER requireAuth (so req.userId is already set) and on any
// route that includes a `:organizationId` URL segment, e.g.:
//     orgRouter.get("/:organizationId", requireAuth, requireOrgMembership, getOrganizationHandler)
export async function requireOrgMembership(req: Request, _res: Response, next: NextFunction) {
  const organizationId = req.params.organizationId;

  if (typeof organizationId !== "string" || organizationId.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "An organization id is required.");
  }

  // THE ACTUAL CHECK: does a Membership row exist linking THIS user to
  // THIS exact organization? If someone logged into Org A edits the URL to
  // Org B's id, this lookup simply finds nothing (there's no Membership
  // for that user+org pair) and we reject before touching any Org B data.
  const membership = await Membership.findOne({ organizationId, userId: req.userId });

  if (!membership) {
    // Deliberately the same generic message whether the org doesn't exist
    // OR it exists but this user isn't a member - same "don't leak which
    // orgs exist" principle as the login/reset error messages in Day 2-3.
    throw new ApiError(403, "FORBIDDEN", "You do not have access to this organization.");
  }

  if (membership.status !== "active") {
    throw new ApiError(403, "FORBIDDEN", "Your access to this organization has been suspended.");
  }

  // DAY 5: load the actual Role this membership points to, so we know
  // exactly what this person is allowed to do - not just THAT they're a
  // member, but WHAT their membership permits.
  const role = await Role.findById(membership.roleId);
  if (!role) {
    // Extremely unlikely (would mean a Role got deleted while still
    // assigned - organization.service.ts's deleteRole blocks exactly this),
    // but treating it as "no permissions" instead of crashing is the safe
    // default if it ever somehow happened.
    throw new ApiError(403, "FORBIDDEN", "Your role could not be found. Contact an organization admin.");
  }

  // Only NOW, after real database checks, do we trust this id for the
  // rest of the request.
  req.organizationId = organizationId;
  req.membershipId = membership._id.toString();
  req.membershipRoleId = role._id.toString();
  req.membershipRoleName = role.name;
  req.membershipPermissions = role.permissions;
  next();
}

// A "middleware factory" - a function that RETURNS a middleware, so each
// route can ask for a different permission:
//     orgRouter.post("/:organizationId/roles", requireAuth, requireOrgMembership, requirePermission(PERMISSIONS.ROLE_MANAGE), createRoleHandler)
//
// Must run AFTER requireOrgMembership, since it reads
// `req.membershipPermissions`, which only requireOrgMembership sets.
export function requirePermission(permission: Permission) {
  return function permissionCheck(req: Request, _res: Response, next: NextFunction) {
    const permissions = req.membershipPermissions ?? [];

    if (!permissions.includes(permission)) {
      // A CLEAN 403 - exactly what the Day 5 acceptance test asks for.
      // Notice this doesn't reveal WHICH permission was missing in detail
      // beyond the message - enough for a developer to debug with, without
      // turning the error into a map of the whole permission system.
      throw new ApiError(
        403,
        "FORBIDDEN",
        `You don't have permission to do this ('${permission}' required).`
      );
    }

    next();
  };
}
