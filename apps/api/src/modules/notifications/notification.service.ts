// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Two very different kinds of caller use this file:
//   1. A person's browser, listing/marking-read THEIR OWN notifications
//      (via notification.controller.ts) - ordinary request/response.
//   2. OTHER service files (task.service.ts, so far) calling
//      createNotification() as a side effect of something else happening -
//      a comment mentioning someone, an assignment being made.
//
// DELIBERATE PATTERN BREAK, worth calling out: every other module's
// service function just returns data, and its CONTROLLER decides when to
// call emitToProject(...) afterward (see task.controller.ts). createNotification
// below does its OWN emitting, right here, instead of pushing that back up
// to whichever controller happened to trigger it. Reasoning: a
// notification IS the broadcast - unlike a task update (where the HTTP
// response and the broadcast are two separate concerns), there is no
// separate "response" for a notification a task update happens to create
// as a side effect. Keeping "create the row + tell the recipient" as one
// atomic step here is simpler than threading "by the way, also notify
// these 3 people" back through task.controller.ts's response handling.
// ============================================================================

import { Notification } from "./notification.model.js";
import { emitToUser } from "../../lib/socket.js";
import { SOCKET_EVENTS } from "@opssphere/shared-types";
import type { NotificationSummary, NotificationType } from "@opssphere/shared-types";

function toNotificationSummary(doc: InstanceType<typeof Notification>): NotificationSummary {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    type: doc.type,
    message: doc.message,
    linkPath: doc.linkPath,
    isRead: doc.isRead,
    createdAt: doc.createdAt.toISOString(),
  };
}

// Called by OTHER service files - never directly from a controller. Not
// org/membership-checked on purpose: by the time task.service.ts calls
// this, it has already fully resolved a real Membership (that's how it
// found the recipient's userId in the first place) - re-checking here
// would just repeat work the caller already did.
export async function createNotification(params: {
  organizationId: string;
  userId: string;
  type: NotificationType;
  message: string;
  linkPath: string;
}): Promise<void> {
  const doc = await Notification.create({
    organizationId: params.organizationId,
    userId: params.userId,
    type: params.type,
    message: params.message,
    linkPath: params.linkPath,
    isRead: false,
  });

  // Broadcast to the ONE user this notification belongs to - see
  // lib/socket.ts's userRoom()/emitToUser() for how that differs from
  // every prior day's PROJECT-room broadcasts.
  emitToUser(params.userId, SOCKET_EVENTS.NOTIFICATION_CREATED, {
    notification: toNotificationSummary(doc),
  });
}

export async function listMyNotifications(
  userId: string
): Promise<{ notifications: NotificationSummary[]; unreadCount: number }> {
  // Most recent 50 - a notification list is meant to feel like a short,
  // recent feed, not a permanent full-history archive (nothing here ever
  // gets deleted, so without a cap this would just grow forever).
  const [docs, unreadCount] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return { notifications: docs.map(toNotificationSummary), unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  // Deliberately a no-op (not a 404) if it doesn't exist or belongs to
  // someone else - same "just filter by the real owner, don't leak
  // whether a different id exists" caution as Day 3's session revocation.
  await Notification.updateOne({ _id: notificationId, userId }, { $set: { isRead: true } });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
}
