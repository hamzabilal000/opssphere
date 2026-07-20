// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The business rules for the risk register - same separation as every
// other service file: no Express here, just plain arguments in, plain data
// out.
// ============================================================================

import { Types } from "mongoose";
import { Project } from "../projects/project.model.js";
import { Membership } from "../organizations/membership.model.js";
import { User } from "../auth/user.model.js";
import { Risk } from "./risk.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { CreateRiskInput, UpdateRiskInput } from "@opssphere/validation";
import type { RiskSummary } from "@opssphere/shared-types";

// ----------------------------------------------------------------------------
// SHARED HELPERS
// ----------------------------------------------------------------------------
async function findProjectOrThrow(organizationId: string, projectId: string) {
  const project = await Project.findOne({ _id: projectId, organizationId });
  if (!project) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Project not found.");
  }
  return project;
}

async function findRiskOrThrow(organizationId: string, projectId: string, riskId: string) {
  const risk = await Risk.findOne({ _id: riskId, organizationId, projectId });
  if (!risk) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Risk not found.");
  }
  return risk;
}

// Likelihood/impact are stored as low/medium/high, never as numbers - this
// small lookup is the ONLY place that ever turns them into one, so a
// risk's severity score is always computed the exact same way everywhere
// it's shown (same "compute once, server-side" idea as Day 9's
// TaskCommentSummary.isEdited).
const LEVEL_SCORE: Record<"low" | "medium" | "high", number> = { low: 1, medium: 2, high: 3 };

// Turns a batch of Risk documents into RiskSummary[], resolving both
// creator AND owner emails in one batched query - same "don't query inside
// a loop" principle every earlier module uses.
async function toRiskSummaries(risks: InstanceType<typeof Risk>[]): Promise<RiskSummary[]> {
  const userIds = new Set<string>();
  for (const r of risks) {
    userIds.add(r.createdBy.toString());
    if (r.ownerId) userIds.add(r.ownerId.toString());
  }
  const users = userIds.size > 0 ? await User.find({ _id: { $in: Array.from(userIds) } }) : [];
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return risks.map((r) => ({
    id: r._id.toString(),
    projectId: r.projectId.toString(),
    title: r.title,
    description: r.description,
    likelihood: r.likelihood,
    impact: r.impact,
    riskScore: LEVEL_SCORE[r.likelihood] * LEVEL_SCORE[r.impact],
    status: r.status,
    mitigationPlan: r.mitigationPlan,
    ownerId: r.ownerId?.toString(),
    ownerEmail: r.ownerId ? emailByUserId.get(r.ownerId.toString()) ?? "unknown" : undefined,
    createdBy: r.createdBy.toString(),
    createdByEmail: emailByUserId.get(r.createdBy.toString()) ?? "unknown",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ----------------------------------------------------------------------------
// RISKS
// ----------------------------------------------------------------------------
export async function listRisks(organizationId: string, projectId: string): Promise<RiskSummary[]> {
  await findProjectOrThrow(organizationId, projectId);
  const risks = await Risk.find({ projectId }).sort({ createdAt: -1 });
  return toRiskSummaries(risks);
}

export async function createRisk(
  organizationId: string,
  projectId: string,
  createdBy: string,
  input: CreateRiskInput
): Promise<RiskSummary> {
  await findProjectOrThrow(organizationId, projectId);

  if (input.ownerId) {
    // Same "re-check against a real, ACTIVE record" principle as adding a
    // project member (Day 7) or assigning a ticket (Day 10) - a risk can't
    // be handed to someone who isn't even an active member of this org.
    const membership = await Membership.findOne({ organizationId, userId: input.ownerId, status: "active" });
    if (!membership) {
      throw new ApiError(400, "VALIDATION_ERROR", "That person is not an active member of this organization.");
    }
  }

  const risk = await Risk.create({
    organizationId,
    projectId,
    title: input.title,
    description: input.description,
    likelihood: input.likelihood,
    impact: input.impact,
    mitigationPlan: input.mitigationPlan,
    ownerId: input.ownerId,
    status: "identified",
    createdBy,
  });

  const [summary] = await toRiskSummaries([risk]);
  return summary as RiskSummary;
}

// No ownership exception here on purpose - risk.manage is a FLAT
// permission check, same reasoning as Day 10's assignTicket: tracking a
// risk's severity/status/mitigation plan is a coordinator-level activity,
// not something any random project member should be able to edit just
// because they happened to raise it. Contrast this with Day 10's Ticket,
// where filing AND editing your own ticket needs no special permission at
// all - a risk register and a helpdesk queue are different kinds of tools,
// on purpose.
export async function updateRisk(
  organizationId: string,
  projectId: string,
  riskId: string,
  input: UpdateRiskInput
): Promise<RiskSummary> {
  await findProjectOrThrow(organizationId, projectId);
  const risk = await findRiskOrThrow(organizationId, projectId, riskId);

  if (input.ownerId !== undefined) {
    if (input.ownerId === null) {
      risk.ownerId = undefined;
    } else {
      const membership = await Membership.findOne({ organizationId, userId: input.ownerId, status: "active" });
      if (!membership) {
        throw new ApiError(400, "VALIDATION_ERROR", "That person is not an active member of this organization.");
      }
      risk.ownerId = new Types.ObjectId(input.ownerId);
    }
  }

  if (input.title !== undefined) risk.title = input.title;
  if (input.description !== undefined) risk.description = input.description;
  if (input.likelihood !== undefined) risk.likelihood = input.likelihood;
  if (input.impact !== undefined) risk.impact = input.impact;
  if (input.status !== undefined) risk.status = input.status;
  if (input.mitigationPlan !== undefined) risk.mitigationPlan = input.mitigationPlan;
  await risk.save();

  const [summary] = await toRiskSummaries([risk]);
  return summary as RiskSummary;
}

// No referential-integrity block needed here (contrast with deleteSprint/
// deleteTask) - nothing else in the app points AT a risk, so there's
// nothing that could be left dangling.
export async function deleteRisk(organizationId: string, projectId: string, riskId: string): Promise<void> {
  await findProjectOrThrow(organizationId, projectId);
  const risk = await findRiskOrThrow(organizationId, projectId, riskId);
  await risk.deleteOne();
}
