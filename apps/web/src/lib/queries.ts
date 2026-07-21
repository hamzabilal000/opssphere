// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Days 2-5 fetched data the "manual" way in every page:
//     const [data, setData] = useState(...)
//     useEffect(() => { fetchThing().then(setData) }, [])
// That works, but every page had to reinvent loading state, error state,
// and "refetch after a mutation" by hand.
//
// This file is where TanStack Query (installed since Day 1, unused until
// today) finally gets put to work - ONE small custom hook per piece of
// data, each just a thin wrapper around `useQuery` or `useMutation`. Pages
// call these hooks instead of lib/api.ts's functions directly, and get
// `{ data, isLoading, isError }` (or, for mutations, `{ mutate, isPending }`)
// for free.
//
// QUERY KEYS, EXPLAINED: every `useQuery` needs a `queryKey` - an array
// that names WHAT is being fetched (`["organizations"]`,
// `["organizations", id, "roles"]`, ...). TanStack Query uses this key to
// cache results AND to know what to re-fetch after a mutation - see
// `invalidateQueries` calls below, which say "this key's cached data is now
// stale, go fetch it again" instead of us manually calling a refresh
// function after every create/delete like Days 4-5 did by hand.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type {
  CreateOrganizationInput,
  CreateRoleInput,
  UpdateRoleInput,
  CreateDepartmentInput,
  CreateTeamInput,
  CreateOrgInvitationInput,
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectMemberInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  CreateSprintInput,
  UpdateSprintInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
  CreateTaskAttachmentInput,
  CreateTimeEntryInput,
  CreateTicketInput,
  UpdateTicketInput,
  AssignTicketInput,
  UpdateTicketStatusInput,
  CreateTicketCommentInput,
  AddChecklistItemInput,
  UpdateChecklistItemInput,
  CreateRiskInput,
  UpdateRiskInput,
} from "@opssphere/validation";
import type { TaskStatus } from "@opssphere/shared-types";

// ----------------------------------------------------------------------------
// ME / AUTH
// ----------------------------------------------------------------------------
export function useMeQuery() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    // Still `false` as of Day 13, but for a slightly different reason now:
    // api.getMe() already went through ONE silent refresh-and-retry inside
    // lib/api.ts's withAutoRefresh before this queryFn ever resolves or
    // rejects (see lib/api.ts). If it STILL failed, that means the refresh
    // itself failed too - the refresh token is genuinely expired/revoked,
    // not just the short-lived access token. TanStack Query retrying on
    // top of that would just repeat the exact same doomed request.
    retry: false,
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.logoutUser,
    onSuccess: () => {
      // Logging out invalidates EVERYTHING - every org, role, session
      // belonged to the person who just logged out. `clear()` empties the
      // whole cache rather than picking individual keys to invalidate.
      queryClient.clear();
    },
  });
}

// ----------------------------------------------------------------------------
// SESSIONS
// ----------------------------------------------------------------------------
export function useSessionsQuery() {
  return useQuery({ queryKey: ["sessions"], queryFn: api.listSessions });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useRevokeOtherSessionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

// ----------------------------------------------------------------------------
// ORGANIZATIONS
// ----------------------------------------------------------------------------
export function useOrganizationsQuery() {
  return useQuery({ queryKey: ["organizations"], queryFn: api.listOrganizations });
}

export function useOrganizationQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId],
    queryFn: () => api.getOrganization(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => api.createOrganization(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

// ----------------------------------------------------------------------------
// MEMBERS, ROLES, DEPARTMENTS, TEAMS  (all scoped to one organizationId)
// ----------------------------------------------------------------------------
export function useOrganizationMembersQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "members"],
    queryFn: () => api.listOrganizationMembers(organizationId),
    enabled: Boolean(organizationId), // don't fire until we actually have an id
  });
}

