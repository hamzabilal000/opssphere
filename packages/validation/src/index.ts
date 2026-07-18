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
