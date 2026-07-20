// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A risk register entry - "the vendor might miss their delivery date,"
// "we're relying on one engineer who knows the legacy billing code." A risk
// is deliberately PROJECT-level (an `organizationId` AND a `projectId`),
// unlike Day 10's org-level Ticket - a risk belongs to one project's plan,
// not the whole company. `likelihood`/`impact` are stored as plain
// low/medium/high strings, never as numbers - risk.service.ts's
// `toRiskSummaries` is the ONE place that turns them into a numeric
// `riskScore`, computed fresh every time, never stored (see its comment).
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { RiskLikelihood, RiskImpact, RiskStatus } from "@opssphere/shared-types";

export interface RiskAttrs {
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  title: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  status: RiskStatus;
  mitigationPlan: string;
  ownerId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type RiskDocument = HydratedDocument<RiskAttrs>;

const riskSchema = new Schema<RiskAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    likelihood: { type: String, enum: ["low", "medium", "high"], required: true, default: "medium" },
    impact: { type: String, enum: ["low", "medium", "high"], required: true, default: "medium" },
    status: {
      type: String,
      enum: ["identified", "mitigating", "resolved", "accepted"],
      required: true,
      default: "identified",
    },
    mitigationPlan: { type: String, default: "" },
    // Unassigned until someone with risk.manage hands it to a real person -
    // same "unassigned by default" shape as Day 10's Ticket.assigneeId.
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Every register view loads "all risks in this project" or filters by
// status - same compound-index idea as every other module's most common
// query shape (Task's { projectId, status }, Ticket's { organizationId,
// status }).
riskSchema.index({ projectId: 1, status: 1 });

export const Risk = mongoose.model<RiskAttrs>("Risk", riskSchema);