export function useOrganizationRolesQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "roles"],
    queryFn: () => api.listRoles(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationDepartmentsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "departments"],
    queryFn: () => api.listDepartments(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationTeamsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "teams"],
    queryFn: () => api.listTeams(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useCreateRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => api.createRole(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "roles"] }),
  });
}

// ADDED post-Day-11: edit an existing role's name/permissions - see
// api.ts's updateRole for why this exists.
export function useUpdateRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: UpdateRoleInput }) =>
      api.updateRole(organizationId, roleId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "roles"] }),
  });
}

export function useDeleteRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => api.deleteRole(organizationId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "roles"] }),
  });
}

export function useCreateDepartmentMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartmentInput) => api.createDepartment(organizationId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "departments"] }),
  });
}

export function useDeleteDepartmentMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentId: string) => api.deleteDepartment(organizationId, departmentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "departments"] }),
  });
}

export function useCreateTeamMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => api.createTeam(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "teams"] }),
  });
}

export function useDeleteTeamMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => api.deleteTeam(organizationId, teamId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "teams"] }),
  });
}

export function useUpdateMemberRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, roleId }: { membershipId: string; roleId: string }) =>
      api.updateMemberRole(organizationId, membershipId, roleId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] }),
  });
}

export function useCreateOrgInvitationMutation(organizationId: string) {
  return useMutation({
    mutationFn: (input: CreateOrgInvitationInput) => api.createOrgInvitation(organizationId, input),
    // No invalidation needed - sending an invitation doesn't change
    // anything the CURRENT org's queries (members/roles/etc) show yet; the
    // invitee only shows up as a real member once they accept it.
  });
}

// ----------------------------------------------------------------------------
// PROJECTS  (Day 7)
// ----------------------------------------------------------------------------
export function useProjectsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects"],
    queryFn: () => api.listProjects(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useProjectQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId],
    queryFn: () => api.getProject(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateProjectMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] }),
  });
}

export function useUpdateProjectMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => api.updateProject(organizationId, projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId] });
    },
  });
}

export function useProjectMembersQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "members"],
    queryFn: () => api.listProjectMembers(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useAddProjectMemberMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddProjectMemberInput) => api.addProjectMember(organizationId, projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "members"],
      });
      // Adding a member changes the project's memberCount too, shown on
      // both the list page and this project's own summary.
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] });
    },
  });
}

export function useRemoveProjectMemberMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.removeProjectMember(organizationId, projectId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "members"],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] });
    },
  });
}

export function useMilestonesQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
    queryFn: () => api.listMilestones(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateMilestoneMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMilestoneInput) => api.createMilestone(organizationId, projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
      }),
  });
}

export function useUpdateMilestoneMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, input }: { milestoneId: string; input: UpdateMilestoneInput }) =>
      api.updateMilestone(organizationId, projectId, milestoneId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
      }),
  });
}

export function useDeleteMilestoneMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: string) => api.deleteMilestone(organizationId, projectId, milestoneId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
      }),
  });
}

// ----------------------------------------------------------------------------
// DAY 8 — SPRINTS, TASKS, COMMENTS, ATTACHMENTS & TIME ENTRIES
// ----------------------------------------------------------------------------

// ---- Sprints -----------------------------------------------------------
export function useSprintsQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "sprints"],
    queryFn: () => api.listSprints(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateSprintMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSprintInput) => api.createSprint(organizationId, projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "sprints"],
      }),
  });
}

export function useUpdateSprintMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sprintId, input }: { sprintId: string; input: UpdateSprintInput }) =>
      api.updateSprint(organizationId, projectId, sprintId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "sprints"],
      }),
  });
}

export function useDeleteSprintMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sprintId: string) => api.deleteSprint(organizationId, projectId, sprintId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "sprints"],
      }),
  });
}

// ---- Tasks (the board) ------------------------------------------------------
export function useTasksQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "tasks"],
    queryFn: () => api.listTasks(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateTaskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(organizationId, projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId, "tasks"] }),
  });
}

