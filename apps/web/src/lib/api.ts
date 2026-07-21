import type {
  ApiResponse,
  AuthUser,
  HealthStatus,
  SessionSummary,
  InvitationPreview,
  OrganizationSummary,
  MembershipSummary,
  RoleSummary,
  DepartmentSummary,
  TeamSummary,
  ProjectSummary,
  ProjectMemberSummary,
  MilestoneSummary,
  SprintSummary,
  TaskSummary,
  TaskStatus,
  TaskCommentSummary,
  TaskAttachmentSummary,
  TimeEntrySummary,
  TicketSummary,
  TicketCommentSummary,
  RiskSummary,
} from "@opssphere/shared-types";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  CreateInvitationInput,
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

// DAY 13: a normal `Error` only ever carries a `.message` - there was
// previously no way for calling code (or the retry logic added below) to
// tell WHICH kind of failure just happened without fragile string-matching
// on the message text. `ApiRequestError` carries the backend's own `code`
// string (e.g. "AUTHENTICATION_REQUIRED", "SESSION_REVOKED" - see
// ApiErrorResponse in shared-types) alongside the message. Since it still
// EXTENDS Error, every existing `catch (err) { toast((err as Error).message) }`
// site across the app keeps working completely unchanged - `.message` is
// still there, this just adds one extra field nothing was reading before.
class ApiRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

// The actual fetch-and-unwrap logic, with NO retry behavior of its own -
// `withAutoRefresh` below is what adds retrying on top of this. Both
// apiRequest and apiUpload build on this same low-level function now,
// instead of each duplicating the whole fetch/parse/throw dance (Day 12
// had two nearly-identical copies of this; today merges them into one).
async function rawFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { ...init, credentials: "include" });
  const body = (await res.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new ApiRequestError(body.message, body.code);
  }
  return body.data;
}

// DAY 13: THE actual auto-refresh mechanism. `refreshInFlight` is a
// MODULE-LEVEL variable (shared by every single call, across the whole
// app) - if five components each fire a request at the exact moment the
// access token expires, all five get a 401 back, but we only want to hit
// POST /auth/refresh ONCE, not five times. The first caller to reach here
// creates the shared promise; every other caller just awaits that SAME
// promise instead of starting a second one. Once it settles,
// `refreshInFlight` resets to null so the NEXT time a token genuinely
// expires, a fresh refresh attempt is made.
let refreshInFlight: Promise<void> | null = null;

function refreshAccessTokenOnce(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = rawFetch<null>("/auth/refresh", { method: "POST" })
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Wraps ONE attempt at a request with "if it failed because the access
// token merely expired, silently refresh and try exactly once more."
//
// WHY RETRYING IS SAFE: a 401 AUTHENTICATION_REQUIRED means requireAuth
// (auth.middleware.ts) rejected the request BEFORE it ever reached any
// business logic or touched the database (see every prior day's smoke-
// test notes on this exact point) - so the original attempt never did
// anything. Retrying after a successful refresh is the first attempt that
// actually runs, not a second copy of an action that already happened.
//
// WHY THIS CAN'T LOOP FOREVER: `attempt()` is called at most twice total
// (the original call, then one retry) - the retry itself is a plain
// `rawFetch`/no wrapper, so a 401 on the RETRY just fails for good,
// exactly like today's behavior for everything else. The `path !==
// "/auth/refresh"` check stops the refresh call from ever trying to
// refresh itself if IT gets a 401 (that 401 means the refresh token is
// dead - expired, already rotated, or revoked - which is the actual,
// final "you need to log in again" case, not something more refreshing
// can fix).
async function withAutoRefresh<T>(path: string, attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    const tokenExpired = err instanceof ApiRequestError && err.code === "AUTHENTICATION_REQUIRED";
    if (tokenExpired && path !== "/auth/refresh") {
      try {
        await refreshAccessTokenOnce();
      } catch {
        // The refresh itself failed (refresh token expired/rotated-away/
        // revoked) - there's genuinely nothing left to try. Re-throw the
        // ORIGINAL error, not the refresh's, so every existing catch site
        // still sees the same familiar "please log in again" it always
        // has - the user ultimately lands back on /login via
        // ProtectedRoute exactly like before this day existed.
        throw err;
      }
      return attempt(); // the ONE retry - not wrapped in withAutoRefresh again
    }
    throw err;
  }
}

