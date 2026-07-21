// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The business rules for sprints, tasks, comments, attachments, and time
// entries - same separation as every other service file: no Express here,
// just plain arguments in, plain data out.
// ============================================================================

import { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { Project } from "../projects/project.model.js";
import { ProjectMember } from "../projects/project-member.model.js";
import { Membership } from "../organizations/membership.model.js";
import { User } from "../auth/user.model.js";
import { Sprint } from "./sprint.model.js";
import { Task } from "./task.model.js";
import { TaskComment } from "./task-comment.model.js";
import { TaskAttachment } from "./task-attachment.model.js";
import { TimeEntry } from "./time-entry.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { uploadFileToStorage, deleteFileFromStorage, getSignedDownloadUrl } from "../../lib/storage.js";
import type {
  CreateSprintInput,
  UpdateSprintInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
  CreateTaskAttachmentInput,
  CreateTimeEntryInput,
  AddChecklistItemInput,
  UpdateChecklistItemInput,
} from "@opssphere/validation";
import type {
  SprintSummary,
  TaskSummary,
  TaskStatus,
  TaskCommentSummary,
  TaskAttachmentSummary,
  TimeEntrySummary,
} from "@opssphere/shared-types";
import type { ChecklistItemAttrs } from "./task.model.js";

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

async function findTaskOrThrow(organizationId: string, projectId: string, taskId: string) {
  const task = await Task.findOne({ _id: taskId, organizationId, projectId });
  if (!task) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Task not found.");
  }
  return task;
}

// Every assignee has to be an ACTIVE member of the organization - same
// "re-check against a real record" principle Day 7's addProjectMember uses
// for project members, applied here to task assignees.
async function assertAssigneesAreOrgMembers(organizationId: string, assigneeIds: string[]): Promise<void> {
  if (assigneeIds.length === 0) return;
  const activeCount = await Membership.countDocuments({
    organizationId,
    userId: { $in: assigneeIds },
    status: "active",
  });
  if (activeCount !== assigneeIds.length) {
    throw new ApiError(400, "VALIDATION_ERROR", "One or more assignees are not active members of this organization.");
  }
}

function toSprintSummary(sprint: {
  _id: unknown;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
}): SprintSummary {
  return {
    id: String(sprint._id),
    name: sprint.name,
    startDate: sprint.startDate.toISOString(),
    endDate: sprint.endDate.toISOString(),
    status: sprint.status as SprintSummary["status"],
    createdAt: sprint.createdAt.toISOString(),
  };
}

// ----------------------------------------------------------------------------
// SPRINTS
// ----------------------------------------------------------------------------
export async function listSprints(organizationId: string, projectId: string): Promise<SprintSummary[]> {
  await findProjectOrThrow(organizationId, projectId);
  const sprints = await Sprint.find({ projectId }).sort({ startDate: 1 });
  return sprints.map(toSprintSummary);
}

export async function createSprint(
  organizationId: string,
  projectId: string,
  input: CreateSprintInput
): Promise<SprintSummary> {
  await findProjectOrThrow(organizationId, projectId);
  const sprint = await Sprint.create({
    organizationId,
    projectId,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    status: "planned",
  });
  return toSprintSummary(sprint);
}

export async function updateSprint(
  organizationId: string,
  projectId: string,
  sprintId: string,
  input: UpdateSprintInput
): Promise<SprintSummary> {
  await findProjectOrThrow(organizationId, projectId);
  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  }

  if (input.name !== undefined) sprint.name = input.name;
  if (input.startDate !== undefined) sprint.startDate = input.startDate;
  if (input.endDate !== undefined) sprint.endDate = input.endDate;
  if (input.status !== undefined) sprint.status = input.status;
  await sprint.save();

  return toSprintSummary(sprint);
}

export async function deleteSprint(organizationId: string, projectId: string, sprintId: string): Promise<void> {
  await findProjectOrThrow(organizationId, projectId);
  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  }

  const tasksUsingIt = await Task.countDocuments({ sprintId });
  if (tasksUsingIt > 0) {
    throw new ApiError(
      409,
      "CONFLICT",
      `This sprint still has ${tasksUsingIt} task(s) on it. Move them off first.`
    );
  }

  await sprint.deleteOne();
}

