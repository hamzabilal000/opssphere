// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The business rules for projects, project members, and milestones - same
// separation as every other service file: no Express here, just plain
// arguments in, plain data out.
// ============================================================================

import { Project } from "./project.model.js";
import { ProjectMember } from "./project-member.model.js";
import { Milestone } from "./milestone.model.js";
import { Membership } from "../organizations/membership.model.js";
import { User } from "../auth/user.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectMemberInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "@opssphere/validation";
import type { ProjectSummary, ProjectMemberSummary, MilestoneSummary } from "@opssphere/shared-types";

// ----------------------------------------------------------------------------
// SHARED HELPER — confirm a project exists in THIS organization, or 404
// ----------------------------------------------------------------------------
// Every function below that touches an existing project starts with this.
// The `organizationId` filter (not just `_id`) is what stops someone in
// Org A from reading/editing a project that actually belongs to Org B,
// even if they somehow guessed its real database id - same "ownership
// check belongs in the query itself" principle as Day 3's session
// revocation.
async function findProjectOrThrow(organizationId: string, projectId: string) {
  const project = await Project.findOne({ _id: projectId, organizationId });
  if (!project) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Project not found.");
  }
  return project;
}

function toProjectSummary(
  project: { _id: unknown; name: string; description: string; status: string; createdAt: Date },
  memberCount: number
): ProjectSummary {
  return {
    id: String(project._id),
    name: project.name,
    description: project.description,
    status: project.status as ProjectSummary["status"],
    memberCount,
    createdAt: project.createdAt.toISOString(),
  };
}

// ----------------------------------------------------------------------------
// PROJECTS
// ----------------------------------------------------------------------------
export async function createProject(
  organizationId: string,
  createdBy: string,
  input: CreateProjectInput
): Promise<ProjectSummary> {
  const project = await Project.create({
    organizationId,
    name: input.name,
    description: input.description,
    status: "active",
    createdBy,
  });

  // Whoever creates a project is automatically its first "lead" - same
  // pattern as Day 4's "whoever creates an org becomes its Owner."
  await ProjectMember.create({
    organizationId,
    projectId: project._id,
    userId: createdBy,
    role: "lead",
  });

  return toProjectSummary(project, 1);
}

export async function listProjects(organizationId: string): Promise<ProjectSummary[]> {
  const projects = await Project.find({ organizationId }).sort({ createdAt: -1 });
  if (projects.length === 0) return [];

  // One aggregate query for ALL projects' member counts, instead of one
  // count query per project in a loop - same "don't query inside a loop"
  // principle Days 4-5 already established.
  const counts = await ProjectMember.aggregate<{ _id: unknown; count: number }>([
    { $match: { organizationId: projects[0]?.organizationId, projectId: { $in: projects.map((p) => p._id) } } },
    { $group: { _id: "$projectId", count: { $sum: 1 } } },
  ]);
  const countByProjectId = new Map(counts.map((c) => [String(c._id), c.count]));

  return projects.map((p) => toProjectSummary(p, countByProjectId.get(p._id.toString()) ?? 0));
}

export async function getProject(organizationId: string, projectId: string): Promise<ProjectSummary> {
  const project = await findProjectOrThrow(organizationId, projectId);
  const memberCount = await ProjectMember.countDocuments({ projectId: project._id });
  return toProjectSummary(project, memberCount);
}

export async function updateProject(
  organizationId: string,
  projectId: string,
  input: UpdateProjectInput
): Promise<ProjectSummary> {
  const project = await findProjectOrThrow(organizationId, projectId);

  if (input.name !== undefined) project.name = input.name;
  if (input.description !== undefined) project.description = input.description;
  if (input.status !== undefined) project.status = input.status;
  await project.save();

  const memberCount = await ProjectMember.countDocuments({ projectId: project._id });
  return toProjectSummary(project, memberCount);
}

