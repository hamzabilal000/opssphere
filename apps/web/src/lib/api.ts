import type {
  ApiResponse,
  AuthUser,
  HealthStatus,
  SessionSummary,
  InvitationPreview,
  OrganizationSummary,
  MembershipSummary,
} from "@opssphere/shared-types";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  CreateInvitationInput,
  CreateOrganizationInput,
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

export function listOrganizationMembers(
  organizationId: string
): Promise<{ members: MembershipSummary[] }> {
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/members`);
}
