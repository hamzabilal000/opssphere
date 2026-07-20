// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A reply on a support ticket - the back-and-forth conversation between
// whoever raised it and whoever's working it. Deliberately as simple as
// Day 8's original TaskComment was BEFORE Day 9 (no editing, no deleting,
// no @mentions) - this module is already a full new module on its own
// today; reusing Day 9's richer comment machinery here is a reasonable
// future upgrade, not something today's scope needs.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TicketCommentAttrs {
  organizationId: Types.ObjectId;
  ticketId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}

export type TicketCommentDocument = HydratedDocument<TicketCommentAttrs>;

const ticketCommentSchema = new Schema<TicketCommentAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TicketComment = mongoose.model<TicketCommentAttrs>("TicketComment", ticketCommentSchema);