export function useUpdateTaskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      api.updateTask(organizationId, projectId, taskId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId, "tasks"] }),
  });
}

// The drag-and-drop mutation - kept separate from useUpdateTaskMutation so a
// board column drop only ever sends `{ status }`, matching the backend's
// deliberately-narrow moveTaskSchema (see task.routes.ts).
export function useMoveTaskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // DAY 14: targetPosition is optional, passed through unchanged to
    // api.moveTask - see TaskBoardPage.tsx's handleDrop for how the board
    // computes it from where a card was actually dropped.
    mutationFn: ({
      taskId,
      status,
      targetPosition,
    }: {
      taskId: string;
      status: TaskStatus;
      targetPosition?: number;
    }) => api.moveTask(organizationId, projectId, taskId, status, targetPosition),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId, "tasks"] }),
  });
}

export function useDeleteTaskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(organizationId, projectId, taskId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId, "tasks"] }),
  });
}

// ---- Comments --------------------------------------------------------------
export function useTaskCommentsQuery(organizationId: string, projectId: string, taskId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "comments"],
    queryFn: () => api.listTaskComments(organizationId, projectId, taskId),
    enabled: Boolean(organizationId) && Boolean(projectId) && Boolean(taskId),
  });
}

export function useCreateTaskCommentMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskCommentInput) => api.createTaskComment(organizationId, projectId, taskId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "comments"],
      }),
  });
}

// DAY 9: edit/delete a comment - same invalidation target as creating one.
// Live updates from OTHER browsers arrive via the socket listener in
// TaskBoardPage/TaskDetailModal instead of a query invalidation, but the
// browser that actually MADE the change still uses this normal mutation
// flow, exactly like every other day's mutations.
export function useUpdateTaskCommentMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: UpdateTaskCommentInput }) =>
      api.updateTaskComment(organizationId, projectId, taskId, commentId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "comments"],
      }),
  });
}

export function useDeleteTaskCommentMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteTaskComment(organizationId, projectId, taskId, commentId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "comments"],
      }),
  });
}

// ---- Attachments -------------------------------------------------------------
export function useTaskAttachmentsQuery(organizationId: string, projectId: string, taskId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "attachments"],
    queryFn: () => api.listTaskAttachments(organizationId, projectId, taskId),
    enabled: Boolean(organizationId) && Boolean(projectId) && Boolean(taskId),
  });
}

export function useCreateTaskAttachmentMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskAttachmentInput) =>
      api.createTaskAttachment(organizationId, projectId, taskId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "attachments"],
      }),
  });
}

export function useDeleteTaskAttachmentMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api.deleteTaskAttachment(organizationId, projectId, taskId, attachmentId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "attachments"],
      }),
  });
}

// DAY 12: the REAL-file counterpart to useCreateTaskAttachmentMutation
// above - same invalidation target, since both kinds of attachment show
// up in the exact same list.
export function useUploadTaskAttachmentMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) =>
      api.uploadTaskAttachment(organizationId, projectId, taskId, file, name),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "attachments"],
      }),
  });
}

// ---- Time entries ----------------------------------------------------------
export function useTimeEntriesQuery(organizationId: string, projectId: string, taskId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "time-entries"],
    queryFn: () => api.listTimeEntries(organizationId, projectId, taskId),
    enabled: Boolean(organizationId) && Boolean(projectId) && Boolean(taskId),
  });
}

export function useCreateTimeEntryMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTimeEntryInput) => api.createTimeEntry(organizationId, projectId, taskId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "time-entries"],
      }),
  });
}

export function useDeleteTimeEntryMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => api.deleteTimeEntry(organizationId, projectId, taskId, entryId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "tasks", taskId, "time-entries"],
      }),
  });
}

// ----------------------------------------------------------------------------
// DAY 10 — SUPPORT TICKETS  (org-level, not nested under a project)
// ----------------------------------------------------------------------------
export function useTicketsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "tickets"],
    queryFn: () => api.listTickets(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useTicketQuery(organizationId: string, ticketId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "tickets", ticketId],
    queryFn: () => api.getTicket(organizationId, ticketId),
    enabled: Boolean(organizationId) && Boolean(ticketId),
  });
}

