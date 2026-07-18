// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A super-simplified version of the invitation system described in the SRS
// (full version arrives Day 5, once organizations and roles exist - see
// SRS section 5.2). For now, this just answers: "someone who's logged in
// can invite an email address; that person gets a link; clicking it lets
// them set a password and creates their account, already verified."
//
// No organization, no role assignment yet - just proving an account can be
// created THROUGH an invitation instead of through open self-registration.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface InvitationAttrs {
  email: string;
  tokenHash: string;
  status: "pending" | "accepted" | "cancelled";
  invitedByUserId: Types.ObjectId;
  expiresAt: Date;
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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Invitation = mongoose.model<InvitationAttrs>("Invitation", invitationSchema);
