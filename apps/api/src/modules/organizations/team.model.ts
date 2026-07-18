// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Team is a smaller working group within an organization, optionally
// filed under a Department (e.g. Department "Engineering" -> Team
// "Platform"). `departmentId` is optional - Day 5 doesn't require every
// team to belong to one.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TeamAttrs {
  organizationId: Types.ObjectId;
  name: string;
  departmentId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TeamDocument = HydratedDocument<TeamAttrs>;

const teamSchema = new Schema<TeamAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
  },
  { timestamps: true }
);

teamSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const Team = mongoose.model<TeamAttrs>("Team", teamSchema);
