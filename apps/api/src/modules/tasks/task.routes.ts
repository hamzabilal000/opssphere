// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Wires URLs to controller functions. Mounted at the SAME base path as
// project.routes.ts ("/api/v1/organizations" - see app.ts), one level
// deeper: every URL here starts with "/:organizationId/projects/:projectId/..."
// since a sprint or task can never exist outside of a project.
//
// PERMISSION SPLIT (see PERMISSIONS in shared-types + the Day 8 learning
// note for the full reasoning):
//   - Reading anything here: just active org membership, same as every
//     other module.
//   - Creating/editing/deleting a SPRINT: sprint.manage.
//   - Creating/editing/deleting/MOVING a TASK: task.manage. (Letting an
//     assignee move only their own cards without task.manage is a
//     reasonable future improvement - not built today, see the note.)
//   - Comments, attachments, and time entries: NO permission gate on
//     create - any active member can do these low-risk, collaborative
//     actions. DELETING one of these is checked inside the controller/
//     service instead of here, because the rule isn't a flat permission -
//     it's "the person who created it, OR someone with task.manage."
// ============================================================================

import { Router } from "express";
import {
  listSprintsHandler,
  createSprintHandler,
  updateSprintHandler,
  deleteSprintHandler,
  listTasksHandler,
  createTaskHandler,
  updateTaskHandler,
  moveTaskHandler,
  deleteTaskHandler,
  listCommentsHandler,
  createCommentHandler,
  listAttachmentsHandler,
  createAttachmentHandler,
  deleteAttachmentHandler,
  listTimeEntriesHandler,
  createTimeEntryHandler,
  deleteTimeEntryHandler,
} from "./task.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership, requirePermission } from "../organizations/tenant.middleware.js";
import { PERMISSIONS } from "@opssphere/shared-types";

export const taskRouter = Router();

const base = "/:organizationId/projects/:projectId";

// ---- Sprints -----------------------------------------------------------
taskRouter.get(`${base}/sprints`, requireAuth, requireOrgMembership, listSprintsHandler);
taskRouter.post(
  `${base}/sprints`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.SPRINT_MANAGE),
  createSprintHandler
);
taskRouter.patch(
  `${base}/sprints/:sprintId`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.SPRINT_MANAGE),
  updateSprintHandler
);
taskRouter.delete(
  `${base}/sprints/:sprintId`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.SPRINT_MANAGE),
  deleteSprintHandler
);

// ---- Tasks ---------------------------------------------------------------
taskRouter.get(`${base}/tasks`, requireAuth, requireOrgMembership, listTasksHandler);
taskRouter.post(
  `${base}/tasks`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TASK_MANAGE),
  createTaskHandler
);
taskRouter.patch(
  `${base}/tasks/:taskId`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TASK_MANAGE),
  updateTaskHandler
);
taskRouter.patch(
  `${base}/tasks/:taskId/move`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TASK_MANAGE),
  moveTaskHandler
);
taskRouter.delete(
  `${base}/tasks/:taskId`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TASK_MANAGE),
  deleteTaskHandler
);

// ---- Comments (no permission gate - any active member) -------------------
taskRouter.get(`${base}/tasks/:taskId/comments`, requireAuth, requireOrgMembership, listCommentsHandler);
taskRouter.post(`${base}/tasks/:taskId/comments`, requireAuth, requireOrgMembership, createCommentHandler);

// ---- Attachments (create: any member; delete: ownership-or-permission,
// checked inside the controller/service, not here) -------------------------
taskRouter.get(`${base}/tasks/:taskId/attachments`, requireAuth, requireOrgMembership, listAttachmentsHandler);
taskRouter.post(`${base}/tasks/:taskId/attachments`, requireAuth, requireOrgMembership, createAttachmentHandler);
taskRouter.delete(
  `${base}/tasks/:taskId/attachments/:attachmentId`,
  requireAuth,
  requireOrgMembership,
  deleteAttachmentHandler
);

// ---- Time entries (same split as attachments) -----------------------------
taskRouter.get(`${base}/tasks/:taskId/time-entries`, requireAuth, requireOrgMembership, listTimeEntriesHandler);
taskRouter.post(`${base}/tasks/:taskId/time-entries`, requireAuth, requireOrgMembership, createTimeEntryHandler);
taskRouter.delete(
  `${base}/tasks/:taskId/time-entries/:entryId`,
  requireAuth,
  requireOrgMembership,
  deleteTimeEntryHandler
);
