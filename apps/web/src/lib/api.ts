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
} from "@opssphere/shared-types";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  CreateInvitationInput,
  CreateOrganizationInput,
  CreateRoleInput,
  CreateDepartmentInput,
  CreateTeamInput,
  CreateOrgInvitationInput,
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectMemberInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "@opssphere/validation";

/**
 * Thin fetch wrapper. Every module's data-fetching hooks (useProjects,
 * useTickets, ...) will eventually build on something like this - one place
 * that knows the base URL, sends cookies, and unwraps the ApiResponse envelope.
 */
async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    credentials: "include", // same job as axios.defaults.withCredentials = true
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = (await res.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new Error(body.message);
  }
  return body.data;
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

// Note: we don't call this one ourselves anywhere yet. When an access
// token expires (after 15 minutes), any protected call will fail with
// AUTHENTICATION_REQUIRED - a later day can wire this up to run
// automatically when that happens. For now it's here so the backend
// feature is reachable and testable from the frontend.
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
