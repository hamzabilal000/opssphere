// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Everything you've built so far (Days 1-8) is "request/response": the
// browser asks for something, the server answers once, done. Real-time is a
// different shape entirely - the server can push a message to a browser
// WITHOUT the browser asking first, over a connection that stays open. This
// file sets up Socket.IO (a well-tested library that handles all the messy
// low-level details of "keep a connection open, reconnect automatically if
// it drops") and wires it into the SAME login system every other route
// already uses - no separate auth system, no new tokens.
//
// THE BIG IDEA: "rooms." A socket "joins" a room (just a string name, e.g.
// "project:507f..."), and anyone can broadcast a message to everyone
// currently in that room. Here, one room = one project. When someone moves a
// card on the board, every OTHER browser looking at that same project's
// board gets told about it instantly, without refreshing the page.
// ============================================================================

import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { parse as parseCookie } from "cookie";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { ACCESS_TOKEN_COOKIE } from "../modules/auth/auth.middleware.js";
import { Membership } from "../modules/organizations/membership.model.js";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// TYPESCRIPT NOTE: unlike Express's Request (auth.middleware.ts had to
// explicitly "augment" its type to add `.userId`), Socket.IO's `Socket.data`
// is ALREADY typed as `any` by default (it's meant to hold whatever custom
// per-connection data you want) - so `socket.data.userId = ...` below just
// works without any extra type plumbing.

// A module-level variable holding the ONE Socket.IO server instance, set the
// moment `initSocketServer` runs. Anywhere else in the codebase (like
// task.controller.ts, after a task is created) can call `emitToProject(...)`
// without needing to pass the `io` object around through every function
// call - the same "one shared instance, imported where needed" idea as
// `logger` in lib/logger.ts.
let io: SocketIOServer | undefined;

export function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

// DAY 17: the other kind of room this app needs - one per USER instead of
// one per project. A project room only makes sense for people actively
// looking at that board; a notification needs to reach someone no matter
// WHICH page they're currently on, as long as they're connected at all.
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

// Called ONCE from index.ts, right after the plain HTTP server is created -
// see index.ts for why Socket.IO needs the raw http.Server (not just the
// Express `app`) to attach itself to.
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.WEB_ORIGIN,
      credentials: true,
    },
  });

  // ---- Authentication, BEFORE a connection is even accepted -------------
  // Socket.IO middleware works just like Express middleware: run some code
  // before `next()`, or reject the connection by calling `next(someError)`
  // instead. We reuse the EXACT SAME access token cookie and verify
  // function `requireAuth` uses (auth.tokens.ts) - there's no separate
  // "socket login," it's the same session.
  io.use((socket, next) => {
    try {
      const rawCookieHeader = socket.handshake.headers.cookie;
      if (!rawCookieHeader) {
        return next(new Error("AUTHENTICATION_REQUIRED"));
      }

      // `cookie.parse` turns the raw "a=1; b=2" header string into a plain
      // { a: "1", b: "2" } object - the same job cookie-parser does for
      // Express's req.cookies, just called directly here since Socket.IO's
      // handshake doesn't go through Express's middleware chain at all.
      const cookies = parseCookie(rawCookieHeader);
      const token = cookies[ACCESS_TOKEN_COOKIE];
      if (!token) {
        return next(new Error("AUTHENTICATION_REQUIRED"));
      }

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      // Expired/malformed/tampered token - same "treat it as not logged in"
      // choice auth.middleware.ts makes for ordinary HTTP requests.
      next(new Error("AUTHENTICATION_REQUIRED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    logger.debug({ userId: socket.data.userId, socketId: socket.id }, "socket connected");

    // DAY 17: unlike a project's room (only joined once the frontend asks,
    // per board it's actually looking at), a socket joins ITS OWN user
    // room automatically, right here, the moment it connects - no
    // "join-user" event needed, since we already know socket.data.userId
    // from the auth check above, and there's no membership to re-verify
    // (a user always has full access to their own notifications).
    void socket.join(userRoom(socket.data.userId));

    // ---- Joining a project's room -----------------------------------
    // A connected socket isn't automatically in any room - the FRONTEND
    // asks to join a specific project's room once it opens that project's
    // board (see web/src/lib/socket.ts). We re-check real membership here,
    // the exact same "never trust an id, re-check it against a real
    // record" principle as requireOrgMembership (Day 4) - a socket can't
    // join a room for an organization it doesn't belong to just by
    // guessing/sending a different id.
    socket.on(
      "join-project",
      async (
        payload: { organizationId?: unknown; projectId?: unknown },
        callback?: (result: { ok: boolean; message?: string }) => void
      ) => {
        const organizationId = String(payload?.organizationId ?? "");
        const projectId = String(payload?.projectId ?? "");

        if (!organizationId || !projectId) {
          callback?.({ ok: false, message: "organizationId and projectId are required." });
          return;
        }

        const membership = await Membership.findOne({
          organizationId,
          userId: socket.data.userId,
          status: "active",
        });

        if (!membership) {
          callback?.({ ok: false, message: "You do not have access to this organization." });
          return;
        }

        await socket.join(projectRoom(projectId));
        callback?.({ ok: true });
      }
    );

    socket.on("leave-project", (payload: { projectId?: unknown }) => {
      const projectId = String(payload?.projectId ?? "");
      if (projectId) socket.leave(projectRoom(projectId));
    });

    socket.on("disconnect", () => {
      logger.debug({ userId: socket.data.userId, socketId: socket.id }, "socket disconnected");
    });
  });

  return io;
}

// Every other module calls THIS, not `io` directly - see task.controller.ts
// for real examples ("task created, tell everyone else on this board").
// `io` is `undefined` in contexts that only ever call `createApp()` without
// also calling `initSocketServer` (exactly what the smoke-test scripts used
// for Days 1-8's verification do) - broadcasting is silently skipped rather
// than crashing, since a smoke test has no real socket clients to notify
// anyway.
export function emitToProject(projectId: string, event: string, payload: unknown): void {
  io?.to(projectRoom(projectId)).emit(event, payload);
}

// DAY 17: same idea as emitToProject, aimed at one person instead of one
// project's room - see notification.service.ts's createNotification for
// the one caller of this so far.
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}
