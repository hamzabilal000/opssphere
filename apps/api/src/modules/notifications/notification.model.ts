// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A single notification for ONE user - "you were assigned to a task,"
// "someone mentioned you in a comment." Unlike every model so far, this
// one belongs to a USER, not to "one organization's data" the way a
// Project or Task does - see the DAY 17 comment in shared-types for why
// that changes how it gets queried (never org-scoped in its own URL).
//
// `message` and `linkPath` are both computed ONCE, at creation time, by
// notification.service.ts's createNotification - not recomputed every
// time the list is fetched. That's a deliberate simplification: if the
// task/comment that triggered a notification later gets renamed or
// deleted, the notification still reads exactly as it did the moment it
// was created (a small, permanent record of "this happened," not a live
// view that could go stale or break).
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export type NotificationType = "mention" | "assignment";

export interface NotificationAttrs {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId; // the RECIPIENT - never the person who triggered it
  type: NotificationType;
  message: string;
  linkPath: string;
  isRead: boolean;
  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<NotificationAttrs>;

const notificationSchema = new Schema<NotificationAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    // Indexed - every real query this module runs (list mine, mark mine
    // read) filters by userId first, sorted by createdAt.
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["mention", "assignment"], required: true },
    message: { type: String, required: true },
    linkPath: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model<NotificationAttrs>("Notification", notificationSchema);
