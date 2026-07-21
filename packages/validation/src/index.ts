// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// "Validation" just means: before we trust data a user (or the frontend)
// sent us, we check it actually looks the way we expect. You've done this
// before manually, e.g. in your controller pattern:
//     if (!field1 || !field2) {
//         return res.status(400).json({ success: false, error: "Fields are required" })
//     }
//
// Zod lets us describe that same kind of check as a reusable "schema"
// instead of writing manual if-statements every time. The nice bonus: the
// exact same schema can validate a form on the React side AND the request
// body on the Express side, so both sides always agree on what "valid"
// means.
// ============================================================================

import { z } from "zod";

// DAY 5: this package now also depends on @opssphere/shared-types, so the
// role-creation schema below can check permission strings against the
// SAME canonical PERMISSIONS list the rest of the app uses (see
// shared-types/src/index.ts) - one list of valid permission strings,
// reused everywhere, instead of retyping it here.
import { PERMISSIONS } from "@opssphere/shared-types";

// This describes the ?page=1&limit=25&sort=-dueDate part of a URL that
// list endpoints (like GET /api/v1/tasks) will use starting Day 4+.
//
// TYPESCRIPT NOTE: reading this schema top to bottom:
export const paginationQuerySchema = z.object({
  // z.coerce.number() -> URL query values always arrive as TEXT (e.g. "1"),
  // so we convert it to a real number first.
  // .int()      -> must be a whole number, no decimals
  // .min(1)     -> must be 1 or greater
  // .default(1) -> if the user didn't send ?page=..., just assume page 1
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(25),

  // A plain optional string — we're not restricting what "sort" can say
  // yet (that gets tightened per-module later, so someone can't sort by
  // a sensitive field we don't want exposed).
  sort: z.string().optional(),
});

// TYPESCRIPT NOTE: `export type PaginationQuery = z.infer<typeof paginationQuerySchema>;`
// `z.infer<...>` is Zod's neat trick: instead of writing out an `interface`
// by hand for what this schema validates, we ask TypeScript to GENERATE the
// matching type automatically FROM the schema above. So if you later add a
// new field to `paginationQuerySchema`, the `PaginationQuery` type updates
// itself automatically — one source of truth instead of two.
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// HOW THIS GETS USED (once we build a real list endpoint, e.g. Day 4+):
//   const result = paginationQuerySchema.safeParse(req.query);
//   if (!result.success) {
//     // result.error tells you exactly which field was wrong
//   }
//   const { page, limit, sort } = result.data; // fully validated + typed

// ============================================================================
// DAY 2 — AUTHENTICATION SCHEMAS
// ----------------------------------------------------------------------------
// Both the React registration form AND the Express register route import
// THIS SAME schema. That means the "password must be at least 8 characters"
// rule only has to be written once, and both sides can never disagree about
// what counts as valid.
// ============================================================================

export const registerSchema = z.object({
  // z.string().email() checks it's a valid email shape (has an @, etc).
  // .toLowerCase() isn't a validation rule, it's a "transform" — it
  // rewrites the value on the way through, so "Bob@Example.com" and
  // "bob@example.com" are always treated as the same account.
  email: z.string().email("Enter a valid email address").toLowerCase(),

  // .min(8, "message") -> must be at least 8 characters, custom error text
  password: z.string().min(8, "Password must be at least 8 characters"),
});
// z.infer (explained above) generates the matching TypeScript type for us:
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address").toLowerCase(),
  // No .min(8) here on purpose: if someone typed a 5-character password,
  // that's a wrong-password problem, not a validation problem — we still
  // want the login attempt to reach the database and fail with the same
  // neutral "invalid email or password" message either way (see SRS 5.1 -
  // "Account discovery is minimized by returning neutral recovery responses").
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================================
// DAY 3 — PASSWORD RESET & INVITATION SCHEMAS
// ============================================================================

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address").toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createInvitationSchema = z.object({
  email: z.string().email("Enter a valid email address").toLowerCase(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

// ============================================================================
// DAY 4 — ORGANIZATION SCHEMA
// ============================================================================

// A simple "HH:MM, 24-hour clock" check, e.g. "09:00" or "17:30" - good
// enough for Day 4's "business hours" field without pulling in a whole
// date/time library just for two text fields.
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM format, e.g. 09:00");

export const createOrganizationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),

  // The slug is the short, URL-safe identifier for the org (e.g.
  // "acme-inc"). We ask the user to pick it directly (rather than
  // generating one from the name) so Day 4 stays simple - no slug-collision
  // auto-renaming logic needed yet.
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(40, "Slug is too long")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),

  timeZone: z.string().min(1, "Time zone is required").default("UTC"),

  businessHours: z
    .object({
      start: timeOfDaySchema,
      end: timeOfDaySchema,
    })
    .default({ start: "09:00", end: "17:00" }),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// ============================================================================
// DAY 5 — ROLES, DEPARTMENTS, TEAMS & ORG-SCOPED INVITATION SCHEMAS
// ============================================================================

