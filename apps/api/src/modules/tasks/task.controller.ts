// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer, same 3-step shape as every other controller in
// this project: validate, call the service, respond.
// ============================================================================

import type { Request, Response } from "express";
import {
  createSprintSchema,
  updateSprintSchema,
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  createTaskCommentSchema,
  createTaskAttachmentSchema,
  createTimeEntrySchema,
} from "@opssphere/validation";
import { PERMISSIONS } from "@opssphere/shared-types";
import type {
  ApiSuccessResponse,
  SprintSummary,
  TaskSummary,
  TaskCommentSummary,
  TaskAttachmentSummary,
  TimeEntrySummary,
} from "@opssphere/shared-types";
import * as taskService from "./task.service.js";
import { ApiError } from "../../middleware/errorHandler.js";

function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return Object.entries(error.flatten().fieldErrors).map(([field, messages]) => ({
    field,
    message: messages?.[0] ?? "Invalid value",
  }));
}

// Reused by attachment/time-entry deletes below - "does the caller's role
// carry task.manage?" (see task.service.ts's ownership-or-permission note).
function canManageTasks(req: Request): boolean {
  return (req.membershipPermissions ?? []).includes(PERMISSIONS.TASK_MANAGE);
}

// ----------------------------------------------------------------------------
// SPRINTS
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/sprints
export async function listSprintsHandler(req: Request, res: Response) {
  const sprints = await taskService.listSprints(req.organizationId ?? "", String(req.params.projectId ?? ""));
  const body: ApiSuccessResponse<{ sprints: SprintSummary[] }> = { success: true, data: { sprints } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/sprints
export async function createSprintHandler(req: Request, res: Response) {
  const parsed = createSprintSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const sprint = await taskService.createSprint(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ sprint: SprintSummary }> = {
    success: true,
    message: "Sprint created.",
    data: { sprint },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/sprints/:sprintId
export async function updateSprintHandler(req: Request, res: Response) {
  const parsed = updateSprintSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const sprint = await taskService.updateSprint(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.sprintId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ sprint: SprintSummary }> = {
    success: true,
    message: "Sprint updated.",
    data: { sprint },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/sprints/:sprintId
export async function deleteSprintHandler(req: Request, res: Response) {
  await taskService.deleteSprint(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.sprintId ?? "")
  );
  const body: ApiSuccessResponse<null> = { success: true, message: "Sprint deleted.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/tasks
export async function listTasksHandler(req: Request, res: Response) {
  const tasks = await taskService.listTasks(req.organizationId ?? "", String(req.params.projectId ?? ""));
  const body: ApiSuccessResponse<{ tasks: TaskSummary[] }> = { success: true, data: { tasks } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/tasks
export async function createTaskHandler(req: Request, res: Response) {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const task = await taskService.createTask(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    req.userId ?? "",
    parsed.data
  );

  const body: ApiSuccessResponse<{ task: TaskSummary }> = {
    success: true,
    message: "Task created.",
    data: { task },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId
export async function updateTaskHandler(req: Request, res: Response) {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const task = await taskService.updateTask(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ task: TaskSummary }> = {
    success: true,
    message: "Task updated.",
    data: { task },
  };
  res.status(200).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/move
// The drag-and-drop endpoint - a card getting dropped into a new column.
export async function moveTaskHandler(req: Request, res: Response) {
  const parsed = moveTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const task = await taskService.moveTask(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    parsed.data.status
  );

  const body: ApiSuccessResponse<{ task: TaskSummary }> = {
    success: true,
    message: "Task moved.",
    data: { task },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId
export async function deleteTaskHandler(req: Request, res: Response) {
  await taskService.deleteTask(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? "")
  );
  const body: ApiSuccessResponse<null> = { success: true, message: "Task deleted.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// COMMENTS  (any active org member - no permission gate, see PERMISSIONS)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments
export async function listCommentsHandler(req: Request, res: Response) {
  const comments = await taskService.listComments(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? "")
  );
  const body: ApiSuccessResponse<{ comments: TaskCommentSummary[] }> = { success: true, data: { comments } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments
export async function createCommentHandler(req: Request, res: Response) {
  const parsed = createTaskCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const comment = await taskService.createComment(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    req.userId ?? "",
    parsed.data
  );

  const body: ApiSuccessResponse<{ comment: TaskCommentSummary }> = {
    success: true,
    message: "Comment added.",
    data: { comment },
  };
  res.status(201).json(body);
}

// ----------------------------------------------------------------------------
// ATTACHMENTS  (link-based - see task-attachment.model.ts)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/attachments
export async function listAttachmentsHandler(req: Request, res: Response) {
  const attachments = await taskService.listAttachments(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? "")
  );
  const body: ApiSuccessResponse<{ attachments: TaskAttachmentSummary[] }> = {
    success: true,
    data: { attachments },
  };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/attachments
export async function createAttachmentHandler(req: Request, res: Response) {
  const parsed = createTaskAttachmentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const attachment = await taskService.createAttachment(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    req.userId ?? "",
    parsed.data
  );

  const body: ApiSuccessResponse<{ attachment: TaskAttachmentSummary }> = {
    success: true,
    message: "Attachment added.",
    data: { attachment },
  };
  res.status(201).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/attachments/:attachmentId
export async function deleteAttachmentHandler(req: Request, res: Response) {
  await taskService.deleteAttachment(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    String(req.params.attachmentId ?? ""),
    req.userId ?? "",
    canManageTasks(req)
  );
  const body: ApiSuccessResponse<null> = { success: true, message: "Attachment removed.", data: null };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// TIME ENTRIES  (any active org member - no permission gate, see PERMISSIONS)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/time-entries
export async function listTimeEntriesHandler(req: Request, res: Response) {
  const entries = await taskService.listTimeEntries(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? "")
  );
  const body: ApiSuccessResponse<{ entries: TimeEntrySummary[] }> = { success: true, data: { entries } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/time-entries
export async function createTimeEntryHandler(req: Request, res: Response) {
  const parsed = createTimeEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const entry = await taskService.createTimeEntry(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    req.userId ?? "",
    parsed.data
  );

  const body: ApiSuccessResponse<{ entry: TimeEntrySummary }> = {
    success: true,
    message: "Time logged.",
    data: { entry },
  };
  res.status(201).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/time-entries/:entryId
export async function deleteTimeEntryHandler(req: Request, res: Response) {
  await taskService.deleteTimeEntry(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    String(req.params.entryId ?? ""),
    req.userId ?? "",
    canManageTasks(req)
  );
  const body: ApiSuccessResponse<null> = { success: true, message: "Time entry removed.", data: null };
  res.status(200).json(body);
}
