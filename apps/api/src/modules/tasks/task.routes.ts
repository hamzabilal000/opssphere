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
//     actions. EDITING/DELETING one of these is checked inside the
//     controller/service instead of here, because the rule isn't a flat
//     permission - it's "the person who created it, OR someone with
//     task.manage" (Day 9 adds comment editing to this same rule).
// ============================================================================

import { Router } from "express";
import multer from "multer";
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
  updateCommentHandler,
  deleteCommentHandler,
  listAttachmentsHandler,
  createAttachmentHandler,
  uploadAttachmentHandler,
  deleteAttachmentHandler,
  listTimeEntriesHandler,
  createTimeEntryHandler,
  deleteTimeEntryHandler,
  addChecklistItemHandler,
  updateChecklistItemHandler,
  deleteChecklistItemHandler,
} from "./task.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership, requirePermission } from "../organizations/tenant.middleware.js";
import { PERMISSIONS } from "@opssphere/shared-types";

export const taskRouter = Router();

// DAY 12: `multer.memoryStorage()` keeps an uploaded file's bytes in RAM
// (as a plain Buffer, handed to us via req.file.buffer) instead of writing
// it to a temp file on the API server's own disk - the file's real,
// permanent home is MinIO, so there's no reason for it to ever touch this
// server's filesystem at all. `limits.fileSize` is a deliberately small
// default (10 MB) for a demo/teaching project, not an exhaustively
// configurable setting.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// ---- Comments (create: any member; edit/delete: ownership-or-permission,
// checked inside the controller/service, not here - see Day 9 note) --------
taskRouter.get(`${base}/tasks/:taskId/comments`, requireAuth, requireOrgMembership, listCommentsHandler);
taskRouter.post(`${base}/tasks/:taskId/comments`, requireAuth, requireOrgMembership, createCommentHandler);
taskRouter.patch(
  `${base}/tasks/:taskId/comments/:commentId`,
  requireAuth,
  requireOrgMembership,
  updateCommentHandler
);
taskRouter.delete(
  `${base}/tasks/:taskId/comments/:commentId`,
  requireAuth,
  requireOrgMembership,
  deleteCommentHandler
);

// ---- Attachments (create: any member; delete: ownership-or-permission,
// checked inside the controller/service, not here) -------------------------
taskRouter.get(`${base}/tasks/:taskId/attachments`, requireAuth, requireOrgMembership, listAttachmentsHandler);
taskRouter.post(`${base}/tasks/:taskId/attachments`, requireAuth, requireOrgMembership, createAttachmentHandler);
// DAY 12: the REAL-file counterpart to the link-based route right above -
// same permission split (any active member), same base path, one extra
// path segment. `upload.single("file")` runs AFTER requireOrgMembership on
// purpose - an unauthenticated/non-member request gets rejected before we
// ever spend effort parsing a (potentially large) file body.
taskRouter.post(
  `${base}/tasks/:taskId/attachments/upload`,
  requireAuth,
  requireOrgMembership,
  upload.single("file"),
  uploadAttachmentHandler
);
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

// ---- Checklist items (DAY 11 — any active member, no permission gate AND
// no ownership check at all, unlike comments/attachments/time-entries -
// see task.service.ts's comment on why) -------------------------------------
taskRouter.post(
  `${base}/tasks/:taskId/checklist-items`,
  requireAuth,
  requireOrgMembership,
  addChecklistItemHandler
);
taskRouter.patch(
  `${base}/tasks/:taskId/checklist-items/:itemId`,
  requireAuth,
  requireOrgMembership,
  updateChecklistItemHandler
);
taskRouter.delete(
  `${base}/tasks/:taskId/checklist-items/:itemId`,
  requireAuth,
  requireOrgMembership,
  deleteChecklistItemHandler
);

// NOTE: task DEPENDENCIES (dependsOnTaskIds) have no routes of their own -
// they're edited through the existing `PATCH .../tasks/:taskId` endpoint
// above, gated by the same task.manage permission as every other task
// detail. See updateTaskSchema in packages/validation for why.
