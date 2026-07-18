// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A Department is just a named grouping within an organization (e.g.
// "Engineering", "Support", "Sales") - deliberately simple for Day 5.
// Teams (team.model.ts) can optionally belong to one.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface DepartmentAttrs {
  organizationId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DepartmentDocument = HydratedDocument<DepartmentAttrs>;

const departmentSchema = new Schema<DepartmentAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const Department = mongoose.model<DepartmentAttrs>("Department", departmentSchema);
