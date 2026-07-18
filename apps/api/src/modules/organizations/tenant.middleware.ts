// ============================================================================
// WHAT THIS FILE DOES (in plain English) - THE MOST IMPORTANT FILE IN DAY 4
// ----------------------------------------------------------------------------
// This is the "tenant-context middleware" the Day 4 plan calls for. Its job:
// for any URL shaped like /api/v1/organizations/:organizationId/..., confirm
// the logged-in user is ACTUALLY a member of that exact organization before
// letting the request continue.
//
// THE GOLDEN RULE THIS FILE ENFORCES (straight from the SRS):
//   "Never trust an organization ID that comes from the client. Always
//    re-derive it from the logged-in user's session, and re-check it
//    against the record being accessed."
//
// In practice: the :organizationId in the URL is just text someone typed or
// a browser sent - ANYONE could edit it to a different org's ID, logged in
// as themselves. This middleware is what stops that from working. It does
// NOT trust the URL by itself - it looks up a real Membership row in the
// database proving "user X actually belongs to org Y" before allowing
// anything else in that request to run. If no such row exists (or it
// exists but is suspended), the request is rejected right here, before any
// org data is ever read or touched.
// ============================================================================

import type { NextFunction, Request, Response } from "express";
import { Membership } from "./membership.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { MembershipRole } from "@opssphere/shared-types";

// Same "augment Express's Request type" pattern used in auth.middleware.ts -
// every request now optionally carries the SERVER-VERIFIED organization id
// and the caller's role in it. Every later module (projects, tickets, ...)
// should read `req.organizationId` for its queries - NEVER `req.params.organizationId`
// directly - precisely because this file is what proves the former is safe
// to trust and the latter, on its own, is not.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      organizationId?: string;
      membershipRole?: MembershipRole;
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

  // Only NOW, after a real database check, do we trust this id for the
  // rest of the request.
  req.organizationId = organizationId;
  req.membershipRole = membership.role;
  next();
}
