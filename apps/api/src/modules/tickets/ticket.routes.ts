// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Wires URLs to controller functions. Mounted at the SAME base path as
// organization.routes.ts/project.routes.ts/task.routes.ts
// ("/api/v1/organizations" - see app.ts), but ORG-LEVEL, not nested under a
// project: every URL here starts with "/:organizationId/tickets/..." (no
// projectId anywhere) - see ticket.model.ts for why.
//
// PERMISSION SPLIT (see PERMISSIONS in shared-types + ticket.service.ts):
//   - Reading anything here: just active org membership, same as every
//     other module.
//   - Creating a ticket: any active member (it's a helpdesk - anyone can
//     report an issue).
//   - ASSIGNING a ticket: ticket.assign, no exceptions - a flat
//     requirePermission check, since there's no meaningful "ownership"
//     angle on the act of assignment itself.
//   - Editing a ticket's details, or changing its status: ownership-or-
//     permission, checked INSIDE the controller/service (not here) - see
//     ticket.service.ts's updateTicket/updateTicketStatus for exactly what
//     "ownership" means in each case (creator vs. assignee, respectively).
//   - Ticket comments: NO permission gate on create - any active member.
// ============================================================================

import { Router } from "express";
import {
  listTicketsHandler,
  getTicketHandler,
  createTicketHandler,
  updateTicketHandler,
  assignTicketHandler,
  updateTicketStatusHandler,
  listTicketCommentsHandler,
  createTicketCommentHandler,
} from "./ticket.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireOrgMembership, requirePermission } from "../organizations/tenant.middleware.js";
import { PERMISSIONS } from "@opssphere/shared-types";

export const ticketRouter = Router();

const base = "/:organizationId/tickets";

// ---- Reads: any active org member -----------------------------------------
ticketRouter.get(base, requireAuth, requireOrgMembership, listTicketsHandler);
ticketRouter.get(`${base}/:ticketId`, requireAuth, requireOrgMembership, getTicketHandler);

// ---- Create: any active org member (this is the module that gives regular
// "Member"-role users something of their own to do - see the Day 10
// learning note) -------------------------------------------------------------
ticketRouter.post(base, requireAuth, requireOrgMembership, createTicketHandler);

// ---- Edit / status change: ownership-or-permission, checked in the
// controller/service, not here ------------------------------------------------
ticketRouter.patch(`${base}/:ticketId`, requireAuth, requireOrgMembership, updateTicketHandler);
ticketRouter.patch(`${base}/:ticketId/status`, requireAuth, requireOrgMembership, updateTicketStatusHandler);

// ---- Assign: a flat permission check, no ownership exception --------------
ticketRouter.patch(
  `${base}/:ticketId/assign`,
  requireAuth,
  requireOrgMembership,
  requirePermission(PERMISSIONS.TICKET_ASSIGN),
  assignTicketHandler
);

// ---- Comments: any active org member ---------------------------------------
ticketRouter.get(`${base}/:ticketId/comments`, requireAuth, requireOrgMembership, listTicketCommentsHandler);
ticketRouter.post(`${base}/:ticketId/comments`, requireAuth, requireOrgMembership, createTicketCommentHandler);