// `z.enum(...)` needs an actual array of string literals, not just
// `Permission[]` (a TypeScript type has no existence at runtime) - so we
// spread PERMISSIONS' values into a real array here. The `as [string,
// ...string[]]` cast tells Zod's types "trust me, there's at least one
// element" (z.enum requires a non-empty tuple type) - PERMISSIONS will
// always have entries, so this is safe.
const permissionValues = Object.values(PERMISSIONS) as [string, ...string[]];

export const createRoleSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60, "Name is too long"),
  permissions: z
    .array(z.enum(permissionValues))
    .min(1, "Choose at least one permission")
    // z.enum + z.array doesn't stop someone sending the SAME permission
    // twice - dedupe with a Set so a role's permissions list can't have
    // silly repeats.
    .transform((perms) => Array.from(new Set(perms))),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

// ADDED post-Day-11: closes a real gap discovered while using the app -
// `createOrganization` (organization.service.ts) snapshots `ALL_PERMISSIONS`
// into a new org's "Owner" role ONCE, at creation time. Every later day
// that adds a new permission string (task.manage, ticket.assign,
// risk.manage, ...) does NOT retroactively add it to already-existing
// roles - there was previously no way to fix that short of a direct
// database edit. This schema lets an existing role's name (non-system
// only, enforced in organization.service.ts's updateRole) and/or
// permissions list be edited after creation, same "dedupe with a Set"
// treatment as createRoleSchema above.
export const updateRoleSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60, "Name is too long").optional(),
  permissions: z
    .array(z.enum(permissionValues))
    .min(1, "Choose at least one permission")
    .transform((perms) => Array.from(new Set(perms)))
    .optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const createDepartmentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  // A Mongo ObjectId is always exactly 24 hex characters - this regex is a
  // cheap, useful sanity check before even asking the database.
  departmentId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid department id")
    .optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateMembershipRoleSchema = z.object({
  roleId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid role id"),
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>;

export const createOrgInvitationSchema = z.object({
  email: z.string().email("Enter a valid email address").toLowerCase(),
  roleId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid role id"),
});
export type CreateOrgInvitationInput = z.infer<typeof createOrgInvitationSchema>;

// ============================================================================
// DAY 7 — PROJECTS, PROJECT MEMBERS & MILESTONES SCHEMAS
// ============================================================================

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const createProjectSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
  description: z.string().max(2000, "Description is too long").default(""),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long").optional(),
  description: z.string().max(2000, "Description is too long").optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const addProjectMemberSchema = z.object({
  userId: objectIdSchema,
  role: z.enum(["lead", "member"]).default("member"),
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;

export const createMilestoneSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
  // z.coerce.date() accepts either a real Date or a date STRING (e.g. from
  // an HTML <input type="date">, which always sends plain text) and turns
  // it into a real JavaScript Date either way.
  dueDate: z.coerce.date(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long").optional(),
  dueDate: z.coerce.date().optional(),
  isComplete: z.boolean().optional(),
});
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

// ============================================================================
// DAY 8 — SPRINTS, TASKS, COMMENTS, ATTACHMENTS & TIME ENTRIES SCHEMAS
// ============================================================================

export const createSprintSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine((data) => data.endDate >= data.startDate, {
  message: "End date must be on or after the start date",
  path: ["endDate"],
});
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long").optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(["planned", "active", "completed"]).optional(),
});
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;

const taskStatusSchema = z.enum(["todo", "in_progress", "in_review", "done"]);

export const createTaskSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200, "Title is too long"),
  description: z.string().max(4000, "Description is too long").default(""),
  sprintId: objectIdSchema.optional(),
  parentTaskId: objectIdSchema.optional(),
  assigneeIds: z.array(objectIdSchema).default([]),
  dueDate: z.coerce.date().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200, "Title is too long").optional(),
  description: z.string().max(4000, "Description is too long").optional(),
  sprintId: objectIdSchema.nullable().optional(), // null explicitly means "take this off its sprint"
  assigneeIds: z.array(objectIdSchema).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  // DAY 11: only settable via update, not at creation - a brand-new task
  // rarely has known dependencies yet, and keeping createTaskSchema
  // untouched means Day 8's create flow doesn't change at all. Cycle/
  // same-project checks happen in task.service.ts, not here - Zod can only
  // check SHAPE (an array of valid-looking ids), not whether those ids
  // actually make sense together.
  dependsOnTaskIds: z.array(objectIdSchema).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// The drag-and-drop endpoint's body - deliberately separate from