/**
 * Thin fetch wrapper. Every module's data-fetching hooks (useProjects,
 * useTickets, ...) build on this - one place that knows the base URL,
 * sends cookies, unwraps the ApiResponse envelope, AND (as of Day 13)
 * transparently survives one expired-access-token 401 without the caller
 * ever knowing it happened.
 */
function apiRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  };
  return withAutoRefresh(path, () => rawFetch<T>(path, init));
}

// DAY 12: a SECOND thin wrapper, just for real file uploads. Deliberately
// separate from apiRequest above rather than a shared option, because a
// file upload needs a `FormData` body instead of a JSON string, and -
// important - it must NOT set a "Content-Type" header itself: the browser
// sets `multipart/form-data; boundary=...` automatically when it sees the
// body is a FormData instance, and manually setting Content-Type would
// strip that boundary out and break the upload. DAY 13: now also gets the
// exact same auto-refresh-and-retry behavior as apiRequest, for free, by
// building on the same withAutoRefresh/rawFetch helpers.
function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const init: RequestInit = { method: "POST", body: formData };
  return withAutoRefresh(path, () => rawFetch<T>(path, init));
}

export function getHealth(): Promise<HealthStatus> {
  return apiRequest<HealthStatus>("/health/live");
}

// ============================================================================
// DAY 2 — AUTH API CALLS
// ----------------------------------------------------------------------------
// Notice `RegisterInput` and `LoginInput` are imported from
// "@opssphere/validation" - the EXACT same Zod-derived types the backend
// uses to validate req.body. If the backend ever adds a required field to
// the register schema, TypeScript will immediately flag every place on the
// frontend that calls registerUser() without it.
// ============================================================================

export function registerUser(input: RegisterInput): Promise<{ user: AuthUser }> {
  return apiRequest("/auth/register", { method: "POST", body: input });
}