// ----------------------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------------------
// Turns a batch of Task documents into TaskSummary[], resolving every
// assignee's email AND every dependency's title/status in batched queries
// (not one query per task) - same "don't query inside a loop" principle
// every earlier day has used.
async function toTaskSummaries(tasks: InstanceType<typeof Task>[]): Promise<TaskSummary[]> {
  const allAssigneeIds = tasks.flatMap((t) => t.assigneeIds.map((id) => id.toString()));
  const uniqueAssigneeIds = Array.from(new Set(allAssigneeIds));
  const users = uniqueAssigneeIds.length > 0 ? await User.find({ _id: { $in: uniqueAssigneeIds } }) : [];
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  // DAY 11: one batched lookup for every dependency ID across every task in
  // this batch, resolving each to { title, status } so the frontend never
  // has to look a dependency up itself just to show its title.
  const allDependencyIds = tasks.flatMap((t) => t.dependsOnTaskIds.map((id) => id.toString()));
  const uniqueDependencyIds = Array.from(new Set(allDependencyIds));
  const dependencyTasks =
    uniqueDependencyIds.length > 0 ? await Task.find({ _id: { $in: uniqueDependencyIds } }) : [];
  const dependencyById = new Map(dependencyTasks.map((d) => [d._id.toString(), d]));

  return tasks.map((t) => {
    const dependencies = t.dependsOnTaskIds.map((id) => {
      const dep = dependencyById.get(id.toString());
      return {
        id: id.toString(),
        title: dep?.title ?? "unknown",
        status: (dep?.status ?? "todo") as TaskStatus,
      };
    });
    const checklistItems = t.checklistItems.map((item) => ({
      id: item._id.toString(),
      text: item.text,
      isDone: item.isDone,
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      id: t._id.toString(),
      projectId: t.projectId.toString(),
      sprintId: t.sprintId?.toString(),
      parentTaskId: t.parentTaskId?.toString(),
      title: t.title,
      description: t.description,
      status: t.status,
      assigneeIds: t.assigneeIds.map((id) => id.toString()),
      assigneeEmails: t.assigneeIds.map((id) => emailByUserId.get(id.toString()) ?? "unknown"),
      dueDate: t.dueDate?.toISOString(),
      position: t.position,
      dependencies,
      isBlockedByDependencies: dependencies.some((d) => d.status !== "done"),
      checklistItems,
      checklistProgress: {
        done: checklistItems.filter((item) => item.isDone).length,
        total: checklistItems.length,
      },
      createdAt: t.createdAt.toISOString(),
    };
  });
}

export async function listTasks(organizationId: string, projectId: string): Promise<TaskSummary[]> {
  await findProjectOrThrow(organizationId, projectId);
  // Sorted by status then position - exactly the order a Kanban board
  // wants to render each column in.
  const tasks = await Task.find({ projectId }).sort({ status: 1, position: 1 });
  return toTaskSummaries(tasks);
}

export async function createTask(
  organizationId: string,
  projectId: string,
  createdBy: string,
  input: CreateTaskInput
): Promise<TaskSummary> {
  await findProjectOrThrow(organizationId, projectId);
  await assertAssigneesAreOrgMembers(organizationId, input.assigneeIds);

  if (input.sprintId) {
    const sprint = await Sprint.findOne({ _id: input.sprintId, projectId });
    if (!sprint) {
      throw new ApiError(400, "VALIDATION_ERROR", "That sprint does not belong to this project.");
    }
  }

  if (input.parentTaskId) {
    const parent = await Task.findOne({ _id: input.parentTaskId, projectId });
    if (!parent) {
      throw new ApiError(400, "VALIDATION_ERROR", "That parent task does not belong to this project.");
    }
  }

  // New tasks always start in "todo," appended to the end of that column.
  const position = await Task.countDocuments({ projectId, status: "todo" });

  const task = await Task.create({
    organizationId,
    projectId,
    sprintId: input.sprintId,
    parentTaskId: input.parentTaskId,
    title: input.title,
    description: input.description,
    status: "todo",
    assigneeIds: input.assigneeIds,
    dueDate: input.dueDate,
    position,
    createdBy,
  });

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}

export async function updateTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<TaskSummary> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);

  if (input.assigneeIds !== undefined) {
    await assertAssigneesAreOrgMembers(organizationId, input.assigneeIds);
    task.assigneeIds = input.assigneeIds.map((id) => new Types.ObjectId(id));
  }

  if (input.sprintId !== undefined) {
    if (input.sprintId === null) {
      task.sprintId = undefined;
    } else {
      const sprint = await Sprint.findOne({ _id: input.sprintId, projectId });
      if (!sprint) {
        throw new ApiError(400, "VALIDATION_ERROR", "That sprint does not belong to this project.");
      }
      task.sprintId = new Types.ObjectId(input.sprintId);
    }
  }

  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined) task.description = input.description;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate ?? undefined;

  // DAY 11: dependencies. Validated in three steps - no self-dependency,
  // every id actually belongs to this project, and adding them wouldn't
  // create a cycle - see assertNoDependencyCycle below.
  if (input.dependsOnTaskIds !== undefined) {
    const uniqueIds = Array.from(new Set(input.dependsOnTaskIds));
    if (uniqueIds.includes(taskId)) {
      throw new ApiError(400, "VALIDATION_ERROR", "A task can't depend on itself.");
    }
    if (uniqueIds.length > 0) {
      const matchingCount = await Task.countDocuments({ _id: { $in: uniqueIds }, projectId });
      if (matchingCount !== uniqueIds.length) {
        throw new ApiError(400, "VALIDATION_ERROR", "One or more dependencies don't belong to this project.");
      }
      await assertNoDependencyCycle(projectId, taskId, uniqueIds);
    }
    task.dependsOnTaskIds = uniqueIds.map((id) => new Types.ObjectId(id));
  }

  await task.save();

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}

