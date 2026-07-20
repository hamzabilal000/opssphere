// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Sprint is a dated work window within a project (e.g. "Sprint 4, Aug
// 1-14"). Tasks can optionally belong to one - see task.model.ts's
// `sprintId`. Deliberately simple: a name, a date range, and a status.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { SprintStatus } from "@opssphere/shared-types";

export interface SprintAttrs {
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  status: SprintStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type SprintDocument = HydratedDocument<SprintAttrs>;

const sprintSchema = new Schema<SprintAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["planned", "active", "completed"], required: true, default: "planned" },
  },
  { timestamps: true }
);

export const Sprint = mongoose.model<SprintAttrs>("Sprint", sprintSchema);