export function verifyEmail(token: string): Promise<null> {
  return apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function loginUser(input: LoginInput): Promise<{ user: AuthUser }> {
  return apiRequest("/auth/login", { method: "POST", body: input });
}

export function logoutUser(): Promise<null> {
  return apiRequest("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<{ user: AuthUser }> {
  return apiRequest("/auth/me");
}

// ============================================================================
// DAY 3 — SESSIONS, PASSWORD RECOVERY & INVITATIONS API CALLS
// ----------------------------------------------------------------------------
// Same wrapper, same pattern - every function here is just "call this URL,
// unwrap the envelope, return the typed data." Nothing new conceptually
// compared to the Day 2 functions above.
// ============================================================================

// DAY 13: this function itself is no longer what makes auto-refresh
// happen - that logic now lives inside apiRequest/apiUpload's shared
// withAutoRefresh wrapper (above), which calls POST /auth/refresh
// directly whenever ANY request comes back with an expired-token 401, no
// matter which page or hook triggered it. This export is kept around as a
// plain, directly-callable version of the same endpoint - harmless, and
// occasionally useful (e.g. a future "keep me logged in" button that
// refreshes proactively rather than waiting for a 401).
export function refreshSession(): Promise<null> {
  return apiRequest("/auth/refresh", { method: "POST" });
}

export function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return apiRequest("/auth/sessions");
}

export function revokeSession(id: string): Promise<null> {
  return apiRequest(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function revokeOtherSessions(): Promise<null> {
  return apiRequest("/auth/sessions", { method: "DELETE" });
}

export function forgotPassword(input: ForgotPasswordInput): Promise<null> {
  return apiRequest("/auth/forgot-password", { method: "POST", body: input });
}

export function resetPassword(input: ResetPasswordInput): Promise<null> {
  return apiRequest("/auth/reset-password", { method: "POST", body: input });
}

export function createInvitation(input: CreateInvitationInput): Promise<null> {
  return apiRequest("/auth/invitations", { method: "POST", body: input });
}

export function getInvitationPreview(token: string): Promise<InvitationPreview> {
  return apiRequest(`/auth/invitations/${encodeURIComponent(token)}`);
}

export function acceptInvitation(token: string, password: string): Promise<{ user: AuthUser }> {
  return apiRequest(`/auth/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: { password },
  });
}

// ============================================================================
// DAY 4 — ORGANIZATIONS API CALLS
// ============================================================================

export function createOrganization(
  input: CreateOrganizationInput
): Promise<{ organization: OrganizationSummary }> {
  return apiRequest("/organizations", { method: "POST", body: input });
}

export function listOrganizations(): Promise<{ organizations: OrganizationSummary[] }> {
  return apiRequest("/organizations");
}

// DAY 6: previously unused from the frontend's side - the backend route
// has existed since Day 4 (see organization.routes.ts), but every page
// until now only ever needed the LIST of organizations, never one on its
// own. OrganizationDetailPage.tsx is the first page that does.
export function getOrganization(organizationId: string): Promise<{ organization: OrganizationSummary }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}`);
}

export function listOrganizationMembers(
  organizationId: string
): Promise<{ members: MembershipSummary[] }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/members`);
}

// ============================================================================
// DAY 5 — ROLES, DEPARTMENTS, TEAMS & ORG-SCOPED INVITATIONS
// ----------------------------------------------------------------------------
// Same wrapper, same pattern, one new idea: every one of these calls can
// come back with a 403 FORBIDDEN if the logged-in user's role doesn't have
// the matching permission - apiRequest already turns that into a thrown
// Error (see the `if (!body.success) throw ...` above), so callers just
// need an ordinary try/catch, same as any other error.
// ============================================================================

export function updateMemberRole(organizationId: string, membershipId: string, roleId: string): Promise<null> {
  return apiRequest(
    `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(membershipId)}`,
    { method: "PATCH", body: { roleId } }
  );
}

export function listRoles(organizationId: string): Promise<{ roles: RoleSummary[] }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/roles`);
}

export function createRole(organizationId: string, input: CreateRoleInput): Promise<{ role: RoleSummary }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/roles`, {
    method: "POST",
    body: input,
  });
}

// ADDED post-Day-11: edits an EXISTING role's name and/or permissions -
// see updateRoleSchema in packages/validation for why this closes a real
// gap (an org's Owner role can be frozen at whatever permissions existed
// when the org was created).
export function updateRole(
  organizationId: string,
  roleId: string,
  input: UpdateRoleInput
): Promise<{ role: RoleSummary }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteRole(organizationId: string, roleId: string): Promise<null> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}

export function listDepartments(organizationId: string): Promise<{ departments: DepartmentSummary[] }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/departments`);
}

export function createDepartment(
  organizationId: string,
  input: CreateDepartmentInput
): Promise<{ department: DepartmentSummary }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/departments`, {
    method: "POST",
    body: input,
  });
}

export function deleteDepartment(organizationId: string, departmentId: string): Promise<null> {
  return apiRequest(
    `/organizations/${encodeURIComponent(organizationId)}/departments/${encodeURIComponent(departmentId)}`,
    { method: "DELETE" }
  );
}

export function listTeams(organizationId: string): Promise<{ teams: TeamSummary[] }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/teams`);
}

export function createTeam(organizationId: string, input: CreateTeamInput): Promise<{ team: TeamSummary }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/teams`, {
    method: "POST",
    body: input,
  });
}

export function deleteTeam(organizationId: string, teamId: string): Promise<null> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
  });
}

export function createOrgInvitation(organizationId: string, input: CreateOrgInvitationInput): Promise<null> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/invitations`, {
    method: "POST",
    body: input,
  });
}

// ============================================================================
// DAY 7 — PROJECTS, PROJECT MEMBERS & MILESTONES
// ============================================================================

