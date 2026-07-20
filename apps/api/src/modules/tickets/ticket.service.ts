// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The business rules for tickets and ticket comments - same separation as
// every other service file: no Express here, just plain arguments in,
// plain data out.
// ============================================================================

import { Types } from "mongoose";
import { Ticket } from "./ticket.model.js";
import { TicketComment } from "./ticket-comment.model.js";
import { Membership } from "../organizations/membership.model.js";
import { User } from "../auth/user.model.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type {
  CreateTicketInput,
  UpdateTicketInput,
  UpdateTicketStatusInput,
  CreateTicketCommentInput,
} from "@opssphere/validation";
import type { TicketSummary, TicketCommentSummary } from "@opssphere/shared-types";

// ----------------------------------------------------------------------------
// SHARED HELPER
// ----------------------------------------------------------------------------
async function findTicketOrThrow(organizationId: string, ticketId: string) {
  const ticket = await Ticket.findOne({ _id: ticketId, organizationId });
  if (!ticket) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Ticket not found.");
  }
  return ticket;
}

// Turns a batch of Ticket documents into TicketSummary[], resolving both
// creator AND assignee emails in one batched query - same "don't query
// inside a loop" principle every earlier module uses.
async function toTicketSummaries(tickets: InstanceType<typeof Ticket>[]): Promise<TicketSummary[]> {
  const userIds = new Set<string>();
  for (const t of tickets) {
    userIds.add(t.createdBy.toString());
    if (t.assigneeId) userIds.add(t.assigneeId.toString());
  }
  const users = userIds.size > 0 ? await User.find({ _id: { $in: Array.from(userIds) } }) : [];
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return tickets.map((t) => ({
    id: t._id.toString(),
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    createdBy: t.createdBy.toString(),
    createdByEmail: emailByUserId.get(t.createdBy.toString()) ?? "unknown",
    assigneeId: t.assigneeId?.toString(),
    assigneeEmail: t.assigneeId ? emailByUserId.get(t.assigneeId.toString()) ?? "unknown" : undefined,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

// ----------------------------------------------------------------------------
// TICKETS
// ----------------------------------------------------------------------------
export async function listTickets(organizationId: string): Promise<TicketSummary[]> {
  const tickets = await Ticket.find({ organizationId }).sort({ createdAt: -1 });
  return toTicketSummaries(tickets);
}

export async function getTicket(organizationId: string, ticketId: string): Promise<TicketSummary> {
  const ticket = await findTicketOrThrow(organizationId, ticketId);
  const [summary] = await toTicketSummaries([ticket]);
  return summary as TicketSummary;
}

// Any active org member can file one - deliberately NO assigneeId field
// here (see createTicketSchema in packages/validation). Assignment is its
// own separate, permission-gated action (assignTicket below) - "anyone can
// report an issue, only someone with ticket.assign routes it to the right
// person," a real, common helpdesk workflow.
export async function createTicket(
  organizationId: string,
  createdBy: string,
  input: CreateTicketInput
): Promise<TicketSummary> {
  const ticket = await Ticket.create({
    organizationId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    status: "open",
    createdBy,
  });

  const [summary] = await toTicketSummaries([ticket]);
  return summary as TicketSummary;
}

// `canAssignTickets` is the caller's ticket.assign permission (resolved by
// the controller) - editing a ticket's own details is allowed for whoever
// FILED it, or anyone with ticket.assign. Same ownership-or-permission
// shape as Day 8/9's attachment/time-entry/comment rules.
export async function updateTicket(
  organizationId: string,
  ticketId: string,
  actingUserId: string,
  canAssignTickets: boolean,
  input: UpdateTicketInput
): Promise<TicketSummary> {
  const ticket = await findTicketOrThrow(organizationId, ticketId);

  const isCreator = ticket.createdBy.toString() === actingUserId;
  if (!isCreator && !canAssignTickets) {
    throw new ApiError(403, "FORBIDDEN", "Only the ticket's creator or someone who can assign tickets can edit it.");
  }

  if (input.title !== undefined) ticket.title = input.title;
  if (input.description !== undefined) ticket.description = input.description;
  if (input.priority !== undefined) ticket.priority = input.priority;
  await ticket.save();

  const [summary] = await toTicketSummaries([ticket]);
  return summary as TicketSummary;
}

// Route-level requirePermission(TICKET_ASSIGN) already gates this whole
// function (see ticket.routes.ts) - no ownership exception here on
// purpose. Assigning work to people is inherently a coordinator/agent
// action, not something a random member should be able to do to
// themselves or others just by asking.
export async function assignTicket(
  organizationId: string,
  ticketId: string,
  assigneeId: string | null
): Promise<TicketSummary> {
  const ticket = await findTicketOrThrow(organizationId, ticketId);

  if (assigneeId === null) {
    ticket.assigneeId = undefined;
  } else {
    // Same "re-check against a real, ACTIVE record" principle as adding a
    // project member (Day 7) or assigning a task (Day 8) - a ticket can't
    // be handed to someone who isn't even an active member of this org.
    const membership = await Membership.findOne({ organizationId, userId: assigneeId, status: "active" });
    if (!membership) {
      throw new ApiError(400, "VALIDATION_ERROR", "That person is not an active member of this organization.");
    }
    ticket.assigneeId = new Types.ObjectId(assigneeId);
  }
  await ticket.save();

  const [summary] = await toTicketSummaries([ticket]);
  return summary as TicketSummary;
}

// `canAssignTickets` again - but here the OTHER half of the ownership
// check is "are you the ticket's current ASSIGNEE," not its creator.
// Whoever's actually working a ticket can move it through open -> in
// progress -> resolved -> closed without needing org-wide ticket.assign;
// assigning brand-new work to people still needs the real permission.
export async function updateTicketStatus(
  organizationId: string,
  ticketId: string,
  actingUserId: string,
  canAssignTickets: boolean,
  input: UpdateTicketStatusInput
): Promise<TicketSummary> {
  const ticket = await findTicketOrThrow(organizationId, ticketId);

  const isAssignee = ticket.assigneeId?.toString() === actingUserId;
  if (!isAssignee && !canAssignTickets) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only the ticket's assignee or someone who can assign tickets can change its status."
    );
  }

  ticket.status = input.status;
  await ticket.save();

  const [summary] = await toTicketSummaries([ticket]);
  return summary as TicketSummary;
}

// ----------------------------------------------------------------------------
// TICKET COMMENTS  (any active org member - no permission gate, same
// "low-risk collaborative action" reasoning as Day 8's task comments)
// ----------------------------------------------------------------------------
export async function listTicketComments(organizationId: string, ticketId: string): Promise<TicketCommentSummary[]> {
  await findTicketOrThrow(organizationId, ticketId);
  const comments = await TicketComment.find({ ticketId }).sort({ createdAt: 1 });
  if (comments.length === 0) return [];

  const authorIds = comments.map((c) => c.authorId);
  const users = await User.find({ _id: { $in: authorIds } });
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  return comments.map((c) => ({
    id: c._id.toString(),
    authorId: c.authorId.toString(),
    authorEmail: emailByUserId.get(c.authorId.toString()) ?? "unknown",
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function createTicketComment(
  organizationId: string,
  ticketId: string,
  authorId: string,
  input: CreateTicketCommentInput
): Promise<TicketCommentSummary> {
  await findTicketOrThrow(organizationId, ticketId);

  const comment = await TicketComment.create({ organizationId, ticketId, authorId, body: input.body });
  const author = await User.findById(authorId);

  return {
    id: comment._id.toString(),
    authorId: comment.authorId.toString(),
    authorEmail: author?.email ?? "unknown",
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  };
}
