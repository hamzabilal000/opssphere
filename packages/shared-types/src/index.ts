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

// ============================================================================
// DAY 3 — SESSIONS & INVITATIONS TYPES
// ============================================================================

/** One row in the "where you're logged in" list (GET /api/v1/auth/sessions). */
export interface SessionSummary {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  // true for whichever session belongs to the request that asked for this
  // list - lets the frontend show "(this device)" next to the right one.
  isCurrent: boolean;
}

/** What the accept-invitation page shows before the user sets a password.
 * `organizationName`/`roleName` only appear (Day 5 onward) for invitations
 * sent FROM inside an organization - a plain, no-org invitation (Day 3
 * style) leaves both undefined. */
export interface InvitationPreview {
  email: string;
  expiresAt: string;
  organizationName?: string;
  roleName?: string;
}

// ============================================================================
// DAY 4 — ORGANIZATIONS & MULTI-TENANCY TYPES
// ----------------------------------------------------------------------------
// "Multi-tenancy" just means: many companies ("tenants") share the same
// running app and the same database, but each one's data is walled off from
// every other one. An Organization is one company's workspace. A Membership
// is the link saying "this user belongs to this organization, with this role."
// ============================================================================

/** A suspended member keeps their account but loses access to this ONE
 * organization - see tenant.middleware.ts for where this gets enforced. */
export type MembershipStatus = "active" | "suspended";

/** One row in "your organizations" - note `myRole`, which is the CURRENT
 * user's role NAME in THIS org (e.g. "Owner", "Member", or a custom role
 * someone made up), not a general property of the org itself. As of Day 5,
 * roles are real, editable database records (see RoleSummary below)
 * instead of a fixed "owner" | "member" choice — `myRole` is just that
 * role's display name. */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  timeZone: string;
  businessHours: { start: string; end: string };
  createdAt: string;
  myRole: string;
}

/** One row in an organization's member list. */
export interface MembershipSummary {
  id: string;
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  status: MembershipStatus;
  joinedAt: string;
}

// ============================================================================
// DAY 5 — ROLES & PERMISSIONS TYPES
// ----------------------------------------------------------------------------
// A "permission" is just a short string naming ONE specific action, e.g.
// "role.manage" or "member.invite" - see PERMISSIONS below for the full
// list. A "role" is nothing more than a NAME plus a LIST of these strings.
// Checking "can this person do X?" always comes down to one simple
// question: "does their role's permissions array include X?" There is no
// more complicated rule engine than that on purpose (see the "allow-only,
// no deny-rules" note in the Day 5 learning note for why).
// ============================================================================

// TYPESCRIPT NOTE: `as const` at the end of an object literal locks every
// property to its EXACT string value (the type of PERMISSIONS.ORG_MANAGE
// becomes the literal type "org.manage", not just "string"). This is what
// makes `Permission` below a precise list of allowed strings instead of
// "any string at all" - assigning `"typo.permission"` anywhere a
// `Permission` is expected would be a compile error.
export const PERMISSIONS = {
  ORG_MANAGE: "org.manage", // rename the org, change time zone/business hours
  MEMBER_INVITE: "member.invite", // invite a new person into the org
  MEMBER_REMOVE: "member.remove", // remove an existing member
  MEMBER_ROLE_UPDATE: "member.role.update", // change which role a member has
  ROLE_MANAGE: "role.manage", // create/edit/delete custom roles
  DEPARTMENT_MANAGE: "department.manage", // create/delete departments
  TEAM_MANAGE: "team.manage", // create/delete teams
  // DAY 7: `project.create` was reserved (unused) since Day 5 - the exact
  // string the SRS names as its example. Today is the first day it's
  // actually checked by a real route. `PROJECT_MANAGE` and
  // `PROJECT_MEMBER_MANAGE` are new today, following the same
  // "module.action" naming pattern as everything else in this list.
  PROJECT_CREATE: "project.create",
  PROJECT_MANAGE: "project.manage", // edit/archive a project, manage its milestones
  PROJECT_MEMBER_MANAGE: "project.member.manage", // add/remove people from a project
  // DAY 8: create/edit/delete/move tasks and sprints. The SRS doesn't name
  // these two specifically (only `project.create`/`ticket.assign` are
  // given as examples) - they follow the same "module.action" pattern.
  // Commenting, attaching links, and logging time are intentionally NOT
  // behind a permission - any active org member can do those (see the
  // Day 8 learning note for why that split makes sense).
  TASK_MANAGE: "task.manage",
  SPRINT_MANAGE: "sprint.manage",
  // Still reserved/unused - the SRS's other example permission string, for
  // a support-tickets module that doesn't exist yet.
  TICKET_ASSIGN: "ticket.assign",
} as const;

