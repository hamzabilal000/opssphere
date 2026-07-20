// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The panel that opens when you click a card on the board: the task's own
// details (title/description/assignees/sprint/due date), its subtasks (any
// OTHER task whose parentTaskId points at this one - see task.model.ts),
// comments, link attachments, and time entries - the full "loop" the Day 8
// acceptance test describes, all in one place instead of separate pages.
// ============================================================================

import { useState } from "react";
import { X, Trash2, Plus, Clock, Paperclip, MessageSquare, ListTree } from "lucide-react";
import type { ProjectMemberSummary, SprintSummary, TaskSummary } from "@opssphere/shared-types";
import {
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useCreateTaskMutation,
  useTaskCommentsQuery,
  useCreateTaskCommentMutation,
  useTaskAttachmentsQuery,
  useCreateTaskAttachmentMutation,
  useDeleteTaskAttachmentMutation,
  useTimeEntriesQuery,
  useCreateTimeEntryMutation,
  useDeleteTimeEntryMutation,
  useMeQuery,
} from "../../lib/queries";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { LoadingState, EmptyState } from "../ui/States";
import { useToast } from "../ui/Toast";

interface TaskDetailModalProps {
  organizationId: string;
  projectId: string;
  task: TaskSummary;
  allTasks: TaskSummary[];
  sprints: SprintSummary[];
  projectMembers: ProjectMemberSummary[];
  canManage: boolean; // frontend-only convenience (see below) - NOT real security
  onClose: () => void;
}

