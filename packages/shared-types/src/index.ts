// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This file has NO real logic in it at all — it only describes SHAPES of
// data (what fields an object has, and what type each field is). Nothing
// here runs when the app starts; it's pure TypeScript "documentation" that
// your editor and the compiler use to catch mistakes.
//
// WHY IT LIVES IN ITS OWN PACKAGE (not inside apps/api or apps/web):
// both the backend AND the frontend need to agree on "what does a response
// from the API look like?" By keeping the shape in one shared file that
// BOTH sides import, they can never quietly disagree — if the backend
// changes a field name here, the frontend code using the old name will
// show a red underline immediately instead of silently breaking at runtime.
// ============================================================================

// ----------------------------------------------------------------------------
// TYPESCRIPT NOTE: what does `interface X { ... }` actually mean?
// ----------------------------------------------------------------------------
// Think of an interface as a FORM TEMPLATE. It doesn't create any real data
// by itself — it just says "if you claim to be a `PaginationMeta`, you MUST
// have a `page` field that's a number, a `limit` field that's a number,"
// and so on. If you build an object that's missing one of these fields (or
// has the wrong type), TypeScript will complain — BEFORE you ever run the
// code, not after.
//
// In plain JavaScript (which you're used to), you might build an object
// like this and just hope every part of your app agrees on its shape:
//     { page: 1, limit: 25, total: 40, totalPages: 2 }
// An interface just writes that expectation down explicitly, once.
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ----------------------------------------------------------------------------
// TYPESCRIPT NOTE: the `<T>` you'll see below is called a "generic"
// ----------------------------------------------------------------------------
// Every successful API response in this project has the same overall
// wrapper: `{ success: true, data: ..., message: ..., meta: ... }`. The
// ONLY thing that changes each time is what `data` actually contains — for
// a login it might be a User, for a task list it might be an array of
// Tasks. `<T>` is a placeholder that means "fill this in later with
// whatever type you need." A concrete example:
//     ApiSuccessResponse<HealthStatus>   -> data is a HealthStatus object
//     ApiSuccessResponse<Task[]>         -> data is an array of Task objects
// This is exactly how the health check route uses it — see
// apps/api/src/modules/health/health.routes.ts.
export interface ApiSuccessResponse<T> {
  success: true; // not just "boolean" — LITERALLY always the value `true` on this type
  message?: string; // the `?` means this field is optional
  data: T; // whatever type was filled in for T
  meta?: Partial<PaginationMeta> & { requestId?: string };
  // TYPESCRIPT NOTE: `Partial<PaginationMeta>` means "all the same fields as
  // PaginationMeta, but every single one is now optional." The `&` combines
  // two shapes into one ("this object must satisfy BOTH sides").
}

// The error version of the same envelope — see SRS section 12.2.
export interface ApiErrorResponse {
  success: false; // LITERALLY always `false` on this type (opposite of the success type above)
  message: string;
  code: string;
  errors?: Array<{ field: string; message: string }>;
  requestId?: string;
}

// TYPESCRIPT NOTE: `type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;`
// The `|` means "either one shape OR the other" (a "union type"). This
// means: "an ApiResponse is EITHER a success envelope (success: true, with
// data) OR an error envelope (success: false, with a message) — never a
// mix of both." Your code can check `if (response.success) { ... }` and
// TypeScript will know exactly which fields are safe to use inside that
// `if` block.
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Every tenant-owned MongoDB document (Project, Task, Ticket, ...) will
// eventually extend this same base shape — see SRS section 11.1. We're not
// using it for anything yet on Day 1; it's here so future modules have a
// starting point to build on.
export interface TenantOwnedBase {
  id: string;
  organizationId: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// The exact shape of the JSON returned by /api/v1/health/live and /ready.
export interface HealthStatus {
  status: "ok" | "degraded"; // a union of exact string values, not just "any string"
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

// ============================================================================
// DAY 2 — AUTHENTICATION TYPES
// ----------------------------------------------------------------------------
// This is what the API sends back after a successful register/login/`/me`
// call. Notice it does NOT include passwordHash or any token — see
// modules/auth/user.model.ts for why those fields should never leave the
// server (the SRS calls this list "sensitive fields," section 14.1).
// ============================================================================
export interface AuthUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
  createdAt: string;
}
