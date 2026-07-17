import type { ApiResponse, AuthUser, HealthStatus } from "@opssphere/shared-types";
import type { RegisterInput, LoginInput } from "@opssphere/validation";

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
