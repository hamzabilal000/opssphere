// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A support ticket - "the printer is broken," "I can't log into the VPN."
// Deliberately ORG-LEVEL (an `organizationId`, no `projectId` anywhere on
// this model) - unlike a Task, a ticket isn't naturally part of any one
// project, it's a whole-company helpdesk concern any active member can
// raise. Unassigned until someone holding `ticket.assign` hands it to a
// real person - see ticket.service.ts's assignTicket.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { TicketPriority, TicketStatus } from "@opssphere/shared-types";

export interface TicketAttrs {
  organizationId: Types.ObjectId;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdBy: Types.ObjectId;
  assigneeId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TicketDocument = HydratedDocument<TicketAttrs>;

const ticketSchema = new Schema<TicketAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      required: true,
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      required: true,
      default: "medium",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Every ticket list loads "all tickets in this org, newest first" or
// filters by status - this compound index matches that access pattern
// directly, same idea as Day 8's Task index on { projectId, status }.
ticketSchema.index({ organizationId: 1, status: 1 });

export const Ticket = mongoose.model<TicketAttrs>("Ticket", ticketSchema);
