// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Kanban board - the main deliverable of Day 8. Four columns (see
// TaskStatus in shared-types), drag-and-drop between them, a sprint filter,
// and a quick "add task" form. Clicking a card opens TaskDetailModal for
// everything else (assignees, subtasks, comments, attachments, time).
//
// ONE DELIBERATE SCOPE CHOICE: only TOP-LEVEL tasks (no parentTaskId) get
// their own card on the board. Subtasks live inside their parent's detail
// modal instead of cluttering the columns with two tiers of cards - see the
// Day 8 learning note for the full reasoning.
// ============================================================================

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, ListTree, Radio } from "lucide-react";
import { SOCKET_EVENTS, type TaskStatus, type TaskSummary } from "@opssphere/shared-types";
import {
  useOrganizationQuery,
  useProjectQuery,
  useProjectMembersQuery,
  useTasksQuery,
  useCreateTaskMutation,
  useMoveTaskMutation,
  useSprintsQuery,
  useCreateSprintMutation,
} from "../lib/queries";
import { useProjectSocket } from "../lib/socket";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";
import { TaskDetailModal } from "../components/tasks/TaskDetailModal";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "done", label: "Done" },
];

export default function TaskBoardPage() {
  const { organizationId = "", projectId = "" } = useParams<{ organizationId: string; projectId: string }>();
  const { toast } = useToast();

  const orgQuery = useOrganizationQuery(organizationId);
  const projectQuery = useProjectQuery(organizationId, projectId);
  const membersQuery = useProjectMembersQuery(organizationId, projectId);
  const tasksQuery = useTasksQuery(organizationId, projectId);
  const sprintsQuery = useSprintsQuery(organizationId, projectId);
  const createTaskMutation = useCreateTaskMutation(organizationId, projectId);
  const moveTaskMutation = useMoveTaskMutation(organizationId, projectId);
  const createSprintMutation = useCreateSprintMutation(organizationId, projectId);
  const queryClient = useQueryClient();

  // DAY 9: live updates. Every handler here just invalidates the relevant
  // TanStack Query cache key - the exact same key useTasksQuery/
  // useTaskCommentsQuery already use - so the actual re-fetch-and-re-render
  // logic is 100% reused from Day 6-8, not reinvented. See lib/socket.ts.
  const tasksQueryKey = ["organizations", organizationId, "projects", projectId, "tasks"];
  const { connected: liveConnected } = useProjectSocket(organizationId, projectId, {
    [SOCKET_EVENTS.TASK_CREATED]: () => queryClient.invalidateQueries({ queryKey: tasksQueryKey }),
    [SOCKET_EVENTS.TASK_UPDATED]: () => queryClient.invalidateQueries({ queryKey: tasksQueryKey }),
    [SOCKET_EVENTS.TASK_MOVED]: () => queryClient.invalidateQueries({ queryKey: tasksQueryKey }),
    [SOCKET_EVENTS.TASK_DELETED]: () => queryClient.invalidateQueries({ queryKey: tasksQueryKey }),
    [SOCKET_EVENTS.COMMENT_CREATED]: (payload) =>
      queryClient.invalidateQueries({ queryKey: [...tasksQueryKey, payload.taskId, "comments"] }),
    [SOCKET_EVENTS.COMMENT_UPDATED]: (payload) =>
      queryClient.invalidateQueries({ queryKey: [...tasksQueryKey, payload.taskId, "comments"] }),
    [SOCKET_EVENTS.COMMENT_DELETED]: (payload) =>
      queryClient.invalidateQueries({ queryKey: [...tasksQueryKey, payload.taskId, "comments"] }),
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");

  // Same frontend-only "hide the button" convenience as ProjectDetailPage -
  // task.manage is what actually gates writes on the backend.
  const canManage = orgQuery.data?.organization.myRole !== "Member";

  if (tasksQuery.isLoading || projectQuery.isLoading) return <LoadingState label="Loading board…" />;
  if (tasksQuery.isError || !tasksQuery.data) return <ErrorState label="Couldn't load this board." />;

  const allTasks = tasksQuery.data.tasks;
  const sprints = sprintsQuery.data?.sprints ?? [];
  const projectMembers = membersQuery.data?.members ?? [];
  const project = projectQuery.data?.project;

  const topLevelTasks = allTasks.filter((t) => !t.parentTaskId);
  const visibleTasks =
    sprintFilter === "all"
      ? topLevelTasks
      : sprintFilter === "none"
        ? topLevelTasks.filter((t) => !t.sprintId)
        : topLevelTasks.filter((t) => t.sprintId === sprintFilter);

  const selectedTask = selectedTaskId ? allTasks.find((t) => t.id === selectedTaskId) ?? null : null;

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTaskMutation.mutateAsync({ title: newTaskTitle, description: "", assigneeIds: [] });
      setNewTaskTitle("");
      toast("Task created.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleCreateSprint(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createSprintMutation.mutateAsync({
        name: newSprintName,
        startDate: new Date(newSprintStart),
        endDate: new Date(newSprintEnd),
      });
      setNewSprintName("");
      setNewSprintStart("");
      setNewSprintEnd("");
      setShowSprintForm(false);
      toast("Sprint created.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  function handleDrop(status: TaskStatus, e: React.DragEvent) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;
    const task = allTasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    moveTaskMutation.mutate(
      { taskId, status },
      {
        onError: (err) => toast((err as Error).message, "error"),
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{project?.name ?? "Board"}</h1>
            {/* DAY 9: a quiet signal that live updates are actually
                connected - not required to use the board, just honest
                feedback instead of a silent socket that might have failed. */}
            <span
              className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
                liveConnected ? "bg-teal-50 text-brand-teal" : "bg-slate-100 text-slate-400"
              }`}
              title={liveConnected ? "Live updates connected" : "Live updates not connected"}
            >
              <Radio className="w-3 h-3" /> {liveConnected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="text-slate-500 text-sm">Drag a card between columns to change its status.</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="all">All sprints</option>
            <option value="none">No sprint</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {canManage && (
            <Button variant="secondary" onClick={() => setShowSprintForm((v) => !v)}>
              + Sprint
            </Button>
          )}
        </div>
      </div>

      {showSprintForm && canManage && (
        <Card>
          <form onSubmit={handleCreateSprint} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Name</label>
              <Input required value={newSprintName} onChange={(e) => setNewSprintName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Start</label>
              <input
                required
                type="date"
                value={newSprintStart}
                onChange={(e) => setNewSprintStart(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">End</label>
              <input
                required
                type="date"
                value={newSprintEnd}
                onChange={(e) => setNewSprintEnd(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={createSprintMutation.isPending}>
              Create sprint
            </Button>
          </form>
        </Card>
      )}

      {canManage && (
        <form onSubmit={handleAddTask} className="flex gap-2">
          <Input
            required
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="New task title — starts in To Do"
            className="flex-1"
          />
          <Button type="submit" disabled={createTaskMutation.isPending}>
            <Plus className="w-4 h-4 mr-1 inline" /> Add task
          </Button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((column) => {
          const columnTasks = visibleTasks
            .filter((t) => t.status === column.status)
            .sort((a, b) => a.position - b.position);

          return (
            <div
              key={column.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(column.status, e)}
              className="bg-slate-100 rounded-lg p-3 min-h-[300px]"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm text-slate-700">{column.label}</h2>
                <span className="text-xs text-slate-400">{columnTasks.length}</span>
              </div>

              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    allTasks={allTasks}
                    draggable={canManage}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                ))}
                {columnTasks.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Drop a card here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailModal
          organizationId={organizationId}
          projectId={projectId}
          task={selectedTask}
          allTasks={allTasks}
          sprints={sprints}
          projectMembers={projectMembers}
          canManage={canManage}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// One card on the board.
// ----------------------------------------------------------------------------
function TaskCard({
  task,
  allTasks,
  draggable,
  onClick,
}: {
  task: TaskSummary;
  allTasks: TaskSummary[];
  draggable: boolean;
  onClick: () => void;
}) {
  const subtaskCount = allTasks.filter((t) => t.parentTaskId === task.id).length;

  return (
    <button
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-md p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <p className="text-sm font-medium text-slate-900">{task.title}</p>
      {task.assigneeEmails.length > 0 && (
        <p className="text-xs text-slate-500 mt-1 truncate">{task.assigneeEmails.join(", ")}</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
        {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
        {subtaskCount > 0 && (
          <span className="flex items-center gap-0.5">
            <ListTree className="w-3 h-3" /> {subtaskCount}
          </span>
        )}
      </div>
    </button>
  );
}
