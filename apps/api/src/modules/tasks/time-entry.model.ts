// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A single manual time log against a task - "I spent 90 minutes on this,
// on August 3rd." Deliberately basic per the SRS ("basic manual time
// entries") - no timers, no billable/rate fields (not specified anywhere
// in the SRS), just a duration, an optional note, and which day it was for.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TimeEntryAttrs {
  organizationId: Types.ObjectId;
  taskId: Types.ObjectId;
  userId: Types.ObjectId;
  minutes: number;
  note: string;
  workDate: Date;
  createdAt: Date;
}

export type TimeEntryDocument = HydratedDocument<TimeEntryAttrs>;

const timeEntrySchema = new Schema<TimeEntryAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    minutes: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" },
    workDate: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TimeEntry = mongoose.model<TimeEntryAttrs>("TimeEntry", timeEntrySchema);