function projectsBase(organizationId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}/projects`;
}

export function listProjects(organizationId: string): Promise<{ projects: ProjectSummary[] }> {
  return apiRequest(projectsBase(organizationId));
}

export function createProject(
  organizationId: string,
  input: CreateProjectInput
): Promise<{ project: ProjectSummary }> {
  return apiRequest(projectsBase(organizationId), { method: "POST", body: input });
}

export function getProject(organizationId: string, projectId: string): Promise<{ project: ProjectSummary }> {
  return apiRequest(`${projectsBase(organizationId)}/${encodeURIComponent(projectId)}`);
}

export function updateProject(
  organizationId: string,
  projectId: string,
  input: UpdateProjectInput
): Promise<{ project: ProjectSummary }> {
  return apiRequest(`${projectsBase(organizationId)}/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function listProjectMembers(
  organizationId: string,
  projectId: string
): Promise<{ members: ProjectMemberSummary[] }> {
  return apiRequest(`${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/members`);
}

export function addProjectMember(
  organizationId: string,
  projectId: string,
  input: AddProjectMemberInput
): Promise<{ member: ProjectMemberSummary }> {
  return apiRequest(`${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/members`, {
    method: "POST",
    body: input,
  });
}

export function removeProjectMember(organizationId: string, projectId: string, memberId: string): Promise<null> {
  return apiRequest(
    `${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" }
  );
}

export function listMilestones(
  organizationId: string,
  projectId: string
): Promise<{ milestones: MilestoneSummary[] }> {
  return apiRequest(`${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/milestones`);
}

export function createMilestone(
  organizationId: string,
  projectId: string,
  input: CreateMilestoneInput
): Promise<{ milestone: MilestoneSummary }> {
  return apiRequest(`${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/milestones`, {
    method: "POST",
    body: input,
  });
}

export function updateMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput
): Promise<{ milestone: MilestoneSummary }> {
  return apiRequest(
    `${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
    { method: "PATCH", body: input }
  );
}

export function deleteMilestone(organizationId: string, projectId: string, milestoneId: string): Promise<null> {
  return apiRequest(
    `${projectsBase(organizationId)}/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
    { method: "DELETE" }
  );
}

// ============================================================================
// DAY 8 — SPRINTS, TASKS, COMMENTS, ATTACHMENTS & TIME ENTRIES
// ============================================================================

function projectPath(organizationId: string, projectId: string): string {
  return `${projectsBase(organizationId)}/${encodeURIComponent(projectId)}`;
}

function taskPath(organizationId: string, projectId: string, taskId: string): string {
  return `${projectPath(organizationId, projectId)}/tasks/${encodeURIComponent(taskId)}`;
}

// ---- Sprints ---------------------------------------------------------------
export function listSprints(organizationId: string, projectId: string): Promise<{ sprints: SprintSummary[] }> {
  return apiRequest(`${projectPath(organizationId, projectId)}/sprints`);
}

export function createSprint(
  organizationId: string,
  projectId: string,
  input: CreateSprintInput
): Promise<{ sprint: SprintSummary }> {
  return apiRequest(`${projectPath(organizationId, projectId)}/sprints`, { method: "POST", body: input });
}

export function updateSprint(
  organizationId: string,
  projectId: string,
  sprintId: string,
  input: UpdateSprintInput
): Promise<{ sprint: SprintSummary }> {
  return apiRequest(`${projectPath(organizationId, projectId)}/sprints/${encodeURIComponent(sprintId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteSprint(organizationId: string, projectId: string, sprintId: string): Promise<null> {
  return apiRequest(`${projectPath(organizationId, projectId)}/sprints/${encodeURIComponent(sprintId)}`, {
    method: "DELETE",
  });
}

// ---- Tasks -------------------------------------------------------------------
export function listTasks(organizationId: string, projectId: string): Promise<{ tasks: TaskSummary[] }> {
  return apiRequest(`${projectPath(organizationId, projectId)}/tasks`);
}

export function createTask(
  organizationId: string,
  projectId: string,
  input: CreateTaskInput
): Promise<{ task: TaskSummary }> {
  return apiRequest(`${projectPath(organizationId, projectId)}/tasks`, { method: "POST", body: input });
}

export function updateTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<{ task: TaskSummary }> {
  return apiRequest(taskPath(organizationId, projectId, taskId), { method: "PATCH", body: input });
}

// DAY 14: `targetPosition` is optional - an exact 0-based slot within the
// target column. Omit it to keep Day 8's original "append to the end"
// behavior; the board now passes it whenever a card is dropped ON another
// card (not just onto an empty column).
export function moveTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  status: TaskStatus,
  targetPosition?: number
): Promise<{ task: TaskSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/move`, {
    method: "PATCH",
    body: { status, targetPosition },
  });
}

export function deleteTask(organizationId: string, projectId: string, taskId: string): Promise<null> {
  return apiRequest(taskPath(organizationId, projectId, taskId), { method: "DELETE" });
}

// ---- Comments ------------------------------------------------------------
export function listTaskComments(
  organizationId: string,
  projectId: string,
  taskId: string
): Promise<{ comments: TaskCommentSummary[] }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/comments`);
}

export function createTaskComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: CreateTaskCommentInput
): Promise<{ comment: TaskCommentSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/comments`, { method: "POST", body: input });
}

export function updateTaskComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  commentId: string,
  input: UpdateTaskCommentInput
): Promise<{ comment: TaskCommentSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteTaskComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  commentId: string
): Promise<null> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}

// ---- Attachments (link-based, see task-attachment.model.ts) --------------
export function listTaskAttachments(
  organizationId: string,
  projectId: string,
  taskId: string
): Promise<{ attachments: TaskAttachmentSummary[] }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/attachments`);
}

export function createTaskAttachment(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: CreateTaskAttachmentInput
): Promise<{ attachment: TaskAttachmentSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/attachments`, {
    method: "POST",
    body: input,
  });
}

// DAY 12: the REAL-file counterpart to createTaskAttachment above - builds
// a FormData object (the browser's own "multipart form" data structure)
// instead of a plain JS object, and posts it via apiUpload instead of
// apiRequest. `name` is optional - if left blank, the backend falls back
// to the file's own filename (see uploadTaskAttachmentSchema).
export function uploadTaskAttachment(
  organizationId: string,
  projectId: string,
  taskId: string,
  file: File,
  name?: string
): Promise<{ attachment: TaskAttachmentSummary }> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  return apiUpload(`${taskPath(organizationId, projectId, taskId)}/attachments/upload`, formData);
}

export function deleteTaskAttachment(
  organizationId: string,
  projectId: string,
  taskId: string,
  attachmentId: string
): Promise<null> {
  return apiRequest(
    `${taskPath(organizationId, projectId, taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" }
  );
}

// ---- Time entries ----------------------------------------------------------
export function listTimeEntries(
  organizationId: string,
  projectId: string,
  taskId: string
): Promise<{ entries: TimeEntrySummary[] }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/time-entries`);
}

export function createTimeEntry(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: CreateTimeEntryInput
): Promise<{ entry: TimeEntrySummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/time-entries`, {
    method: "POST",
    body: input,
  });
}

export function deleteTimeEntry(
  organizationId: string,
  projectId: string,
  taskId: string,
  entryId: string
): Promise<null> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/time-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}

// ============================================================================
// DAY 10 — SUPPORT TICKETS
// ----------------------------------------------------------------------------
// Deliberately ORG-level, not nested under a project - see ticket.model.ts.
// ============================================================================

function ticketsBase(organizationId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}/tickets`;
}

export function listTickets(organizationId: string): Promise<{ tickets: TicketSummary[] }> {
  return apiRequest(ticketsBase(organizationId));
}

export function getTicket(organizationId: string, ticketId: string): Promise<{ ticket: TicketSummary }> {
  return apiRequest(`${ticketsBase(organizationId)}/${encodeURIComponent(ticketId)}`);
}

export function createTicket(
  organizationId: string,
  input: CreateTicketInput
): Promise<{ ticket: TicketSummary }> {
  return apiRequest(ticketsBase(organizationId), { method: "POST", body: input });
}

export function updateTicket(
  organizationId: string,
  ticketId: string,
  input: UpdateTicketInput
): Promise<{ ticket: TicketSummary }> {
  return apiRequest(`${ticketsBase(organizationId)}/${encodeURIComponent(ticketId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function assignTicket(
  organizationId: string,
  ticketId: string,
  input: AssignTicketInput
): Promise<{ ticket: TicketSummary }> {
  return apiRequest(`${ticketsBase(organizationId)}/${encodeURIComponent(ticketId)}/assign`, {
    method: "PATCH",
    body: input,
  });
}

export function updateTicketStatus(
  organizationId: string,
  ticketId: string,
  input: UpdateTicketStatusInput
): Promise<{ ticket: TicketSummary }> {
  return apiRequest(`${ticketsBase(organizationId)}/${encodeURIComponent(ticketId)}/status`, {
    method: "PATCH",
    body: input,
  });
}

export function listTicketComments(
  organizationId: string,
  ticketId: string
): Promise<{ comments: TicketCommentSummary[] }> {
  return apiRequest(`${ticketsBase(organizationId)}/${encodeURIComponent(ticketId)}/comments`);
}

export function createTicketComment(
  organizationId: string,
  ticketId: string,
  input: CreateTicketCommentInput
): Promise<{ comment: TicketCommentSummary }> {
  return apiRequest(`${ticketsBase(organizationId)}/${encodeURIComponent(ticketId)}/comments`, {
    method: "POST",
    body: input,
  });
}

// ============================================================================
// DAY 11 — TASK CHECKLISTS & RISK REGISTER
// ----------------------------------------------------------------------------
// (Task DEPENDENCIES reuse the existing updateTask() function above, not a
// new endpoint - `dependsOnTaskIds` is just one more field on
// UpdateTaskInput, see packages/validation.)
// ============================================================================

// ---- Checklist items --------------------------------------------------------
// Every one of these returns the WHOLE updated task (not just the item) -
// same idea as moveTask above, since checklistItems/checklistProgress live
// on TaskSummary itself.
export function addChecklistItem(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: AddChecklistItemInput
): Promise<{ task: TaskSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/checklist-items`, {
    method: "POST",
    body: input,
  });
}

export function updateChecklistItem(
  organizationId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  input: UpdateChecklistItemInput
): Promise<{ task: TaskSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/checklist-items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteChecklistItem(
  organizationId: string,
  projectId: string,
  taskId: string,
  itemId: string
): Promise<{ task: TaskSummary }> {
  return apiRequest(`${taskPath(organizationId, projectId, taskId)}/checklist-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

// ---- Risk register (PROJECT-level, unlike Day 10's org-level tickets) -----
function risksBase(organizationId: string, projectId: string): string {
  return `${projectPath(organizationId, projectId)}/risks`;
}

export function listRisks(organizationId: string, projectId: string): Promise<{ risks: RiskSummary[] }> {
  return apiRequest(risksBase(organizationId, projectId));
}

export function createRisk(
  organizationId: string,
  projectId: string,
  input: CreateRiskInput
): Promise<{ risk: RiskSummary }> {
  return apiRequest(risksBase(organizationId, projectId), { method: "POST", body: input });
}

export function updateRisk(
  organizationId: string,
  projectId: string,
  riskId: string,
  input: UpdateRiskInput
): Promise<{ risk: RiskSummary }> {
  return apiRequest(`${risksBase(organizationId, projectId)}/${encodeURIComponent(riskId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteRisk(organizationId: string, projectId: string, riskId: string): Promise<null> {
  return apiRequest(`${risksBase(organizationId, projectId)}/${encodeURIComponent(riskId)}`, { method: "DELETE" });
}
