// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Day 3 built a super-simplified invitation: "someone who's logged in can
// invite an email address; that person gets a link; clicking it lets them
// set a password and creates their account, already verified." No
// organization, no role - just proving an account can be created THROUGH
// an invitation instead of open self-registration.
//
// DAY 5 CHANGE: `organizationId` and `roleId` are now OPTIONAL extra
// fields. A plain, Day-3-style invitation still works exactly as before
// (both left unset). An org-scoped invitation (created via
// organization.service.ts's createOrgInvitation) sets both, so accepting
// it not only creates the account but ALSO creates a Membership in that
// organization with that role - see auth.service.ts's acceptInvitation.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface InvitationAttrs {
  email: string;
  tokenHash: string;
  status: "pending" | "accepted" | "cancelled";
  invitedByUserId: Types.ObjectId;
  expiresAt: Date;
  organizationId?: Types.ObjectId;
  roleId?: Types.ObjectId;
  createdAt: Date;
}

export type InvitationDocument = HydratedDocument<InvitationAttrs>;

const invitationSchema = new Schema<InvitationAttrs>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    // TYPESCRIPT NOTE: because InvitationAttrs says
    // `status: "pending" | "accepted" | "cancelled"` (an exact union, not
    // just `string`), Mongoose's `enum` option below acts as BOTH a runtime
    // check (MongoDB itself will reject any other value) AND lines up with
    // what TypeScript already expects at the code level - the two layers
    // reinforce each other instead of one trusting the other blindly.
    status: {
      type: String,
      enum: ["pending", "accepted", "cancelled"],
      default: "pending",
    },
    invitedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Invitation = mongoose.model<InvitationAttrs>("Invitation", invitationSchema);