// DAY 11: walks FORWARD through the dependency graph starting from the
// candidate ids someone wants task `taskId` to depend on. If that walk
// ever reaches `taskId` itself, adding the edge would close a loop (e.g.
// A -> B -> A, or a longer A -> B -> C -> A) - reject it with a clear 400
// instead of silently creating a dependency chain that can never resolve.
// `visited` stops the walk from re-checking the same task twice, which
// also protects against infinite looping if a cycle somehow already
// existed in the data.
async function assertNoDependencyCycle(
  projectId: string,
  taskId: string,
  candidateDependsOnIds: string[]
): Promise<void> {
  const visited = new Set<string>();
  const queue = [...candidateDependsOnIds];

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    if (currentId === taskId) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "That dependency would create a cycle (this task would end up depending on itself, indirectly)."
      );
    }
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentTask = await Task.findOne({ _id: currentId, projectId }).select("dependsOnTaskIds");
    if (currentTask) {
      queue.push(...currentTask.dependsOnTaskIds.map((id) => id.toString()));
    }
  }
}

// ----------------------------------------------------------------------------
// MOVE TASK — the drag-and-drop endpoint, and the "server-validated status
// transition" the Day 8 plan specifically calls for.
// ----------------------------------------------------------------------------
// DAY 14: `targetPosition` is optional and, when given, is the exact
// 0-based slot the card should land in within the TARGET column - omit it
// and this behaves exactly like Day 8 (append to the end). Two shapes are
// handled separately below: reordering WITHIN the same column (a plain
// "move array element from index i to index j" operation) and moving to a
// DIFFERENT column (close the gap left behind, then open one at the
// requested slot). Both use atomic Mongo `$inc` updates on just the
// affected rows, rather than fetching and rewriting an entire column.
export async function moveTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  newStatus: TaskStatus,
  targetPosition?: number
): Promise<TaskSummary> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);
  const oldStatus = task.status;
  const oldPosition = task.position;

  // THE ACTUAL SERVER-SIDE RULE: a task can't be marked "done" while any
  // of its OWN subtasks are still open. The frontend never needs to know
  // this rule exists - dragging a card to "Done" just either succeeds or
  // comes back with a clear 409, exactly like Day 5's "last owner can't
  // demote themselves" rule.
  if (newStatus === "done") {
    const openSubtasks = await Task.countDocuments({ parentTaskId: task._id, status: { $ne: "done" } });
    if (openSubtasks > 0) {
      throw new ApiError(
        409,
        "CONFLICT",
        `This task has ${openSubtasks} unfinished subtask(s) - complete those first.`
      );
    }

    // DAY 11: same idea, one level wider - a task can't be marked "done"
    // while anything it explicitly depends on is still open either.
    if (task.dependsOnTaskIds.length > 0) {
      const openDependencies = await Task.countDocuments({
        _id: { $in: task.dependsOnTaskIds },
        status: { $ne: "done" },
      });
      if (openDependencies > 0) {
        throw new ApiError(
          409,
          "CONFLICT",
          `This task depends on ${openDependencies} task(s) that aren't done yet - finish those first.`
        );
      }
    }
  }

  if (oldStatus === newStatus) {
    // Reordering WITHIN the same column. `columnCount` includes this task
    // itself (it's still sitting in this column, in the database, right
    // now), so valid slots run 0..columnCount-1.
    const columnCount = await Task.countDocuments({ projectId, status: newStatus });
    const insertAt = Math.max(0, Math.min(targetPosition ?? oldPosition, columnCount - 1));

    if (insertAt > oldPosition) {
      // Moving DOWN the column: everything strictly after the old slot,
      // up to and including the new slot, shifts UP by one to close the
      // gap this card is leaving behind it.
      await Task.updateMany(
        { projectId, status: newStatus, position: { $gt: oldPosition, $lte: insertAt } },
        { $inc: { position: -1 } }
      );
    } else if (insertAt < oldPosition) {
      // Moving UP the column: everything from the new slot up to (but not
      // including) the old slot shifts DOWN by one to make room.
      await Task.updateMany(
        { projectId, status: newStatus, position: { $gte: insertAt, $lt: oldPosition } },
        { $inc: { position: 1 } }
      );
    }
    task.position = insertAt;
  } else {
    // Moving to a DIFFERENT column. First close the gap left behind in
    // the OLD column (everything after this card's old slot shifts up).
    await Task.updateMany(
      { projectId, status: oldStatus, position: { $gt: oldPosition } },
      { $inc: { position: -1 } }
    );

    // Then open a gap at the requested slot in the NEW column - falling
    // back to "end of column" (Day 8's only option) if no targetPosition
    // was given at all. `targetColumnCount` is safe to use as-is (not
    // "+1"): the task isn't recorded under `newStatus` in the database
    // yet, so it isn't part of this count.
    const targetColumnCount = await Task.countDocuments({ projectId, status: newStatus });
    const insertAt = Math.max(0, Math.min(targetPosition ?? targetColumnCount, targetColumnCount));
    await Task.updateMany(
      { projectId, status: newStatus, position: { $gte: insertAt } },
      { $inc: { position: 1 } }
    );

    task.status = newStatus;
    task.position = insertAt;
  }

  await task.save();

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}

