// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The "business logic" layer - the actual rules, kept separate from
// Express-specific code (see auth.controller.ts for the req/res side).
// Day 3 adds four features on top of Day 2's register/verify/login:
// sessions + refresh rotation, password reset, and invitations.
// ============================================================================

import { User, type UserDocument } from "./user.model.js";
import { Session } from "./session.model.js";
import { Invitation } from "./invitation.model.js";
// DAY 5: an org-scoped invitation (created in organization.service.ts's
// createOrgInvitation) carries an organizationId + roleId - accepting one
// needs to look those up to also create a Membership, not just a User.
// Reaching into the organizations module from here is the same pattern
// organization.service.ts already uses in reverse (it imports User from
// this module) - this project doesn't enforce strict one-way module
// boundaries, since everything still lives in one small API.
import { Organization } from "../organizations/organization.model.js";
import { Role } from "../organizations/role.model.js";
import { Membership } from "../organizations/membership.model.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  generateOneTimeToken,
  hashOneTimeToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from "./auth.tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendInvitationEmail } from "../../lib/mailer.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import type { RegisterInput, LoginInput } from "@opssphere/validation";
import type { AuthUser, SessionSummary, InvitationPreview } from "@opssphere/shared-types";

const VERIFICATION_TOKEN_TTL_HOURS = 24;
const PASSWORD_RESET_TOKEN_TTL_HOURS = 1;
const INVITATION_TOKEN_TTL_DAYS = 7;

// Bundles "which device/browser/IP is making this request" - passed down
// from the controller (which reads it off req.headers / req.ip) into the
// service functions that create or touch a Session.
export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

function toAuthUser(user: UserDocument): AuthUser {
  return {
    id: user._id.toString(),
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

// ----------------------------------------------------------------------------
// SHARED HELPER — create a brand new Session + token pair for a user
// ----------------------------------------------------------------------------
// Both a normal login AND accepting an invitation end with "now log this
// person in" - rather than duplicate this logic twice, both call this one
// function.
async function createSessionAndTokens(
  userId: string,
  context: SessionContext
): Promise<{ accessToken: string; refreshToken: string }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Step 1: create the session with a temporary placeholder hash - we don't
  // know the refresh token's value yet because it needs the session's own
  // _id inside it (see auth.tokens.ts's RefreshTokenPayload).
  const session = await Session.create({
    userId,
    currentRefreshTokenHash: "pending",
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    lastUsedAt: now,
    expiresAt,
  });

  const refreshToken = signRefreshToken(userId, session._id.toString());
  session.currentRefreshTokenHash = hashRefreshToken(refreshToken);
  await session.save();

  const accessToken = signAccessToken(userId, session._id.toString());
  return { accessToken, refreshToken };
}

// ----------------------------------------------------------------------------
// REGISTER  (unchanged from Day 2)
// ----------------------------------------------------------------------------
export async function registerUser(input: RegisterInput): Promise<AuthUser> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new ApiError(409, "CONFLICT", "An account with this email may already exist.");
  }

  const passwordHash = await hashPassword(input.password);
  const { rawToken, tokenHash } = generateOneTimeToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  const user = await User.create({
    email: input.email,
    passwordHash,
    isEmailVerified: false,
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiresAt: expiresAt,
  });

  const verifyUrl = `${env.WEB_ORIGIN}/verify-email?token=${rawToken}`;
  await sendVerificationEmail(user.email, verifyUrl);

  return toAuthUser(user);
}

// ----------------------------------------------------------------------------
// VERIFY EMAIL  (unchanged from Day 2, aside from the renamed token helpers)
// ----------------------------------------------------------------------------
export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashOneTimeToken(rawToken);

  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiresAt: { $gt: new Date() },
  }).select("+emailVerificationTokenHash +emailVerificationTokenExpiresAt");

  if (!user) {
    throw new ApiError(400, "INVALID_TOKEN", "This verification link is invalid or has expired.");
  }

  user.isEmailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationTokenExpiresAt = undefined;
  await user.save();
}

