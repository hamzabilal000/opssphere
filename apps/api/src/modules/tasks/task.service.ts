// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The business rules for sprints, tasks, comments, attachments, and time
// entries - same separation as every other service file: no Express here,
// just plain arguments in, plain data out.
// ============================================================================

import { Types } from "mongoose";
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
import type {
  CreateSprintInput,
  UpdateSprintInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
  CreateTaskAttachmentInput,
  CreateTimeEntryInput,
} from "@opssphere/validation";
import type {
  SprintSummary,
  TaskSummary,
  TaskStatus,
  TaskCommentSummary,
  TaskAttachmentSummary,
  TimeEntrySummary,
} from "@opssphere/shared-types";

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
// assignee's email in ONE extra query (not one query per task) - same
// "don't query inside a loop" principle every earlier day has used.
async function toTaskSummaries(tasks: InstanceType<typeof Task>[]): Promise<TaskSummary[]> {
  const allAssigneeIds = tasks.flatMap((t) => t.assigneeIds.map((id) => id.toString()));
  const uniqueAssigneeIds = Array.from(new Set(allAssigneeIds));
  const users = uniqueAssigneeIds.length > 0 ? await User.find({ _id: { $in: uniqueAssigneeIds } }) : [];
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return tasks.map((t) => ({
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
    createdAt: t.createdAt.toISOString(),
  }));
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
  await task.save();

  const [summary] = await toTaskSummaries([task]);
  return summary as TaskSummary;
}

// ----------------------------------------------------------------------------
// MOVE TASK — the drag-and-drop endpoint, and the "server-validated status
// transition" the Day 8 plan specifically calls for.
// ----------------------------------------------------------------------------
export async function moveTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  newStatus: TaskStatus
): Promise<TaskSummary> {
  const task = await findTaskOrThrow(organizationId, projectId, taskId);

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
  }

  // Append to the end of the TARGET column - see task.model.ts's comment
  // on `position` for why Day 8 doesn't support dropping into a precise
  // slot and shifting every other card.
  const position = await Task.countDocuments({ projectId, status: newStatus });

  task.status = newStatus;
  task.position = position;
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
// ATTACHMENTS  (link-based - see task-attachment.model.ts for why)
// ----------------------------------------------------------------------------
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

  return attachments.map((a) => ({
    id: a._id.toString(),
    name: a.name,
    url: a.url,
    uploadedBy: a.uploadedBy.toString(),
    uploadedByEmail: emailByUserId.get(a.uploadedBy.toString()) ?? "unknown",
    createdAt: a.createdAt.toISOString(),
  }));
}

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

  return {
    id: attachment._id.toString(),
    name: attachment.name,
    url: attachment.url,
    uploadedBy: attachment.uploadedBy.toString(),
    uploadedByEmail: uploader?.email ?? "unknown",
    createdAt: attachment.createdAt.toISOString(),
  };
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