export async function deleteTask(organizationId: string, projectId: string, taskId: string): Promise<void> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);

  const subtaskCount = await Task.countDocuments({ parentTaskId: task._id });
  if (subtaskCount > 0) {
    throw new ApiError(409, "CONFLICT", `This task still has ${subtaskCount} subtask(s). Delete those first.`);
  }

  await task.deleteOne();
  // NOTE: comments/attachments/time entries on this task are deliberately
  // left as-is (not cascade-deleted) - Day 8 keeps deletion simple. A
  // "clean up everything attached to a deleted task" background job would
  // be a reasonable hardening-phase addition later.
}

// ----------------------------------------------------------------------------
// COMMENTS
// ----------------------------------------------------------------------------
// DAY 9: "@" immediately followed by a project member's exact email (e.g.
// "@hamza@example.com") counts as a mention. See task-comment.model.ts's
// top comment for why a full "@" autocomplete picker isn't what Day 9
// builds - this is the deliberately simple, unambiguous version of it.
const MENTION_TOKEN_PATTERN = /@([^\s]+@[^\s]+)/g;

async function detectMentions(organizationId: string, projectId: string, body: string): Promise<Types.ObjectId[]> {
  const candidateEmails = new Set(
    Array.from(body.matchAll(MENTION_TOKEN_PATTERN)).map((match) => (match[1] ?? "").toLowerCase())
  );
  if (candidateEmails.size === 0) return [];

  // Only project members can be mentioned - same tenant boundary as
  // assigning a task (assertAssigneesAreOrgMembers above), one level
  // narrower (project, not just organization).
  const members = await ProjectMember.find({ organizationId, projectId });
  if (members.length === 0) return [];

  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } });
  const userIdByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u._id]));

  const mentioned: Types.ObjectId[] = [];
  for (const email of candidateEmails) {
    const userId = userIdByEmail.get(email);
    if (userId) mentioned.push(userId);
  }
  return mentioned;
}