// ----------------------------------------------------------------------------
// LOGIN  (updated - now also creates a Session + refresh token)
// ----------------------------------------------------------------------------
export async function loginUser(
  input: LoginInput,
  context: SessionContext
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  const user = await User.findOne({ email: input.email }).select("+passwordHash");

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

  const { accessToken, refreshToken } = await createSessionAndTokens(user._id.toString(), context);
  return { user: toAuthUser(user), accessToken, refreshToken };
}

// ----------------------------------------------------------------------------
// REFRESH  — the heart of Day 3: rotation + reuse detection
// ----------------------------------------------------------------------------
export async function refreshSession(
  rawRefreshToken: string,
  context: SessionContext
): Promise<{ accessToken: string; refreshToken: string }> {
  // Step 1: is this even a validly SIGNED refresh token, not expired?
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please log in again.");
  }

  // Step 2: does it point at a real, still-active session?
  const session = await Session.findById(payload.sid).select("+currentRefreshTokenHash");
  const now = new Date();

  if (!session || session.revokedAt || session.expiresAt < now) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Your session has ended. Please log in again.");
  }

  // Step 3 — THE IMPORTANT CHECK: does this token match the session's
  // CURRENT expected refresh token? If someone presents an OLD token that
  // was already rotated away (e.g. a stolen copy from before), the hash
  // won't match anymore, even though the signature and session both check
  // out. That mismatch is exactly what "reuse detection" means.
  const providedHash = hashRefreshToken(rawRefreshToken);
  if (providedHash !== session.currentRefreshTokenHash) {
    // Treat this as a security incident: kill the whole session, not just
    // reject this one request. A legitimate user's browser would never
    // present an old, already-rotated token - only a copy made before
    // rotation happened would.
    session.revokedAt = now;
    await session.save();
    throw new ApiError(
      401,
      "SESSION_REVOKED",
      "Suspicious activity was detected on this session. Please log in again."
    );
  }

  // Step 4: everything checks out - ROTATE. Issue a brand new refresh
  // token for the SAME session, and make the old one permanently invalid
  // by overwriting the hash we compare against next time.
  const newRefreshToken = signRefreshToken(payload.sub, session._id.toString());
  session.currentRefreshTokenHash = hashRefreshToken(newRefreshToken);
  session.lastUsedAt = now;
  if (context.userAgent) session.userAgent = context.userAgent;
  if (context.ipAddress) session.ipAddress = context.ipAddress;
  await session.save();

  const accessToken = signAccessToken(payload.sub, session._id.toString());
  return { accessToken, refreshToken: newRefreshToken };
}

