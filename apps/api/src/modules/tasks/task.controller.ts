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
  updateTaskCommentSchema,
  createTaskAttachmentSchema,
  createTimeEntrySchema,
  addChecklistItemSchema,
  updateChecklistItemSchema,
} from "@opssphere/validation";
import { PERMISSIONS, SOCKET_EVENTS } from "@opssphere/shared-types";
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
import { emitToProject } from "../../lib/socket.js";

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

  // DAY 9: tell everyone else currently looking at this project's board -
  // see lib/socket.ts. Emitting AFTER the database write succeeds (not
  // before) means a socket broadcast can never announce something that
  // didn't actually happen.
  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_CREATED, { task });

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

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_UPDATED, { task });

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

  // This is the headline Day 9 moment: someone drags a card, and every
  // OTHER browser looking at this same board sees it move too, with no
  // refresh - see web/src/lib/socket.ts's listener for TASK_MOVED.
  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_MOVED, { task });

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

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_DELETED, {
    taskId: String(req.params.taskId ?? ""),
  });

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

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.COMMENT_CREATED, {
    taskId: String(req.params.taskId ?? ""),
    comment,
  });

  const body: ApiSuccessResponse<{ comment: TaskCommentSummary }> = {
    success: true,
    message: "Comment added.",
    data: { comment },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments/:commentId
export async function updateCommentHandler(req: Request, res: Response) {
  const parsed = updateTaskCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const comment = await taskService.updateComment(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    String(req.params.commentId ?? ""),
    req.userId ?? "",
    canManageTasks(req),
    parsed.data
  );

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.COMMENT_UPDATED, {
    taskId: String(req.params.taskId ?? ""),
    comment,
  });

  const body: ApiSuccessResponse<{ comment: TaskCommentSummary }> = {
    success: true,
    message: "Comment updated.",
    data: { comment },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments/:commentId
export async function deleteCommentHandler(req: Request, res: Response) {
  await taskService.deleteComment(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    String(req.params.commentId ?? ""),
    req.userId ?? "",
    canManageTasks(req)
  );

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.COMMENT_DELETED, {
    taskId: String(req.params.taskId ?? ""),
    commentId: String(req.params.commentId ?? ""),
  });

  const body: ApiSuccessResponse<null> = { success: true, message: "Comment deleted.", data: null };
  res.status(200).json(body);
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

// ----------------------------------------------------------------------------
// CHECKLIST ITEMS  (DAY 11 — any active org member, no permission gate)
// ----------------------------------------------------------------------------
// Every mutation here emits TASK_UPDATED with the whole (now-current) task -
// reusing Day 9's existing event instead of inventing a new
// CHECKLIST_CHANGED one, since a checklist item lives embedded ON the task
// document itself; from a listener's point of view, "a checklist item
// changed" and "the task changed" are the same fact.

// POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/checklist-items
export async function addChecklistItemHandler(req: Request, res: Response) {
  const parsed = addChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const task = await taskService.addChecklistItem(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    parsed.data
  );

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_UPDATED, { task });

  const body: ApiSuccessResponse<{ task: TaskSummary }> = {
    success: true,
    message: "Checklist item added.",
    data: { task },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/checklist-items/:itemId
export async function updateChecklistItemHandler(req: Request, res: Response) {
  const parsed = updateChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const task = await taskService.updateChecklistItem(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    String(req.params.itemId ?? ""),
    parsed.data
  );

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_UPDATED, { task });

  const body: ApiSuccessResponse<{ task: TaskSummary }> = {
    success: true,
    message: "Checklist item updated.",
    data: { task },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/checklist-items/:itemId
export async function deleteChecklistItemHandler(req: Request, res: Response) {
  const task = await taskService.deleteChecklistItem(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.taskId ?? ""),
    String(req.params.itemId ?? "")
  );

  emitToProject(String(req.params.projectId ?? ""), SOCKET_EVENTS.TASK_UPDATED, { task });

  const body: ApiSuccessResponse<{ task: TaskSummary }> = {
    success: true,
    message: "Checklist item removed.",
    data: { task },
  };
  res.status(200).json(body);
}
