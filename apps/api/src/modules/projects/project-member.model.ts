// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The "who's on this project" link record - same join-table idea as
// Day 4's Membership model, just one level down (organization -> project
// instead of user -> organization). `role` here is intentionally a small,
// fixed "lead" | "member" choice, NOT a reference to Day 5's custom Role
// system - a project doesn't need its own full permission system, just
// "who's running it."
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { ProjectMemberRole } from "@opssphere/shared-types";

export interface ProjectMemberAttrs {
  organizationId: Types.ObjectId; // duplicated from the Project for fast, direct tenant-scoped queries
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  role: ProjectMemberRole;
  createdAt: Date;
}

export type ProjectMemberDocument = HydratedDocument<ProjectMemberAttrs>;

const projectMemberSchema = new Schema<ProjectMemberAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["lead", "member"], required: true, default: "member" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A person can only be added to the SAME project once - same compound
// unique index idea as Day 4's Membership model.
projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

export const ProjectMember = mongoose.model<ProjectMemberAttrs>("ProjectMember", projectMemberSchema);