// ----------------------------------------------------------------------------
// SESSIONS — list / revoke one / revoke all others
// ----------------------------------------------------------------------------
export async function listSessions(
  userId: string,
  currentSessionId: string | null
): Promise<SessionSummary[]> {
  const sessions = await Session.find({
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ lastUsedAt: -1 });

  return sessions.map((s) => ({
    id: s._id.toString(),
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    isCurrent: s._id.toString() === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  // The `userId` filter here is what stops User A from revoking User B's
  // session just by guessing/incrementing an ID - see SRS 14 (Security
  // Architecture): "ownership" checks like this belong in every query that
  // touches a specific record, not just in the route's permission check.
  const session = await Session.findOne({ _id: sessionId, userId });
  if (!session) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Session not found.");
  }
  session.revokedAt = new Date();
  await session.save();
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await Session.updateMany(
    { userId, _id: { $ne: currentSessionId }, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
}

// ----------------------------------------------------------------------------
// FORGOT PASSWORD / RESET PASSWORD
// ----------------------------------------------------------------------------
export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email });

  // IMPORTANT: we do NOT throw an error if the user doesn't exist. The
  // controller always shows the same "check your email" message either
  // way - see SRS 5.1, "neutral recovery responses." If we responded
  // differently for existing vs. non-existing emails, an attacker could
  // use "forgot password" itself as a tool to discover which emails have
  // accounts on this platform.
  if (!user) return;

  const { rawToken, tokenHash } = generateOneTimeToken();
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetTokenExpiresAt = new Date(
    Date.now() + PASSWORD_RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000
  );
  await user.save();

  const resetUrl = `${env.WEB_ORIGIN}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(user.email, resetUrl);
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashOneTimeToken(rawToken);

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetTokenExpiresAt");

  if (!user) {
    throw new ApiError(400, "INVALID_TOKEN", "This reset link is invalid or has expired.");
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetTokenHash = undefined;
  user.passwordResetTokenExpiresAt = undefined;
  await user.save();

  // SECURITY STEP: a password reset almost always means "I think someone
  // else might have my password" - so we log the account out EVERYWHERE,
  // not just leave old sessions (and any refresh tokens they hold) valid.
  await Session.updateMany(
    { userId: user._id, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
}

// ----------------------------------------------------------------------------
// INVITATIONS  (simplified - no organization/role concept until Day 4-5)
// ----------------------------------------------------------------------------
export async function createInvitation(invitedByUserId: string, email: string): Promise<void> {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "CONFLICT", "An account with this email already exists.");
  }

  const { rawToken, tokenHash } = generateOneTimeToken();
  const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await Invitation.create({
    email,
    tokenHash,
    status: "pending",
    invitedByUserId,
    expiresAt,
  });

  const acceptUrl = `${env.WEB_ORIGIN}/accept-invitation?token=${rawToken}`;
  await sendInvitationEmail(email, acceptUrl);
}

export async function getInvitationPreview(rawToken: string): Promise<InvitationPreview> {
  const tokenHash = hashOneTimeToken(rawToken);

  const invitation = await Invitation.findOne({
    tokenHash,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).select("+tokenHash");

  if (!invitation) {
    throw new ApiError(400, "INVALID_TOKEN", "This invitation is invalid or has expired.");
  }

  const preview: InvitationPreview = {
    email: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
  };

  // DAY 5: only org-scoped invitations have these two fields set - a
  // plain Day-3-style invitation leaves the preview as just email+expiry.
  if (invitation.organizationId && invitation.roleId) {
    const [org, role] = await Promise.all([
      Organization.findById(invitation.organizationId),
      Role.findById(invitation.roleId),
    ]);
    if (org) preview.organizationName = org.name;
    if (role) preview.roleName = role.name;
  }

  return preview;
}

export async function acceptInvitation(
  rawToken: string,
  password: string,
  context: SessionContext
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  const tokenHash = hashOneTimeToken(rawToken);

  const invitation = await Invitation.findOne({
    tokenHash,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).select("+tokenHash");

  if (!invitation) {
    throw new ApiError(400, "INVALID_TOKEN", "This invitation is invalid or has expired.");
  }

  const passwordHash = await hashPassword(password);

  // Accepting an invitation proves ownership of the email the SAME way
  // clicking a verification link does (only the real recipient could have
  // gotten the link) - so we mark it verified immediately, skipping the
  // separate email-verification step new self-registered users go through.
  const user = await User.create({
    email: invitation.email,
    passwordHash,
    isEmailVerified: true,
  });

  invitation.status = "accepted";
  await invitation.save();

  // DAY 5: if this invitation was created FROM an organization (it has
  // organizationId + roleId set), accepting it doesn't just create a bare
  // account - it also creates the Membership that actually gets them into
  // that organization, with the exact role they were invited as.
  if (invitation.organizationId && invitation.roleId) {
    await Membership.create({
      organizationId: invitation.organizationId,
      userId: user._id,
      roleId: invitation.roleId,
      status: "active",
    });
  }

  const { accessToken, refreshToken } = await createSessionAndTokens(user._id.toString(), context);
  return { user: toAuthUser(user), accessToken, refreshToken };
}
