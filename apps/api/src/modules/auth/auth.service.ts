// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the "business logic" layer — the actual rules of what happens
// during register/verify/login, kept SEPARATE from the Express-specific
// code (reading req.body, sending res.json, etc — that part lives in
// auth.controller.ts). Compare to your usual style: this file is roughly
// equivalent to the logic INSIDE one of your controller functions, just
// without the req/res/try-catch wrapper around it.
//
// Splitting it this way means: if we ever wanted to trigger "register a
// user" from somewhere that isn't an HTTP request (a background job, a
// test file, an admin script), we could call these functions directly
// without needing a fake req/res.
// ============================================================================

import { User, type UserDocument } from "./user.model.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  generateVerificationToken,
  hashVerificationToken,
  signAccessToken,
} from "./auth.tokens.js";
import { sendVerificationEmail } from "../../lib/mailer.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import type { RegisterInput, LoginInput } from "@opssphere/validation";
import type { AuthUser } from "@opssphere/shared-types";

const VERIFICATION_TOKEN_TTL_HOURS = 24;

// ----------------------------------------------------------------------------
// Small helper: turns a raw Mongoose document into the safe, public shape
// we're allowed to send back to the browser (see AuthUser in shared-types —
// notice passwordHash never appears here).
// ----------------------------------------------------------------------------
function toAuthUser(user: UserDocument): AuthUser {
  return {
    id: user._id.toString(),
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}
// TYPESCRIPT NOTE: `user._id.toString()` — Mongoose IDs are a special
// "ObjectId" type internally, not a plain string. We convert it to a
// string here because that's what our shared AuthUser type (and JSON in
// general) expects.
// Also: `user.createdAt` works even though we didn't put `createdAt` in our
// UserAttrs interface ourselves — Mongoose's `timestamps: true` option adds
// it automatically, and Mongoose's own types know about that.

// ----------------------------------------------------------------------------
// REGISTER
// ----------------------------------------------------------------------------
export async function registerUser(input: RegisterInput): Promise<AuthUser> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    // Deliberately vague error — see SRS 5.1: we don't want to confirm to
    // an attacker "yes, this exact email already has an account here."
    throw new ApiError(409, "CONFLICT", "An account with this email may already exist.");
  }

  const passwordHash = await hashPassword(input.password);
  const { rawToken, tokenHash } = generateVerificationToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  const user = await User.create({
    email: input.email,
    passwordHash,
    isEmailVerified: false,
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiresAt: expiresAt,
  });
  // TYPESCRIPT NOTE: your usual style uses `ODM.insertOne({...})`. Mongoose
  // also offers `Model.create({...})`, which does the same "insert one new
  // document" job — we use `.create()` here specifically because it runs
  // any schema-level validation/defaults before saving, the same way
  // `new Model({...}).save()` would.

  // Build the link the user will click. WEB_ORIGIN is your frontend's URL
  // (http://localhost:5173) — the frontend will have a page at
  // /verify-email that reads the ?token= from the URL and calls our API.
  const verifyUrl = `${env.WEB_ORIGIN}/verify-email?token=${rawToken}`;
  await sendVerificationEmail(user.email, verifyUrl);

  return toAuthUser(user);
}

// ----------------------------------------------------------------------------
// VERIFY EMAIL
// ----------------------------------------------------------------------------
export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashVerificationToken(rawToken);

  // We look up the user by the HASHED token (never the raw one) and also
  // require the stored expiry to still be in the future. $gt means
  // "greater than" — a standard MongoDB query operator.
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiresAt: { $gt: new Date() },
  }).select("+emailVerificationTokenHash +emailVerificationTokenExpiresAt");
  // TYPESCRIPT NOTE / MONGOOSE NOTE: remember these two fields were marked
  // `select: false` in user.model.ts, so by default Mongoose leaves them
  // out. `.select("+fieldName")` explicitly asks for them back, just for
  // this one query, since we actually need to check them here.

  if (!user) {
    throw new ApiError(400, "INVALID_TOKEN", "This verification link is invalid or has expired.");
  }

  user.isEmailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationTokenExpiresAt = undefined;
  await user.save();
  // Same idea as your usual `dbres.save()` after modifying a fetched
  // document directly, instead of a separate findByIdAndUpdate call.
}

// ----------------------------------------------------------------------------
// LOGIN
// ----------------------------------------------------------------------------
export async function loginUser(
  input: LoginInput
): Promise<{ user: AuthUser; accessToken: string }> {
  // .select("+passwordHash") — same reasoning as above: passwordHash is
  // hidden by default, and this is the ONE place in the whole app that
  // legitimately needs to read it.
  const user = await User.findOne({ email: input.email }).select("+passwordHash");

  // IMPORTANT: notice both failure cases below throw the EXACT SAME error.
  // If we said "no account with that email" vs. "wrong password"
  // separately, an attacker could use that difference to figure out which
  // emails have accounts on our platform, one guess at a time. One
  // identical message for both cases closes that door (see SRS 5.1).
  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  if (!user.isEmailVerified) {
    throw new ApiError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Please verify your email before logging in. Check your inbox for the verification link."
    );
  }

  const accessToken = signAccessToken(user._id.toString());

  return { user: toAuthUser(user), accessToken };
}
