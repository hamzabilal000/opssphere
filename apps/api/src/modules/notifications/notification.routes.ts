// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Mounted at its OWN top-level base path ("/api/v1/notifications" - see
// app.ts), NOT under "/organizations/:organizationId/..." like most
// modules - a notification belongs to a USER, who might have notifications
// from several different organizations at once (see the DAY 17 comment in
// shared-types). Every route here is just `requireAuth` - no
// requireOrgMembership, no permission check - because every query in
// notification.service.ts already filters by `req.userId` itself; there's
// no "other people's notifications" surface to accidentally expose.
// ============================================================================

import { Router } from "express";
import {
  listMyNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
} from "./notification.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";

export const notificationRouter = Router();

notificationRouter.get("/", requireAuth, listMyNotificationsHandler);
notificationRouter.patch("/read-all", requireAuth, markAllNotificationsReadHandler);
notificationRouter.patch("/:notificationId/read", requireAuth, markNotificationReadHandler);