// updateTaskSchema above. Moving a card is a narrower, more frequent
// action than editing a task's details, and keeping its own schema means
// the move route can't accidentally be used to sneak in a title change.
export const moveTaskSchema = z.object({
  status: taskStatusSchema,
  // DAY 14: optional - the exact 0-based slot to land in within the target
  // column. Omitting it keeps Day 8's original behavior (append to the end).
  targetPosition: z.number().int().min(0).optional(),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const createTaskCommentSchema = z.object({
  body: z.string().min(1, "Comment can't be empty").max(4000, "Comment is too long"),
});
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;

// DAY 9: editing reuses the exact same shape as creating - a comment is
// just one field, `body` - so there's no reason for a second, differently-
// shaped schema here (contrast with tasks, where updateTaskSchema is
// meaningfully bigger than createTaskSchema).
export const updateTaskCommentSchema = z.object({
  body: z.string().min(1, "Comment can't be empty").max(4000, "Comment is too long"),
});
export type UpdateTaskCommentInput = z.infer<typeof updateTaskCommentSchema>;

export const createTaskAttachmentSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  url: z.string().url("Enter a valid URL"),
});
export type CreateTaskAttachmentInput = z.infer<typeof createTaskAttachmentSchema>;

// DAY 12: validates the one plain TEXT field that rides along with a real
// file upload (multipart/form-data request - the FILE itself is handled
// by multer, not Zod, since Zod only ever validates plain JS values, never
// a raw byte stream). `name` is optional here - if left blank, the
// service falls back to the uploaded file's own filename.
export const uploadTaskAttachmentSchema = z.object({
  name: z.string().min(1, "Name can't be blank").max(200, "Name is too long").optional(),
});
export type UploadTaskAttachmentInput = z.infer<typeof uploadTaskAttachmentSchema>;

export const createTimeEntrySchema = z.object({
  minutes: z.coerce.number().int().min(1, "Must be at least 1 minute").max(1440, "Can't exceed 24 hours in one entry"),
  note: z.string().max(500, "Note is too long").default(""),
  workDate: z.coerce.date(),
});
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

// ============================================================================
// DAY 10 — SUPPORT TICKETS SCHEMAS
// ============================================================================

const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const ticketStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);

export const createTicketSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200, "Title is too long"),
  description: z.string().max(4000, "Description is too long").default(""),
  priority: ticketPrioritySchema.default("medium"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200, "Title is too long").optional(),
  description: z.string().max(4000, "Description is too long").optional(),
  priority: ticketPrioritySchema.optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// Deliberately its OWN endpoint/schema, separate from updateTicketSchema -
// assigning is a permission-gated action (ticket.assign), editing details
// is an ownership-or-permission one; keeping them as separate requests
// means a route can require one without accidentally allowing the other.
export const assignTicketSchema = z.object({
  // null explicitly means "unassign this ticket" - distinct from omitting
  // the field entirely, same pattern as Day 8's updateTaskSchema.sprintId.
  assigneeId: objectIdSchema.nullable(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const updateTicketStatusSchema = z.object({
  status: ticketStatusSchema,
});
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

export const createTicketCommentSchema = z.object({
  body: z.string().min(1, "Comment can't be empty").max(4000, "Comment is too long"),
});
export type CreateTicketCommentInput = z.infer<typeof createTicketCommentSchema>;

// ============================================================================
// DAY 11 — TASK CHECKLISTS & RISK REGISTER SCHEMAS
// ----------------------------------------------------------------------------
// (Task DEPENDENCIES reuse updateTaskSchema above, not a new schema here.)
// ============================================================================

export const addChecklistItemSchema = z.object({
  text: z.string().min(1, "Checklist item can't be empty").max(300, "Checklist item is too long"),
});
export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;

// Renaming an item and toggling it done are both just "PATCH this item" -
// same one-endpoint idea as Day 7's updateMilestoneSchema (isComplete +
// name in one schema) rather than two separate narrow endpoints.
export const updateChecklistItemSchema = z.object({
  text: z.string().min(1, "Checklist item can't be empty").max(300, "Checklist item is too long").optional(),
  isDone: z.boolean().optional(),
});
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

const riskLikelihoodSchema = z.enum(["low", "medium", "high"]);
const riskImpactSchema = z.enum(["low", "medium", "high"]);
const riskStatusSchema = z.enum(["identified", "mitigating", "resolved", "accepted"]);

export const createRiskSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200, "Title is too long"),
  description: z.string().max(4000, "Description is too long").default(""),
  likelihood: riskLikelihoodSchema.default("medium"),
  impact: riskImpactSchema.default("medium"),
  mitigationPlan: z.string().max(4000, "Mitigation plan is too long").default(""),
  ownerId: objectIdSchema.optional(),
});
export type CreateRiskInput = z.infer<typeof createRiskSchema>;

export const updateRiskSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200, "Title is too long").optional(),
  description: z.string().max(4000, "Description is too long").optional(),
  likelihood: riskLikelihoodSchema.optional(),
  impact: riskImpactSchema.optional(),
  status: riskStatusSchema.optional(),
  mitigationPlan: z.string().max(4000, "Mitigation plan is too long").optional(),
  // null explicitly means "unassign this risk" - same pattern as Day 10's
  // assignTicketSchema.
  ownerId: objectIdSchema.nullable().optional(),
});
export type UpdateRiskInput = z.infer<typeof updateRiskSchema>;