export function useCreateTicketMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.createTicket(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "tickets"] }),
  });
}

function invalidateTicket(queryClient: ReturnType<typeof useQueryClient>, organizationId: string, ticketId: string) {
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "tickets"] });
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "tickets", ticketId] });
}

export function useUpdateTicketMutation(organizationId: string, ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTicketInput) => api.updateTicket(organizationId, ticketId, input),
    onSuccess: () => invalidateTicket(queryClient, organizationId, ticketId),
  });
}

export function useAssignTicketMutation(organizationId: string, ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignTicketInput) => api.assignTicket(organizationId, ticketId, input),
    onSuccess: () => invalidateTicket(queryClient, organizationId, ticketId),
  });
}

export function useUpdateTicketStatusMutation(organizationId: string, ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTicketStatusInput) => api.updateTicketStatus(organizationId, ticketId, input),
    onSuccess: () => invalidateTicket(queryClient, organizationId, ticketId),
  });
}

export function useTicketCommentsQuery(organizationId: string, ticketId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "tickets", ticketId, "comments"],
    queryFn: () => api.listTicketComments(organizationId, ticketId),
    enabled: Boolean(organizationId) && Boolean(ticketId),
  });
}

export function useCreateTicketCommentMutation(organizationId: string, ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketCommentInput) => api.createTicketComment(organizationId, ticketId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "tickets", ticketId, "comments"],
      }),
  });
}

// ----------------------------------------------------------------------------
// DAY 11 — TASK CHECKLISTS & RISK REGISTER
// ----------------------------------------------------------------------------
// (Task DEPENDENCIES reuse useUpdateTaskMutation above - no new hook.)

// ---- Checklist items --------------------------------------------------------
// All three invalidate the SAME "tasks" list key useUpdateTaskMutation
// already uses - checklistItems/checklistProgress live on TaskSummary
// itself, so there's no separate collection to keep in sync.
function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>, organizationId: string, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId, "tasks"] });
}

export function useAddChecklistItemMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddChecklistItemInput) => api.addChecklistItem(organizationId, projectId, taskId, input),
    onSuccess: () => invalidateTasks(queryClient, organizationId, projectId),
  });
}

export function useUpdateChecklistItemMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateChecklistItemInput }) =>
      api.updateChecklistItem(organizationId, projectId, taskId, itemId, input),
    onSuccess: () => invalidateTasks(queryClient, organizationId, projectId),
  });
}

export function useDeleteChecklistItemMutation(organizationId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.deleteChecklistItem(organizationId, projectId, taskId, itemId),
    onSuccess: () => invalidateTasks(queryClient, organizationId, projectId),
  });
}

// ---- Risk register (PROJECT-level) -----------------------------------------
export function useRisksQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "risks"],
    queryFn: () => api.listRisks(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateRiskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRiskInput) => api.createRisk(organizationId, projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "risks"],
      }),
  });
}

export function useUpdateRiskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ riskId, input }: { riskId: string; input: UpdateRiskInput }) =>
      api.updateRisk(organizationId, projectId, riskId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "risks"],
      }),
  });
}

export function useDeleteRiskMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (riskId: string) => api.deleteRisk(organizationId, projectId, riskId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "risks"],
      }),
  });
}

// ---- DAY 17: notifications ------------------------------------------------
// One shared query key ("notifications") for the whole app - no
// organizationId in it, since the list itself spans every organization the
// logged-in person belongs to (see api.ts's listMyNotifications).
const NOTIFICATIONS_QUERY_KEY = ["notifications"];

export function useNotificationsQuery() {
  return useQuery({ queryKey: NOTIFICATIONS_QUERY_KEY, queryFn: api.listMyNotifications });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.markNotificationRead(notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}
