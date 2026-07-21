// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The frontend half of Day 9's real-time layer. `lib/api.ts` makes one-off
// request/response calls; this file keeps ONE long-lived connection open to
// the backend and reacts whenever the server pushes something down it
// (see apps/api/src/lib/socket.ts for the server half).
//
// `useProjectSocket` is a React hook a page calls with an organizationId +
// projectId. It connects once, asks the server to join that project's
// "room" (see the server file for what a room is), and gives back nothing
// but a `connected` flag - the actual REACTION to each event (updating
// TanStack Query's cache) is passed in by the caller, since different pages
// care about different events.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@opssphere/shared-types";
import type {
  TaskChangedPayload,
  TaskDeletedPayload,
  CommentChangedPayload,
  CommentDeletedPayload,
  NotificationCreatedPayload,
} from "@opssphere/shared-types";

// TYPESCRIPT NOTE: this describes exactly which event names a caller of
// useProjectSocket can listen for, and exactly what shape the payload is
// for EACH one - e.g. handlers["task:moved"] must be a function that takes
// a TaskChangedPayload, never a CommentChangedPayload. Get one wrong and
// TypeScript catches it immediately, the same "one source of truth" idea
// as SOCKET_EVENTS itself.
export interface ProjectSocketHandlers {
  [SOCKET_EVENTS.TASK_CREATED]?: (payload: TaskChangedPayload) => void;
  [SOCKET_EVENTS.TASK_UPDATED]?: (payload: TaskChangedPayload) => void;
  [SOCKET_EVENTS.TASK_MOVED]?: (payload: TaskChangedPayload) => void;
  [SOCKET_EVENTS.TASK_DELETED]?: (payload: TaskDeletedPayload) => void;
  [SOCKET_EVENTS.COMMENT_CREATED]?: (payload: CommentChangedPayload) => void;
  [SOCKET_EVENTS.COMMENT_UPDATED]?: (payload: CommentChangedPayload) => void;
  [SOCKET_EVENTS.COMMENT_DELETED]?: (payload: CommentDeletedPayload) => void;
}

// One shared connection for the whole app (not one per component) - a
// browser tab only ever needs a single socket, regardless of how many
// components on screen care about events from it. Created lazily, the
// first time any page actually needs it.
let sharedSocket: Socket | undefined;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({
      path: "/socket.io",
      // Same job as fetch()'s `credentials: "include"` in lib/api.ts's
      // apiRequest - makes sure the login cookie actually gets sent along
      // with the socket handshake, since it's what the backend's
      // io.use(...) middleware checks (see apps/api/src/lib/socket.ts).
      withCredentials: true,
      autoConnect: true,
    });
  }
  return sharedSocket;
}

export function useProjectSocket(
  organizationId: string,
  projectId: string,
  handlers: ProjectSocketHandlers
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // A ref, not the handlers object itself, in the effect's dependency list
  // below - handlers is a fresh object literal every render (the caller
  // passes it inline), so depending on it directly would tear the
  // connection down and rebuild it on every single render. The ref lets
  // the effect always call the LATEST handlers without needing to
  // reconnect just because a new render happened.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!organizationId || !projectId) return;

    const socket = getSocket();

    function joinRoom() {
      socket.emit(
        "join-project",
        { organizationId, projectId },
        (result: { ok: boolean; message?: string }) => {
          setConnected(result.ok);
        }
      );
    }

    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);

    // One generic listener per event NAME (not per call to this hook) -
    // registered once, dispatching to whatever the LATEST handlers object
    // contains via the ref above.
    const eventNames = Object.values(SOCKET_EVENTS);
    const listeners = eventNames.map((eventName) => {
      const listener = (payload: unknown) => {
        const handler = handlersRef.current[eventName as keyof ProjectSocketHandlers];
        // TYPESCRIPT NOTE: `handler?.(payload as never)` - we've already
        // guaranteed at the SOCKET_EVENTS/ProjectSocketHandlers level that
        // each event name only ever pairs with its own correct payload
        // shape; `as never` here just tells TypeScript "trust the runtime
        // dispatch, I can't prove this generic loop is type-safe on its
        // own the way a hand-written switch statement could."
        handler?.(payload as never);
      };
      socket.on(eventName, listener);
      return { eventName, listener };
    });

    return () => {
      socket.off("connect", joinRoom);
      for (const { eventName, listener } of listeners) socket.off(eventName, listener);
      socket.emit("leave-project", { projectId });
      setConnected(false);
    };
  }, [organizationId, projectId]);

  return { connected };
}

// DAY 17: a much simpler cousin of useProjectSocket above - no "join a
// room" step needed at all, because the SERVER already puts every
// connected socket into its own user room automatically the moment it
// connects (see apps/api/src/lib/socket.ts's userRoom()). This just
// listens for one event on the SAME shared connection, so it can be used
// from Topbar.tsx (rendered on every logged-in page) regardless of
// whether the person is currently looking at any particular project's
// board.
export function useNotificationSocket(onNotification: (payload: NotificationCreatedPayload) => void): void {
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  useEffect(() => {
    const socket = getSocket();
    function listener(payload: NotificationCreatedPayload) {
      handlerRef.current(payload);
    }
    socket.on(SOCKET_EVENTS.NOTIFICATION_CREATED, listener);
    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_CREATED, listener);
    };
  }, []);
}
