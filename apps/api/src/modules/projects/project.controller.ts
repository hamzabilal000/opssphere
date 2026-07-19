// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer, same 3-step shape as every other controller in
// this project: validate, call the service, respond.
// ============================================================================

import type { Request, Response } from "express";
import {
  createProjectSchema,
  updateProjectSchema,
  addProjectMemberSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
} from "@opssphere/validation";
import type {
  ApiSuccessResponse,
  ProjectSummary,
  ProjectMemberSummary,
  MilestoneSummary,
} from "@opssphere/shared-types";
import * as projectService from "./project.service.js";
import { ApiError } from "../../middleware/errorHandler.js";

function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return Object.entries(error.flatten().fieldErrors).map(([field, messages]) => ({
    field,
    message: messages?.[0] ?? "Invalid value",
  }));
}

// ----------------------------------------------------------------------------
// PROJECTS
// ----------------------------------------------------------------------------

// POST /api/v1/organizations/:organizationId/projects
export async function createProjectHandler(req: Request, res: Response) {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const project = await projectService.createProject(req.organizationId ?? "", req.userId ?? "", parsed.data);

  const body: ApiSuccessResponse<{ project: ProjectSummary }> = {
    success: true,
    message: "Project created.",
    data: { project },
  };
  res.status(201).json(body);
}

// GET /api/v1/organizations/:organizationId/projects
export async function listProjectsHandler(req: Request, res: Response) {
  const projects = await projectService.listProjects(req.organizationId ?? "");
  const body: ApiSuccessResponse<{ projects: ProjectSummary[] }> = { success: true, data: { projects } };
  res.status(200).json(body);
}

// GET /api/v1/organizations/:organizationId/projects/:projectId
export async function getProjectHandler(req: Request, res: Response) {
  const project = await projectService.getProject(req.organizationId ?? "", String(req.params.projectId ?? ""));
  const body: ApiSuccessResponse<{ project: ProjectSummary }> = { success: true, data: { project } };
  res.status(200).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId
export async function updateProjectHandler(req: Request, res: Response) {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const project = await projectService.updateProject(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ project: ProjectSummary }> = {
    success: true,
    message: "Project updated.",
    data: { project },
  };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// PROJECT MEMBERS
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/members
export async function listProjectMembersHandler(req: Request, res: Response) {
  const members = await projectService.listProjectMembers(
    req.organizationId ?? "",
    String(req.params.projectId ?? "")
  );
  const body: ApiSuccessResponse<{ members: ProjectMemberSummary[] }> = { success: true, data: { members } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/members
export async function addProjectMemberHandler(req: Request, res: Response) {
  const parsed = addProjectMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const member = await projectService.addProjectMember(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ member: ProjectMemberSummary }> = {
    success: true,
    message: "Member added.",
    data: { member },
  };
  res.status(201).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/members/:memberId
export async function removeProjectMemberHandler(req: Request, res: Response) {
  await projectService.removeProjectMember(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.memberId ?? "")
  );

  const body: ApiSuccessResponse<null> = { success: true, message: "Member removed.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// MILESTONES
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/milestones
export async function listMilestonesHandler(req: Request, res: Response) {
  const milestones = await projectService.listMilestones(
    req.organizationId ?? "",
    String(req.params.projectId ?? "")
  );
  const body: ApiSuccessResponse<{ milestones: MilestoneSummary[] }> = { success: true, data: { milestones } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/milestones
export async function createMilestoneHandler(req: Request, res: Response) {
  const parsed = createMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const milestone = await projectService.createMilestone(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ milestone: MilestoneSummary }> = {
    success: true,
    message: "Milestone created.",
    data: { milestone },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/milestones/:milestoneId
export async function updateMilestoneHandler(req: Request, res: Response) {
  const parsed = updateMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const milestone = await projectService.updateMilestone(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.milestoneId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ milestone: MilestoneSummary }> = {
    success: true,
    message: "Milestone updated.",
    data: { milestone },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/milestones/:milestoneId
export async function deleteMilestoneHandler(req: Request, res: Response) {
  await projectService.deleteMilestone(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.milestoneId ?? "")
  );

  const body: ApiSuccessResponse<null> = { success: true, message: "Milestone deleted.", data: null };
  res.status(200).json(body);
}
