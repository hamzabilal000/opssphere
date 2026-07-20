// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer, same 3-step shape as every other controller in
// this project: validate, call the service, respond.
// ============================================================================

import type { Request, Response } from "express";
import {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  updateTicketStatusSchema,
  createTicketCommentSchema,
} from "@opssphere/validation";
import { PERMISSIONS } from "@opssphere/shared-types";
import type { ApiSuccessResponse, TicketSummary, TicketCommentSummary } from "@opssphere/shared-types";
import * as ticketService from "./ticket.service.js";
import { ApiError } from "../../middleware/errorHandler.js";

function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return Object.entries(error.flatten().fieldErrors).map(([field, messages]) => ({
    field,
    message: messages?.[0] ?? "Invalid value",
  }));
}

// Reused by update/status handlers below - "does the caller's role carry
// ticket.assign?" (see ticket.service.ts's ownership-or-permission notes).
function canAssignTickets(req: Request): boolean {
  return (req.membershipPermissions ?? []).includes(PERMISSIONS.TICKET_ASSIGN);
}

// ----------------------------------------------------------------------------
// TICKETS
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/tickets
export async function listTicketsHandler(req: Request, res: Response) {
  const tickets = await ticketService.listTickets(req.organizationId ?? "");
  const body: ApiSuccessResponse<{ tickets: TicketSummary[] }> = { success: true, data: { tickets } };
  res.status(200).json(body);
}

// GET /api/v1/organizations/:organizationId/tickets/:ticketId
export async function getTicketHandler(req: Request, res: Response) {
  const ticket = await ticketService.getTicket(req.organizationId ?? "", String(req.params.ticketId ?? ""));
  const body: ApiSuccessResponse<{ ticket: TicketSummary }> = { success: true, data: { ticket } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/tickets
export async function createTicketHandler(req: Request, res: Response) {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const ticket = await ticketService.createTicket(req.organizationId ?? "", req.userId ?? "", parsed.data);

  const body: ApiSuccessResponse<{ ticket: TicketSummary }> = {
    success: true,
    message: "Ticket created.",
    data: { ticket },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/tickets/:ticketId
export async function updateTicketHandler(req: Request, res: Response) {
  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const ticket = await ticketService.updateTicket(
    req.organizationId ?? "",
    String(req.params.ticketId ?? ""),
    req.userId ?? "",
    canAssignTickets(req),
    parsed.data
  );

  const body: ApiSuccessResponse<{ ticket: TicketSummary }> = {
    success: true,
    message: "Ticket updated.",
    data: { ticket },
  };
  res.status(200).json(body);
}

// PATCH /api/v1/organizations/:organizationId/tickets/:ticketId/assign
export async function assignTicketHandler(req: Request, res: Response) {
  const parsed = assignTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const ticket = await ticketService.assignTicket(
    req.organizationId ?? "",
    String(req.params.ticketId ?? ""),
    parsed.data.assigneeId
  );

  const body: ApiSuccessResponse<{ ticket: TicketSummary }> = {
    success: true,
    message: "Ticket assigned.",
    data: { ticket },
  };
  res.status(200).json(body);
}

// PATCH /api/v1/organizations/:organizationId/tickets/:ticketId/status
export async function updateTicketStatusHandler(req: Request, res: Response) {
  const parsed = updateTicketStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const ticket = await ticketService.updateTicketStatus(
    req.organizationId ?? "",
    String(req.params.ticketId ?? ""),
    req.userId ?? "",
    canAssignTickets(req),
    parsed.data
  );

  const body: ApiSuccessResponse<{ ticket: TicketSummary }> = {
    success: true,
    message: "Ticket status updated.",
    data: { ticket },
  };
  res.status(200).json(body);
}

// ----------------------------------------------------------------------------
// TICKET COMMENTS  (any active org member - no permission gate)
// ----------------------------------------------------------------------------

// GET /api/v1/organizations/:organizationId/tickets/:ticketId/comments
export async function listTicketCommentsHandler(req: Request, res: Response) {
  const comments = await ticketService.listTicketComments(
    req.organizationId ?? "",
    String(req.params.ticketId ?? "")
  );
  const body: ApiSuccessResponse<{ comments: TicketCommentSummary[] }> = { success: true, data: { comments } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/tickets/:ticketId/comments
export async function createTicketCommentHandler(req: Request, res: Response) {
  const parsed = createTicketCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const comment = await ticketService.createTicketComment(
    req.organizationId ?? "",
    String(req.params.ticketId ?? ""),
    req.userId ?? "",
    parsed.data
  );

  const body: ApiSuccessResponse<{ comment: TicketCommentSummary }> = {
    success: true,
    message: "Comment added.",
    data: { comment },
  };
  res.status(201).json(body);
}