// `canManage` here mirrors the same "hide the button, don't rely on it"
// idea ProjectDetailPage.tsx already uses: it just decides whether editing
// controls even render. The REAL check is task.manage on the backend (see
// tenant.middleware.ts's requirePermission) - a user who somehow submits
// one of these forms without it simply gets a 403 back, exactly like every
// other module.
export function TaskDetailModal({
  organizationId,
  projectId,
  task,
  allTasks,
  sprints,
  projectMembers,
  canManage,
  onClose,
}: TaskDetailModalProps) {
  const { toast } = useToast();
  const meQuery = useMeQuery();
  const currentUserId = meQuery.data?.user.id;

  const updateTaskMutation = useUpdateTaskMutation(organizationId, projectId);
  const deleteTaskMutation = useDeleteTaskMutation(organizationId, projectId);
  const createTaskMutation = useCreateTaskMutation(organizationId, projectId);

  const commentsQuery = useTaskCommentsQuery(organizationId, projectId, task.id);
  const createCommentMutation = useCreateTaskCommentMutation(organizationId, projectId, task.id);

  const attachmentsQuery = useTaskAttachmentsQuery(organizationId, projectId, task.id);
  const createAttachmentMutation = useCreateTaskAttachmentMutation(organizationId, projectId, task.id);
  const deleteAttachmentMutation = useDeleteTaskAttachmentMutation(organizationId, projectId, task.id);

  const timeEntriesQuery = useTimeEntriesQuery(organizationId, projectId, task.id);
  const createTimeEntryMutation = useCreateTimeEntryMutation(organizationId, projectId, task.id);
  const deleteTimeEntryMutation = useDeleteTimeEntryMutation(organizationId, projectId, task.id);

  const [description, setDescription] = useState(task.description);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [newAttachmentName, setNewAttachmentName] = useState("");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newEntryMinutes, setNewEntryMinutes] = useState("");
  const [newEntryNote, setNewEntryNote] = useState("");
  const [newEntryDate, setNewEntryDate] = useState(() => new Date().toISOString().slice(0, 10));

  const subtasks = allTasks.filter((t) => t.parentTaskId === task.id);
  const comments = commentsQuery.data?.comments ?? [];
  const attachments = attachmentsQuery.data?.attachments ?? [];
  const timeEntries = timeEntriesQuery.data?.entries ?? [];

  async function handleSaveDescription() {
    try {
      await updateTaskMutation.mutateAsync({ taskId: task.id, input: { description } });
      toast("Task updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleToggleAssignee(userId: string) {
    const nextAssigneeIds = task.assigneeIds.includes(userId)
      ? task.assigneeIds.filter((id) => id !== userId)
      : [...task.assigneeIds, userId];
    try {
      await updateTaskMutation.mutateAsync({ taskId: task.id, input: { assigneeIds: nextAssigneeIds } });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleSprintChange(sprintId: string) {
    try {
      await updateTaskMutation.mutateAsync({ taskId: task.id, input: { sprintId: sprintId || null } });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDueDateChange(value: string) {
    try {
      await updateTaskMutation.mutateAsync({ taskId: task.id, input: { dueDate: value ? new Date(value) : null } });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDeleteTask() {
    try {
      await deleteTaskMutation.mutateAsync(task.id);
      toast("Task deleted.");
      onClose();
    } catch (err) {
      // Most likely the 409 "still has subtasks" rule from task.service.ts
      toast((err as Error).message, "error");
    }
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTaskMutation.mutateAsync({
        title: newSubtaskTitle,
        description: "",
        parentTaskId: task.id,
        assigneeIds: [],
      });
      setNewSubtaskTitle("");
      toast("Subtask added.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCommentMutation.mutateAsync({ body: newComment });
      setNewComment("");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleAddAttachment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createAttachmentMutation.mutateAsync({ name: newAttachmentName, url: newAttachmentUrl });
      setNewAttachmentName("");
      setNewAttachmentUrl("");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleAddTimeEntry(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTimeEntryMutation.mutateAsync({
        minutes: Number(newEntryMinutes),
        note: newEntryNote,
        workDate: new Date(newEntryDate),
      });
      setNewEntryMinutes("");
      setNewEntryNote("");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mt-8 mb-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
              {task.parentTaskId ? "Subtask" : "Task"}
            </p>
            <h2 className="text-lg font-bold text-slate-900">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Sprint</label>
              <select
                value={task.sprintId ?? ""}
                disabled={!canManage}
                onChange={(e) => handleSprintChange(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
              >
                <option value="">No sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Due date</label>
              <input
                type="date"
                disabled={!canManage}
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) => handleDueDateChange(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Assignees</label>
            <div className="flex flex-wrap gap-2">
              {projectMembers.length === 0 && <p className="text-xs text-slate-400">No project members yet.</p>}
              {projectMembers.map((m) => (
                <label
                  key={m.userId}
                  className={`flex items-center gap-1.5 text-xs rounded-full border px-2 py-1 cursor-pointer ${
                    task.assigneeIds.includes(m.userId)
                      ? "bg-brand-teal/10 border-brand-teal text-brand-dark"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={task.assigneeIds.includes(m.userId)}
                    disabled={!canManage}
                    onChange={() => handleToggleAssignee(m.userId)}
                  />
                  {m.email}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              disabled={!canManage}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleSaveDescription}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="No description yet."
            />
          </div>

          {/* Subtasks - only a TOP-LEVEL task can have subtasks shown here;
              a subtask itself won't recursively show its own subtasks
              (Day 8 keeps nesting to one level, see the Day 8 learning note) */}
          {!task.parentTaskId && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
                <ListTree className="w-4 h-4" /> Subtasks
              </h3>
              {subtasks.length === 0 && <EmptyState label="No subtasks yet." />}
              <ul className="space-y-1 mb-2">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm text-slate-700 py-1">
                    <span>{s.title}</span>
                    <span className="text-xs text-slate-400">{s.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
              {canManage && (
                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <Input
                    required
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="New subtask"
                    className="flex-1"
                  />
                  <Button type="submit" disabled={createTaskMutation.isPending}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
              <MessageSquare className="w-4 h-4" /> Comments
            </h3>
            {commentsQuery.isLoading && <LoadingState />}
            {comments.length === 0 && !commentsQuery.isLoading && <EmptyState label="No comments yet." />}
            <ul className="space-y-2 mb-2">
              {comments.map((c) => (
                <li key={c.id} className="text-sm bg-slate-50 rounded-md p-2">
                  <p className="text-slate-700">{c.body}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {c.authorEmail} — {new Date(c.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddComment} className="flex gap-2">
              <Input
                required
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment…"
                className="flex-1"
              />
              <Button type="submit" disabled={createCommentMutation.isPending}>
                Post
              </Button>
            </form>
          </div>

          {/* Attachments (link-based, see task-attachment.model.ts) */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
              <Paperclip className="w-4 h-4" /> Attachments
            </h3>
            {attachments.length === 0 && !attachmentsQuery.isLoading && <EmptyState label="No attachments yet." />}
            <ul className="space-y-1 mb-2">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-dark underline truncate max-w-[70%]"
                  >
                    {a.name}
                  </a>
                  {(a.uploadedBy === currentUserId || canManage) && (
                    <button
                      onClick={() => deleteAttachmentMutation.mutate(a.id)}
                      className="text-red-600"
                      aria-label="Remove attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddAttachment} className="flex gap-2">
              <Input
                required
                value={newAttachmentName}
                onChange={(e) => setNewAttachmentName(e.target.value)}
                placeholder="Name"
                className="w-1/3"
              />
              <Input
                required
                type="url"
                value={newAttachmentUrl}
                onChange={(e) => setNewAttachmentUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1"
              />
              <Button type="submit" disabled={createAttachmentMutation.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {/* Time entries */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
              <Clock className="w-4 h-4" /> Time logged
            </h3>
            {timeEntries.length === 0 && !timeEntriesQuery.isLoading && <EmptyState label="No time logged yet." />}
            <ul className="space-y-1 mb-2">
              {timeEntries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">
                    {entry.userEmail} — {entry.minutes} min on {new Date(entry.workDate).toLocaleDateString()}
                    {entry.note && <span className="text-slate-400"> ({entry.note})</span>}
                  </span>
                  {(entry.userId === currentUserId || canManage) && (
                    <button
                      onClick={() => deleteTimeEntryMutation.mutate(entry.id)}
                      className="text-red-600"
                      aria-label="Remove time entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddTimeEntry} className="flex gap-2">
              <input
                required
                type="number"
                min={1}
                max={1440}
                value={newEntryMinutes}
                onChange={(e) => setNewEntryMinutes(e.target.value)}
                placeholder="Minutes"
                className="w-24 border border-slate-300 rounded-md px-2 py-2 text-sm"
              />
              <input
                required
                type="date"
                value={newEntryDate}
                onChange={(e) => setNewEntryDate(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-2 text-sm"
              />
              <Input
                value={newEntryNote}
                onChange={(e) => setNewEntryNote(e.target.value)}
                placeholder="Note (optional)"
                className="flex-1"
              />
              <Button type="submit" disabled={createTimeEntryMutation.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {canManage && (
            <div className="pt-2 border-t border-slate-200">
              <Button variant="danger" onClick={handleDeleteTask} disabled={deleteTaskMutation.isPending}>
                <Trash2 className="w-4 h-4 mr-1 inline" /> Delete task
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
