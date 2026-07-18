// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This sends emails. Locally, it sends them to Mailpit — the fake inbox
// container we started with `pnpm docker:up` — instead of a real inbox, so
// you can develop and test the "verify your email" flow without needing a
// real email account or spamming anyone.
//
// "nodemailer" is the library that knows how to actually talk the SMTP
// protocol (the standard way computers send email to each other).
// ============================================================================

import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// createTransport(...) sets up the connection details ONCE. Think of
// `transporter` as "the thing you hand an email to, and it figures out how
// to deliver it" — same idea as require("nodemailer").createTransport(...)
// if you've seen this library before in plain JS.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false, // Mailpit doesn't use encryption locally — this would be true against a real mail provider
});

// TYPESCRIPT NOTE: `interface SendMailInput { ... }` declared right above
// the function that uses it is a common pattern — it just means "here are
// the named arguments this function expects," bundled into one object
// instead of `sendMail(to, subject, html)` with three separate positional
// arguments that are easy to mix up.
interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<void> {
  try {
    await transporter.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    // We log the failure but deliberately do NOT throw it further up.
    // Why: if a "welcome email" fails to send, that shouldn't crash the
    // whole registration request the user is waiting on — the account
    // still gets created either way. (See SRS 13.1 - event handlers should
    // be isolated from the main business action.)
    logger.error({ err, to, subject }, "Failed to send email");
  }
}

// A small, specific helper built on top of the generic one above — this is
// what auth.service.ts actually calls after registration.
export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Verify your OpsSphere email",
    html: `
      <p>Welcome to OpsSphere! Click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

// HOW TO SEE THIS WORKING: open http://localhost:8025 (Mailpit's web inbox)
// after registering a new account — the email above will show up there,
// exactly like a real inbox, without ever leaving your computer.

// ============================================================================
// DAY 3 additions — same sendMail() helper, two new email templates
// ============================================================================

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Reset your OpsSphere password",
    html: `
      <p>We received a request to reset your OpsSphere password. Click the link below to choose a new one:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email —
      your password has not been changed.</p>
    `,
  });
}

export async function sendInvitationEmail(to: string, acceptUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "You've been invited to OpsSphere",
    html: `
      <p>You've been invited to join OpsSphere. Click the link below to create your account:</p>
      <p><a href="${acceptUrl}">${acceptUrl}</a></p>
      <p>This invitation expires in 7 days.</p>
    `,
  });
}
