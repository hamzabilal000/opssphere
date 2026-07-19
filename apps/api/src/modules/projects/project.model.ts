// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Project is the first "real business data" model in OpsSphere - Days
// 1-6 were all about accounts, organizations, and access control. Kept
// deliberately simple today: name, description, status. Tasks, sprints,
// and the Kanban board are Day 8's job.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { ProjectStatus } from "@opssphere/shared-types";

export interface ProjectAttrs {
  organizationId: Types.ObjectId;
  name: string;
  description: string;
  status: ProjectStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = HydratedDocument<ProjectAttrs>;

const projectSchema = new Schema<ProjectAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["active", "completed", "archived"], required: true, default: "active" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const Project = mongoose.model<ProjectAttrs>("Project", projectSchema);
