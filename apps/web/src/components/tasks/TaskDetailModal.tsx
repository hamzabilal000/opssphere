// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The panel that opens when you click a card on the board: the task's own
// details (title/description/assignees/sprint/due date), its subtasks (any
// OTHER task whose parentTaskId points at this one - see task.model.ts),
// comments, link attachments, and time entries - the full "loop" the Day 8
// acceptance test describes, all in one place instead of separate pages.
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import {
  X,
  Trash2,
  Plus,
  Clock,
  Paperclip,
  MessageSquare,
  ListTree,
  Pencil,
  Check,
  GitBranch,
  ListChecks,
  UploadCloud,
} from "lucide-react";
import type { ProjectMemberSummary, SprintSummary, TaskCommentSummary, TaskSummary } from "@opssphere/shared-types";
import {
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useCreateTaskMutation,
  useTaskCommentsQuery,
  useCreateTaskCommentMutation,
  useUpdateTaskCommentMutation,
  useDeleteTaskCommentMutation,
  useTaskAttachmentsQuery,
  useCreateTaskAttachmentMutation,
  useUploadTaskAttachmentMutation,
  useDeleteTaskAttachmentMutation,
  useTimeEntriesQuery,
  useCreateTimeEntryMutation,
  useDeleteTimeEntryMutation,
  useAddChecklistItemMutation,
  useUpdateChecklistItemMutation,
  useDeleteChecklistItemMutation,
  useMeQuery,
} from "../../lib/queries";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { LoadingState, EmptyState } from "../ui/States";
import { useToast } from "../ui/Toast";

