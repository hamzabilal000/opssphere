// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Role is nothing more than a NAME plus a LIST of permission strings,
// scoped to one organization. "Owner" and "Member" are created
// automatically for every new org (see organization.service.ts's
// createOrganization) - anything beyond those two is a CUSTOM role an org
// admin creates themselves, made of whichever permissions they choose.
//
// This is deliberately about as simple as a permission system can be: no
// role hierarchy, no "deny" rules, no inheritance between roles - just
// "does this role's permissions array include the one thing I'm checking
// for?" See tenant.middleware.ts's requirePermission for where that check
// actually happens.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { Permission } from "@opssphere/shared-types";
import { ALL_PERMISSIONS } from "@opssphere/shared-types";

export interface RoleAttrs {
  organizationId: Types.ObjectId;
  name: string;
  permissions: Permission[];
  // "system" roles (Owner, Member) are seeded automatically and can't be
  // renamed or deleted - see organization.service.ts's role functions for
  // where that rule is enforced (the DATABASE doesn't stop you from
  // editing one; the SERVICE layer does, on purpose - a good example of
  // "a flag isn't security, it's just a fact the code chooses to respect").
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RoleDocument = HydratedDocument<RoleAttrs>;

const roleSchema = new Schema<RoleAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    permissions: {
      type: [String],
      required: true,
      // TYPESCRIPT NOTE: `enum: ALL_PERMISSIONS` here does the SAME job as
      // `z.enum(...)` did in packages/validation - it's MongoDB's own
      // backstop, rejecting any string that isn't a real permission, even
      // if something upstream of this model somehow skipped Zod's check.
      enum: ALL_PERMISSIONS,
      default: [],
    },
    isSystemRole: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

// A role NAME only has to be unique WITHIN one organization - "Support" in
// Acme Inc and "Support" in a completely different company are fine, since
// the uniqueness check includes organizationId, not just name alone.
roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const Role = mongoose.model<RoleAttrs>("Role", roleSchema);
