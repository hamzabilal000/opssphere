// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Milestone is a single dated checkpoint within a project (e.g. "Beta
// launch - March 1st"). Deliberately just a name, a due date, and a
// complete/incomplete flag - no dependencies or sub-tasks (that level of
// detail is Day 8's Task model, not this one).
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface MilestoneAttrs {
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  dueDate: Date;
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MilestoneDocument = HydratedDocument<MilestoneAttrs>;

const milestoneSchema = new Schema<MilestoneAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    isComplete: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

export const Milestone = mongoose.model<MilestoneAttrs>("Milestone", milestoneSchema);