// ----------------------------------------------------------------------------
// PROJECT MEMBERS
// ----------------------------------------------------------------------------
export async function listProjectMembers(
  organizationId: string,
  projectId: string
): Promise<ProjectMemberSummary[]> {
  await findProjectOrThrow(organizationId, projectId);

  const members = await ProjectMember.find({ projectId }).sort({ createdAt: 1 });
  if (members.length === 0) return [];

  const userIds = members.map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } });
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return members.map((m) => ({
    id: m._id.toString(),
    userId: m.userId.toString(),
    email: emailByUserId.get(m.userId.toString()) ?? "unknown",
    role: m.role,
    addedAt: m.createdAt.toISOString(),
  }));
}

export async function addProjectMember(
  organizationId: string,
  projectId: string,
  input: AddProjectMemberInput
): Promise<ProjectMemberSummary> {
  await findProjectOrThrow(organizationId, projectId);

  // A project member must ALREADY be a member of the organization - a
  // project can't include someone who isn't even in the company. This is
  // the same "re-check against a real record, don't just trust an id"
  // principle Day 4's tenant.middleware.ts uses, applied one level down.
  const orgMembership = await Membership.findOne({ organizationId, userId: input.userId, status: "active" });
  if (!orgMembership) {
    throw new ApiError(400, "VALIDATION_ERROR", "That person is not an active member of this organization.");
  }

  const existing = await ProjectMember.findOne({ projectId, userId: input.userId });
  if (existing) {
    throw new ApiError(409, "CONFLICT", "That person is already on this project.");
  }

  const member = await ProjectMember.create({
    organizationId,
    projectId,
    userId: input.userId,
    role: input.role,
  });

  const user = await User.findById(input.userId);
  return {
    id: member._id.toString(),
    userId: member.userId.toString(),
    email: user?.email ?? "unknown",
    role: member.role,
    addedAt: member.createdAt.toISOString(),
  };
}

export async function removeProjectMember(
  organizationId: string,
  projectId: string,
  memberId: string
): Promise<void> {
  await findProjectOrThrow(organizationId, projectId);

  const member = await ProjectMember.findOne({ _id: memberId, projectId });
  if (!member) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Project member not found.");
  }
  await member.deleteOne();
}

// ----------------------------------------------------------------------------
// MILESTONES
// ----------------------------------------------------------------------------
export async function listMilestones(organizationId: string, projectId: string): Promise<MilestoneSummary[]> {
  await findProjectOrThrow(organizationId, projectId);

  const milestones = await Milestone.find({ projectId }).sort({ dueDate: 1 });
  return milestones.map((m) => ({
    id: m._id.toString(),
    name: m.name,
    dueDate: m.dueDate.toISOString(),
    isComplete: m.isComplete,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function createMilestone(
  organizationId: string,
  projectId: string,
  input: CreateMilestoneInput
): Promise<MilestoneSummary> {
  await findProjectOrThrow(organizationId, projectId);

  const milestone = await Milestone.create({
    organizationId,
    projectId,
    name: input.name,
    dueDate: input.dueDate,
    isComplete: false,
  });

  return {
    id: milestone._id.toString(),
    name: milestone.name,
    dueDate: milestone.dueDate.toISOString(),
    isComplete: milestone.isComplete,
    createdAt: milestone.createdAt.toISOString(),
  };
}

export async function updateMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput
): Promise<MilestoneSummary> {
  await findProjectOrThrow(organizationId, projectId);

  const milestone = await Milestone.findOne({ _id: milestoneId, projectId });
  if (!milestone) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Milestone not found.");
  }

  if (input.name !== undefined) milestone.name = input.name;
  if (input.dueDate !== undefined) milestone.dueDate = input.dueDate;
  if (input.isComplete !== undefined) milestone.isComplete = input.isComplete;
  await milestone.save();

  return {
    id: milestone._id.toString(),
    name: milestone.name,
    dueDate: milestone.dueDate.toISOString(),
    isComplete: milestone.isComplete,
    createdAt: milestone.createdAt.toISOString(),
  };
}

export async function deleteMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string
): Promise<void> {
  await findProjectOrThrow(organizationId, projectId);

  const milestone = await Milestone.findOne({ _id: milestoneId, projectId });
  if (!milestone) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Milestone not found.");
  }
  await milestone.deleteOne();
}