// TYPESCRIPT NOTE: `(typeof PERMISSIONS)[keyof typeof PERMISSIONS]` reads
// as "the type of every VALUE in the PERMISSIONS object, unioned together."
// Concretely, `Permission` becomes:
//     "org.manage" | "member.invite" | "member.remove" | ... | "ticket.assign"
// If someone adds a new line to PERMISSIONS above, this type updates
// itself automatically - one source of truth, just like z.infer elsewhere.
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** One row in an organization's role list. */
export interface RoleSummary {
  id: string;
  name: string;
  permissions: Permission[];
  // "Owner" and "Member" are created automatically for every new
  // organization (see organization.service.ts) and can't be renamed or
  // deleted - the frontend uses this flag to hide those actions for them.
  isSystemRole: boolean;
  createdAt: string;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  departmentId?: string;
  createdAt: string;
}

// ============================================================================
// DAY 7 — PROJECTS & MEMBERS TYPES
// ----------------------------------------------------------------------------
// A Project is deliberately simple today - name, description, status, and
// who's on it. Tasks, sprints, and the Kanban board are Day 8's job; today
// is just "stand up the project-tracking backbone" (the SRS's own words
// for this day).
// ============================================================================

export type ProjectStatus = "active" | "completed" | "archived";

/** DELIBERATELY a much smaller idea than Day 5's org-wide custom Roles -
 * a project only ever needs to distinguish "runs this project" from
 * "works on this project," not a full permission system of its own. */
export type ProjectMemberRole = "lead" | "member";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  memberCount: number;
  createdAt: string;
}

/** One row in a project's member list - note this is a DIFFERENT thing
 * from MembershipSummary (organization-level). Someone can be an
 * organization Member but a project Lead, or vice versa - the two role
 * systems are intentionally independent. */
export interface ProjectMemberSummary {
  id: string;
  userId: string;
  email: string;
  role: ProjectMemberRole;
  addedAt: string;
}

export interface MilestoneSummary {
  id: string;
  name: string;
  dueDate: string;
  isComplete: boolean;
  createdAt: string;
}

// ============================================================================
// DAY 8 — TASKS, BOARD & SPRINTS TYPES
// ----------------------------------------------------------------------------
// "The actual day-to-day work surface of the app" (the SRS's own words).
// Dependencies, checklists, and a risk register are explicitly deferred by
// the SRS ("should have, not today's job") - what's here is the full loop:
// create a task, put it on a sprint, drag it across a board, comment on
// it, log time, mark it done.
// ============================================================================

export type SprintStatus = "planned" | "active" | "completed";

export interface SprintSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  createdAt: string;
}

/** The four Kanban columns. Not specified exactly by the SRS - this is a
 * standard, small set that covers the "create, assign, drag across the
 * board, comment, mark done" loop the Day 8 acceptance test describes. */
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

export interface TaskSummary {
  id: string;
  projectId: string;
  sprintId?: string;
  parentTaskId?: string; // set only for a SUBTASK - see the Day 8 learning note
  title: string;
  description: string;
  status: TaskStatus;
  assigneeIds: string[];
  assigneeEmails: string[]; // same order as assigneeIds - resolved server-side so the frontend never has to look users up itself
  dueDate?: string;
  // Where this card sits within its OWN status column, low-to-high. See
  // task.service.ts's moveTask for exactly how this gets maintained.
  position: number;
  createdAt: string;
}

export interface TaskCommentSummary {
  id: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}

/** DAY 8 keeps this to a LINK, not a real uploaded file - see the Day 8
 * learning note for why (real file storage via MinIO is a reasonable
 * future upgrade, not something this environment can build AND verify in
 * one day). */
export interface TaskAttachmentSummary {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedByEmail: string;
  createdAt: string;
}

export interface TimeEntrySummary {
  id: string;
  userId: string;
  userEmail: string;
  minutes: number;
  note: string;
  workDate: string;
  createdAt: string;
}