// Turns a batch of TaskComment documents into TaskCommentSummary[],
// resolving both authors AND mentioned users in a couple of batched
// queries instead of one per comment - same principle as toTaskSummaries.
async function toCommentSummaries(comments: InstanceType<typeof TaskComment>[]): Promise<TaskCommentSummary[]> {
  const allUserIds = new Set<string>();
  for (const c of comments) {
    allUserIds.add(c.authorId.toString());
    for (const id of c.mentionedUserIds) allUserIds.add(id.toString());
  }
  const users = allUserIds.size > 0 ? await User.find({ _id: { $in: Array.from(allUserIds) } }) : [];
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return comments.map((c) => ({
    id: c._id.toString(),
    authorId: c.authorId.toString(),
    authorEmail: emailByUserId.get(c.authorId.toString()) ?? "unknown",
    body: c.body,
    mentionedUserIds: c.mentionedUserIds.map((id) => id.toString()),
    mentionedEmails: c.mentionedUserIds.map((id) => emailByUserId.get(id.toString()) ?? "unknown"),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    isEdited: c.updatedAt.getTime() > c.createdAt.getTime(),
  }));
}

export async function listComments(
  organizationId: string,
  projectId: string,
  taskId: string
): Promise<TaskCommentSummary[]> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const comments = await TaskComment.find({ taskId }).sort({ createdAt: 1 });
  return toCommentSummaries(comments);
}

export async function createComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  authorId: string,
  input: CreateTaskCommentInput
): Promise<TaskCommentSummary> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const mentionedUserIds = await detectMentions(organizationId, projectId, input.body);

  const comment = await TaskComment.create({ organizationId, taskId, authorId, body: input.body, mentionedUserIds });

  const [summary] = await toCommentSummaries([comment]);
  return summary as TaskCommentSummary;
}

// `canManageTasks` is the caller's task.manage permission (resolved by the
// controller) - editing/deleting someone else's comment needs it, editing/
// deleting your OWN comment never does. Same ownership-or-permission shape
// as Day 8's attachment/time-entry deletes.
export async function updateComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  commentId: string,
  actingUserId: string,
  canManageTasks: boolean,
  input: UpdateTaskCommentInput
): Promise<TaskCommentSummary> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const comment = await TaskComment.findOne({ _id: commentId, taskId });
  if (!comment) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Comment not found.");
  }

  const isAuthor = comment.authorId.toString() === actingUserId;
  if (!isAuthor && !canManageTasks) {
    throw new ApiError(403, "FORBIDDEN", "Only the comment's author or a task manager can edit it.");
  }

  comment.body = input.body;
  comment.mentionedUserIds = await detectMentions(organizationId, projectId, input.body);
  await comment.save();

  const [summary] = await toCommentSummaries([comment]);
  return summary as TaskCommentSummary;
}

export async function deleteComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  commentId: string,
  actingUserId: string,
  canManageTasks: boolean
): Promise<void> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const comment = await TaskComment.findOne({ _id: commentId, taskId });
  if (!comment) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Comment not found.");
  }

  const isAuthor = comment.authorId.toString() === actingUserId;
  if (!isAuthor && !canManageTasks) {
    throw new ApiError(403, "FORBIDDEN", "Only the comment's author or a task manager can delete it.");
  }

  await comment.deleteOne();
}

// ----------------------------------------------------------------------------
// ATTACHMENTS  (Day 8: link-only. Day 12 added real uploads - see
// task-attachment.model.ts for the "exactly one of url/storageKey" shape.)
// ----------------------------------------------------------------------------

// Turns ONE TaskAttachment document into a TaskAttachmentSummary. Async
// (unlike every other "toXSummary" helper in this file) because an
// UPLOADED attachment needs a fresh signed URL generated from MinIO every
// single time it's shown - see lib/storage.ts's getSignedDownloadUrl for
// why that URL is short-lived rather than a permanent link.
async function toAttachmentSummary(
  attachment: InstanceType<typeof TaskAttachment>,
  emailByUserId: Map<string, string>
): Promise<TaskAttachmentSummary> {
  const url = attachment.storageKey ? await getSignedDownloadUrl(attachment.storageKey) : (attachment.url as string);

  return {
    id: attachment._id.toString(),
    name: attachment.name,
    url,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedBy: attachment.uploadedBy.toString(),
    uploadedByEmail: emailByUserId.get(attachment.uploadedBy.toString()) ?? "unknown",
    createdAt: attachment.createdAt.toISOString(),
  };
}

