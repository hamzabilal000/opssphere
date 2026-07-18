// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// One Session document = one logged-in device/browser. Every time you log
// in from somewhere (your laptop, your phone, a different browser), a new
// Session gets created. This is what makes two Day 3 features possible:
//   1. "Show me everywhere I'm logged in" (GET /auth/sessions)
//   2. "Log out that one device remotely" (DELETE /auth/sessions/:id)
//
// It's also the missing piece refresh-token rotation needs: instead of just
// trusting a refresh token's signature forever, we check it against a
// specific Session record in the database - which means we can revoke it
// early (logout, suspected theft) even if the token itself hasn't expired yet.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface SessionAttrs {
  userId: Types.ObjectId;
  // We never store the raw refresh token - only its hash, same principle
  // as passwords and one-time tokens elsewhere in this module.
  currentRefreshTokenHash: string;
  // A short, human-readable summary of "what is this session," so a user
  // can recognize their own devices in a list. We keep this simple (raw
  // values) rather than pulling in a User-Agent-parsing library.
  userAgent?: string;
  ipAddress?: string;
  lastUsedAt: Date;
  expiresAt: Date;
  // undefined = still active. Set to a real Date the moment a session is
  // logged out OR revoked due to suspected refresh-token reuse.
  revokedAt?: Date;
  createdAt: Date;
}

export type SessionDocument = HydratedDocument<SessionAttrs>;

const sessionSchema = new Schema<SessionAttrs>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User", // same idea as `ref: RelatedODM` in your usual Mongoose schemas
      required: true,
      index: true, // we'll query "all sessions for this user" constantly - an index speeds that up
    },
    currentRefreshTokenHash: {
      type: String,
      required: true,
      select: false, // same reasoning as passwordHash on Day 2 - hidden unless explicitly requested
    },
    userAgent: String,
    ipAddress: String,
    lastUsedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: Date,
  },
  {
    // We only need `createdAt` here, not `updatedAt` - `lastUsedAt` already
    // tracks the "was this touched recently" job updatedAt would normally do.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Session = mongoose.model<SessionAttrs>("Session", sessionSchema);