// DAY 9: turns "hey @hamza@example.com can you look?" into text with the
// recognized mention visually highlighted. Deliberately simple - it only
// highlights emails the BACKEND already confirmed as real mentions
// (mentionedEmails, resolved server-side in task.service.ts's
// detectMentions), never trying to guess/parse anything client-side itself.
function renderCommentBody(body: string, mentionedEmails: string[]): ReactNode {
  if (mentionedEmails.length === 0) return body;

  const escaped = mentionedEmails.map((email) => email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})`, "gi");
  // TYPESCRIPT NOTE: a capturing group inside .split(...) keeps the
  // matched pieces IN the result array, alternating [text, match, text,
  // match, ...] - that's what lets us tell "was this piece a mention or
  // just regular text" purely from its position (odd index = a match).
  const parts = body.split(pattern);

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="text-brand-dark font-medium bg-teal-50 rounded px-1">
        @{part}
      </span>
    ) : (
      part
    )
  );
}

// DAY 12: a real uploaded file's size arrives as a plain number of bytes
// (see TaskAttachmentSummary.sizeBytes) - this just renders it the way a
// human actually wants to read it ("142 KB" instead of "145238").
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  // DAY 16 ("Hardening"): Escape closes the modal, same as clicking the X
  // or the backdrop below - a keyboard-only user had NO way to dismiss
  // this before today (no mouse, no escape route). This is the one
  // genuinely missing accessibility affordance a modal absolutely needs;
  // a full focus-trap (Tab cycling only within the dialog) is a further
  // polish-phase upgrade, not required to fix the actual gap.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateTaskMutation = useUpdateTaskMutation(organizationId, projectId);
  const deleteTaskMutation = useDeleteTaskMutation(organizationId, projectId);
  const createTaskMutation = useCreateTaskMutation(organizationId, projectId);

  const commentsQuery = useTaskCommentsQuery(organizationId, projectId, task.id);
  const createCommentMutation = useCreateTaskCommentMutation(organizationId, projectId, task.id);
  const updateCommentMutation = useUpdateTaskCommentMutation(organizationId, projectId, task.id);
  const deleteCommentMutation = useDeleteTaskCommentMutation(organizationId, projectId, task.id);

  const attachmentsQuery = useTaskAttachmentsQuery(organizationId, projectId, task.id);
  const createAttachmentMutation = useCreateTaskAttachmentMutation(organizationId, projectId, task.id);
  const uploadAttachmentMutation = useUploadTaskAttachmentMutation(organizationId, projectId, task.id);
  const deleteAttachmentMutation = useDeleteTaskAttachmentMutation(organizationId, projectId, task.id);

  const timeEntriesQuery = useTimeEntriesQuery(organizationId, projectId, task.id);
  const createTimeEntryMutation = useCreateTimeEntryMutation(organizationId, projectId, task.id);
  const deleteTimeEntryMutation = useDeleteTimeEntryMutation(organizationId, projectId, task.id);

  const addChecklistItemMutation = useAddChecklistItemMutation(organizationId, projectId, task.id);
  const updateChecklistItemMutation = useUpdateChecklistItemMutation(organizationId, projectId, task.id);
  const deleteChecklistItemMutation = useDeleteChecklistItemMutation(organizationId, projectId, task.id);

  const [description, setDescription] = useState(task.description);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [newAttachmentName, setNewAttachmentName] = useState("");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newEntryMinutes, setNewEntryMinutes] = useState("");
  const [newEntryNote, setNewEntryNote] = useState("");
  const [newEntryDate, setNewEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newChecklistText, setNewChecklistText] = useState("");

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

  // DAY 11: dependencies reuse the exact same "toggle a checkbox, PATCH the
  // whole array" idea as handleToggleAssignee above - dependsOnTaskIds is
  // just one more field on updateTaskSchema.
  async function handleToggleDependency(otherTaskId: string) {
    const currentIds = task.dependencies.map((d) => d.id);
    const nextIds = currentIds.includes(otherTaskId)
      ? currentIds.filter((id) => id !== otherTaskId)
      : [...currentIds, otherTaskId];
    try {
      await updateTaskMutation.mutateAsync({ taskId: task.id, input: { dependsOnTaskIds: nextIds } });
    } catch (err) {
      // Most likely task.service.ts's "would create a cycle" 400.
      toast((err as Error).message, "error");
    }
  }

  async function handleAddChecklistItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addChecklistItemMutation.mutateAsync({ text: newChecklistText });
      setNewChecklistText("");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleToggleChecklistItem(itemId: string, isDone: boolean) {
    try {
      await updateChecklistItemMutation.mutateAsync({ itemId, input: { isDone } });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDeleteChecklistItem(itemId: string) {
    try {
      await deleteChecklistItemMutation.mutateAsync(itemId);
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

  function startEditComment(comment: TaskCommentSummary) {
    setEditingCommentId(comment.id);
    setEditingBody(comment.body);
  }

  async function handleSaveCommentEdit(commentId: string) {
    try {
      await updateCommentMutation.mutateAsync({ commentId, input: { body: editingBody } });
      setEditingCommentId(null);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await deleteCommentMutation.mutateAsync(commentId);
      toast("Comment deleted.");
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

  // DAY 12: picking a file immediately uploads it - no separate "select
  // then submit" step, unlike the link form above (which needs a name AND
  // a url typed in first). `e.target.value = ""` afterward lets the SAME
  // file be picked again later (browsers otherwise treat re-selecting an
  // unchanged file as "nothing changed," so onChange wouldn't fire twice
  // in a row for the same file without this reset).
  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAttachmentMutation.mutateAsync({ file });
      toast(`"${file.name}" uploaded.`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      e.target.value = "";
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
    // DAY 16: clicking the dimmed backdrop closes the modal too, the same
    // way pressing Escape does above - `onClick` here fires for a click
    // ANYWHERE inside this full-screen div, but the panel below stops that
    // click from bubbling back up, so clicking the actual content never
    // closes it.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${task.parentTaskId ? "Subtask" : "Task"} details: ${task.title}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mt-8 mb-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
              {task.parentTaskId ? "Subtask" : "Task"}
            </p>
            <h2 className="text-lg font-bold text-slate-900">{task.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
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

          {/* Dependencies (DAY 11) - which OTHER tasks in this project must
              be "done" before this one can be marked done, see
              task.service.ts's moveTask for the actual server-side block. */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
              <GitBranch className="w-4 h-4" /> Dependencies
              {task.isBlockedByDependencies && (
                <span className="text-[11px] font-normal text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                  Blocked
                </span>
              )}
            </h3>
            {task.dependencies.length === 0 && <EmptyState label="No dependencies yet." />}
            <ul className="space-y-1 mb-2">
              {task.dependencies.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm text-slate-700 py-1">
                  <span>{d.title}</span>
                  <span className={`text-xs ${d.status === "done" ? "text-teal-600" : "text-amber-600"}`}>
                    {d.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {allTasks.filter((t) => t.id !== task.id).length === 0 && (
                  <p className="text-xs text-slate-400">No other tasks in this project yet.</p>
                )}
                {allTasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => {
                    const isDependency = task.dependencies.some((d) => d.id === t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 text-xs rounded-full border px-2 py-1 cursor-pointer ${
                          isDependency
                            ? "bg-brand-teal/10 border-brand-teal text-brand-dark"
                            : "border-slate-300 text-slate-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={isDependency}
                          onChange={() => handleToggleDependency(t.id)}
                        />
                        {t.title}
                      </label>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Checklist (DAY 11) - deliberately NO canManage gate anywhere
              here: any active member can add, check off, or remove an
              item, see task.service.ts's comment on why a checklist has no
              ownership concept, unlike comments/attachments/time entries. */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
              <ListChecks className="w-4 h-4" /> Checklist
              {task.checklistProgress.total > 0 && (
                <span className="text-xs font-normal text-slate-400">
                  {task.checklistProgress.done}/{task.checklistProgress.total}
                </span>
              )}
            </h3>
            {task.checklistItems.length === 0 && <EmptyState label="No checklist items yet." />}
            <ul className="space-y-1 mb-2">
              {task.checklistItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-2 text-slate-700 flex-1">
                    <input
                      type="checkbox"
                      checked={item.isDone}
                      onChange={(e) => handleToggleChecklistItem(item.id, e.target.checked)}
                    />
                    <span className={item.isDone ? "line-through text-slate-400" : ""}>{item.text}</span>
                  </label>
                  <button
                    onClick={() => handleDeleteChecklistItem(item.id)}
                    className="text-red-600"
                    aria-label="Delete checklist item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddChecklistItem} className="flex gap-2">
              <Input
                required
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                placeholder="New checklist item"
                className="flex-1"
              />
              <Button type="submit" disabled={addChecklistItemMutation.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {/* Comments */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
              <MessageSquare className="w-4 h-4" /> Comments
            </h3>
            {commentsQuery.isLoading && <LoadingState />}
            {comments.length === 0 && !commentsQuery.isLoading && <EmptyState label="No comments yet." />}
            <ul className="space-y-2 mb-2">
              {comments.map((c) => {
                const canEditThis = c.authorId === currentUserId || canManage;
                const isEditing = editingCommentId === c.id;
                return (
                  <li key={c.id} className="text-sm bg-slate-50 rounded-md p-2">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={editingBody}
                          onChange={(e) => setEditingBody(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={() => handleSaveCommentEdit(c.id)}
                          disabled={updateCommentMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setEditingCommentId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-slate-700">{renderCommentBody(c.body, c.mentionedEmails)}</p>
                          {canEditThis && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => startEditComment(c)}
                                className="text-slate-400 hover:text-slate-600"
                                aria-label="Edit comment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="text-red-600"
                                aria-label="Delete comment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {c.authorEmail} — {new Date(c.createdAt).toLocaleString()}
                          {c.isEdited && " (edited)"}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <form onSubmit={handleAddComment} className="flex gap-2">
              <Input
                required
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment… (@email@example.com to mention someone)"
                className="flex-1"
              />
              <Button type="submit" disabled={createCommentMutation.isPending}>
                Post
              </Button>
            </form>
          </div>

          {/* Attachments - Day 8's link-based kind, plus Day 12's real
              uploaded-file kind (see task-attachment.model.ts's "exactly
              one of url/storageKey" comment). Both render identically here
              - the frontend never has to know or care which kind a given
              attachment actually is, see TaskAttachmentSummary's comment. */}
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
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Only present for an UPLOADED attachment - a link
                        attachment has neither field (see shared-types). */}
                    {a.sizeBytes !== undefined && (
                      <span className="text-xs text-slate-400">{formatBytes(a.sizeBytes)}</span>
                    )}
                    {(a.uploadedBy === currentUserId || canManage) && (
                      <button
                        onClick={() => deleteAttachmentMutation.mutate(a.id)}
                        className="text-red-600"
                        aria-label="Remove attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Real upload - a plain <input type="file"> triggers the
                upload the moment something's picked, see handleUploadFile.
                A signed MinIO URL is only valid for 15 minutes (see
                lib/storage.ts) - that's why clicking an old link in this
                list eventually stops working and needs a fresh page load,
                a deliberate, disclosed tradeoff, not a bug. */}
            <label className="flex items-center gap-2 text-sm text-brand-dark border border-dashed border-slate-300 rounded-md px-3 py-2 cursor-pointer hover:bg-slate-50 mb-2">
              <UploadCloud className="w-4 h-4" />
              {uploadAttachmentMutation.isPending ? "Uploading…" : "Upload a file (max 10 MB)"}
              <input
                type="file"
                className="hidden"
                disabled={uploadAttachmentMutation.isPending}
                onChange={handleUploadFile}
              />
            </label>

            <p className="text-xs text-slate-400 mb-1">…or attach a link instead:</p>
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