export async function listAttachments(
  organizationId: string,
  projectId: string,
  taskId: string
): Promise<TaskAttachmentSummary[]> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const attachments = await TaskAttachment.find({ taskId }).sort({ createdAt: 1 });
  if (attachments.length === 0) return [];

  const userIds = attachments.map((a) => a.uploadedBy);
  const users = await User.find({ _id: { $in: userIds } });
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  // Signed URLs are generated one at a time via Promise.all rather than in
  // a loop with individual awaits - same "don't serialize independent
  // async work" idea as every batched query elsewhere in this file, just
  // applied to calls to MinIO instead of MongoDB this time.
  return Promise.all(attachments.map((a) => toAttachmentSummary(a, emailByUserId)));
}

// The ORIGINAL Day 8 way of adding an attachment - a plain external link,
// no file storage involved at all.
export async function createAttachment(
  organizationId: string,
  projectId: string,
  taskId: string,
  uploadedBy: string,
  input: CreateTaskAttachmentInput
): Promise<TaskAttachmentSummary> {
  await findTaskOrThrow(organizationId, projectId, taskId);

  const attachment = await TaskAttachment.create({
    organizationId,
    taskId,
    name: input.name,
    url: input.url,
    uploadedBy,
  });
  const uploader = await User.findById(uploadedBy);

  return toAttachmentSummary(attachment, new Map(uploader ? [[uploader._id.toString(), uploader.email]] : []));
}

// DAY 12's new way: a REAL uploaded file. `file` is whatever multer hands
// the controller after parsing the multipart request (see
// task.controller.ts's uploadAttachmentHandler) - we only need three
// things off of it: the raw bytes, its MIME type, and its original
// filename (used as a fallback if no `name` was typed in).
export async function createUploadedAttachment(
  organizationId: string,
  projectId: string,
  taskId: string,
  uploadedBy: string,
  file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  providedName: string | undefined
): Promise<TaskAttachmentSummary> {
  await findTaskOrThrow(organizationId, projectId, taskId);

  // The MinIO object key - deliberately namespaced by org/project/task so
  // two different tasks (even in totally different organizations) can
  // never collide on the same key, plus a random id so two uploads of a
  // file with the identical name never overwrite each other either.
  const storageKey = `orgs/${organizationId}/projects/${projectId}/tasks/${taskId}/${randomUUID()}-${file.originalname}`;
  await uploadFileToStorage(storageKey, file.buffer, file.mimetype);

  const attachment = await TaskAttachment.create({
    organizationId,
    taskId,
    name: providedName || file.originalname,
    storageKey,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    uploadedBy,
  });
  const uploader = await User.findById(uploadedBy);

  return toAttachmentSummary(attachment, new Map(uploader ? [[uploader._id.toString(), uploader.email]] : []));
}

// `canManageTasks` is the caller's task.manage permission, resolved by the
// controller from req.membershipPermissions - an attachment can be removed
// by WHOEVER UPLOADED IT, or by anyone with task.manage, whichever comes
// first. Same "ownership OR elevated permission" pattern as Day 3's
// session revocation.
export async function deleteAttachment(
  organizationId: string,
  projectId: string,
  taskId: string,
  attachmentId: string,
  actingUserId: string,
  canManageTasks: boolean
): Promise<void> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const attachment = await TaskAttachment.findOne({ _id: attachmentId, taskId });
  if (!attachment) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Attachment not found.");
  }

  const isUploader = attachment.uploadedBy.toString() === actingUserId;
  if (!isUploader && !canManageTasks) {
    throw new ApiError(403, "FORBIDDEN", "Only the uploader or a task manager can remove this attachment.");
  }

  // DAY 12: an uploaded attachment also has real bytes sitting in MinIO -
  // clean those up too, not just the database row. Deliberately
  // best-effort: if MinIO happens to be unreachable right this moment, we
  // still remove the database record rather than leaving the attachment
  // stuck forever - a orphaned object in MinIO is a much smaller problem
  // than a task the user can no longer manage at all.
  if (attachment.storageKey) {
    try {
      await deleteFileFromStorage(attachment.storageKey);
    } catch (err) {
      // Not re-thrown on purpose - see the comment above.
      console.error("Failed to delete storage object", attachment.storageKey, err);
    }
  }

  await attachment.deleteOne();
}

