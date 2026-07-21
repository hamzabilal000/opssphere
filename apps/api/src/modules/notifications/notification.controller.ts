// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer - same 3-step shape as every other controller,
// though there's no create/validate step here at all: nobody ever POSTs a
// notification directly (see notification.service.ts's createNotification -
// only OTHER service files call that).
// ============================================================================

import type { Request, Response } from "express";
import type { ApiSuccessResponse, NotificationSummary } from "@opssphere/shared-types";
import * as notificationService from "./notification.service.js";

// GET /api/v1/notifications
export async function listMyNotificationsHandler(req: Request, res: Response) {
  const { notifications, unreadCount } = await notificationService.listMyNotifications(req.userId ?? "");
  const body: ApiSuccessResponse<{ notifications: NotificationSummary[]; unreadCount: number }> = {
    success: true,
    data: { notifications, unreadCount },
  };
  res.status(200).json(body);
}

// PATCH /api/v1/notifications/:notificationId/read
export async function markNotificationReadHandler(req: Request, res: Response) {
  await notificationService.markNotificationRead(req.userId ?? "", String(req.params.notificationId ?? ""));
  const body: ApiSuccessResponse<null> = { success: true, data: null };
  res.status(200).json(body);
}

// PATCH /api/v1/notifications/read-all
export async function markAllNotificationsReadHandler(req: Request, res: Response) {
  await notificationService.markAllNotificationsRead(req.userId ?? "");
  const body: ApiSuccessResponse<null> = { success: true, data: null };
  res.status(200).json(body);
}
