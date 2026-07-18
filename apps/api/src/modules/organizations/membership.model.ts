// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Membership is the "link" record between a User and an Organization -
// same idea as a join table in SQL, just as its own Mongoose collection
// here. It answers three questions at once for any (user, org) pair:
// "are they even a member?", "what can they do here?" (role), and "do they
// currently have access?" (status).
//
// THIS is the record tenant.middleware.ts checks on every organization-
// scoped request - see that file for exactly how.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { MembershipRole, MembershipStatus } from "@opssphere/shared-types";

export interface MembershipAttrs {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: Date;
}

export type MembershipDocument = HydratedDocument<MembershipAttrs>;

const membershipSchema = new Schema<MembershipAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "member"], required: true },
    status: { type: String, enum: ["active", "suspended"], required: true, default: "active" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A COMPOUND UNIQUE INDEX across two fields at once: MongoDB will reject
// trying to insert a second Membership with the SAME organizationId AND
// userId together (a person can only have one membership per org - but can
// still have separate memberships in many different orgs, since only the
// PAIR has to be unique, not each field alone).
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const Membership = mongoose.model<MembershipAttrs>("Membership", membershipSchema);