// ----------------------------------------------------------------------------
// TIME ENTRIES
// ----------------------------------------------------------------------------
export async function listTimeEntries(
  organizationId: string,
  projectId: string,
  taskId: string
): Promise<TimeEntrySummary[]> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const entries = await TimeEntry.find({ taskId }).sort({ workDate: -1 });
  if (entries.length === 0) return [];

  const userIds = entries.map((e) => e.userId);
  const users = await User.find({ _id: { $in: userIds } });
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return entries.map((e) => ({
    id: e._id.toString(),
    userId: e.userId.toString(),
    userEmail: emailByUserId.get(e.userId.toString()) ?? "unknown",
    minutes: e.minutes,
    note: e.note,
    workDate: e.workDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function createTimeEntry(
  organizationId: string,
  projectId: string,
  taskId: string,
  userId: string,
  input: CreateTimeEntryInput
): Promise<TimeEntrySummary> {
  await findTaskOrThrow(organizationId, projectId, taskId);

  const entry = await TimeEntry.create({
    organizationId,
    taskId,
    userId,
    minutes: input.minutes,
    note: input.note,
    workDate: input.workDate,
  });
  const user = await User.findById(userId);

  return {
    id: entry._id.toString(),
    userId: entry.userId.toString(),
    userEmail: user?.email ?? "unknown",
    minutes: entry.minutes,
    note: entry.note,
    workDate: entry.workDate.toISOString(),
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function deleteTimeEntry(
  organizationId: string,
  projectId: string,
  taskId: string,
  entryId: string,
  actingUserId: string,
  canManageTasks: boolean
): Promise<void> {
  await findTaskOrThrow(organizationId, projectId, taskId);
  const entry = await TimeEntry.findOne({ _id: entryId, taskId });
  if (!entry) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Time entry not found.");
  }

  const isOwnEntry = entry.userId.toString() === actingUserId;
  if (!isOwnEntry && !canManageTasks) {
    throw new ApiError(403, "FORBIDDEN", "Only the person who logged this time or a task manager can remove it.");
  }

  await entry.deleteOne();
}

// ----------------------------------------------------------------------------
// CHECKLIST ITEMS  (DAY 11 — any active org member, no permission gate and
// NO ownership concept at all - unlike comments/attachments/time entries,
// an item doesn't even track who added it. A checklist is meant to feel
// like a shared, disposable to-do list on the task, not a set of records
// someone "owns" - see the Day 11 learning note for the full reasoning.)
// ----------------------------------------------------------------------------
export async function addChecklistItem(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: AddChecklistItemInput
): Promise<TaskSummary> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);

  // TYPESCRIPT NOTE: TaskAttrs (task.model.ts) declares every ChecklistItemAttrs
  // field as required, including `_id` and `createdAt` - but those two are
  // exactly the fields Mongoose itself fills in the moment this gets pushed
  // onto a real subdocument array, not something we know yet. The `as
  // ChecklistItemAttrs` here just tells TypeScript "trust me, Mongoose completes
  // this" - the same kind of small, deliberate cast every ORM-backed insert
  // needs somewhere.
  task.checklistItems.push({ text: input.text, isDone: false } as ChecklistItemAttrs);
  await task.save();

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}

export async function updateChecklistItem(
  organizationId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  input: UpdateChecklistItemInput
): Promise<TaskSummary> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);
  const item = task.checklistItems.find((i) => i._id.toString() === itemId);
  if (!item) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Checklist item not found.");
  }

  if (input.text !== undefined) item.text = input.text;
  if (input.isDone !== undefined) item.isDone = input.isDone;
  await task.save();

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}

export async function deleteChecklistItem(
  organizationId: string,
  projectId: string,
  taskId: string,
  itemId: string
): Promise<TaskSummary> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);
  const remaining = task.checklistItems.filter((i) => i._id.toString() !== itemId);
  if (remaining.length === task.checklistItems.length) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Checklist item not found.");
  }

  // Reassigning the whole array (rather than a Mongoose-specific
  // `.pull(...)` call) is deliberate - it works whether `checklistItems`
  // is treated as a plain array or a Mongoose DocumentArray, and Mongoose
  // marks a path modified correctly either way when you assign it a new
  // value.
  task.checklistItems = remaining;
  await task.save();

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}
