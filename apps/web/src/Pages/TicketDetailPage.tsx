// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// One ticket's full view: its details, who it's assigned to, its status,
// and the comment thread. Three different access rules live on this ONE
// page at once - worth reading ticket.service.ts alongside this file:
//   - Editing title/description/priority: the ticket's CREATOR, or anyone
//     who can assign tickets.
//   - Changing status: the ticket's current ASSIGNEE, or anyone who can
//     assign tickets.
//   - Assigning/reassigning: ONLY someone who can assign tickets - no
//     ownership exception.
// The frontend approximates "can assign tickets" with the same canManage
// heuristic every other page uses (your role isn't literally "Member") -
// same "UX nicety, not real security" principle as always; the backend's
// requirePermission(TICKET_ASSIGN) is what actually enforces it.
// ============================================================================

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Send } from "lucide-react";
import type { TicketPriority, TicketStatus } from "@opssphere/shared-types";
import {
  useOrganizationQuery,
  useOrganizationMembersQuery,
  useTicketQuery,
  useUpdateTicketMutation,
  useAssignTicketMutation,
  useUpdateTicketStatusMutation,
  useTicketCommentsQuery,
  useCreateTicketCommentMutation,
  useMeQuery,
} from "../lib/queries";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export default function TicketDetailPage() {
  const { organizationId = "", ticketId = "" } = useParams<{ organizationId: string; ticketId: string }>();
  const { toast } = useToast();

  const orgQuery = useOrganizationQuery(organizationId);
  const membersQuery = useOrganizationMembersQuery(organizationId);
  const ticketQuery = useTicketQuery(organizationId, ticketId);
  const updateTicketMutation = useUpdateTicketMutation(organizationId, ticketId);
  const assignTicketMutation = useAssignTicketMutation(organizationId, ticketId);
  const updateStatusMutation = useUpdateTicketStatusMutation(organizationId, ticketId);
  const commentsQuery = useTicketCommentsQuery(organizationId, ticketId);
  const createCommentMutation = useCreateTicketCommentMutation(organizationId, ticketId);
  const meQuery = useMeQuery();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newComment, setNewComment] = useState("");

  const ticket = ticketQuery.data?.ticket;

  // Keep the edit form in sync whenever a fresh ticket loads (e.g. after
  // someone else's edit gets re-fetched) - same pattern as syncing local
  // form state to server data used across the app.
  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description);
    }
  }, [ticket?.id, ticket?.title, ticket?.description]);

  if (ticketQuery.isLoading) return <LoadingState label="Loading ticket…" />;
  if (ticketQuery.isError || !ticket) return <ErrorState label="Couldn't load this ticket." />;

  const currentUserId = meQuery.data?.user.id;
  const members = membersQuery.data?.members ?? [];
  const comments = commentsQuery.data?.comments ?? [];

  const canManage = orgQuery.data?.organization.myRole !== "Member";
  const isCreator = ticket.createdBy === currentUserId;
  const isAssignee = ticket.assigneeId === currentUserId;
  const canEditDetails = isCreator || canManage;
  const canChangeStatus = isAssignee || canManage;

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateTicketMutation.mutateAsync({ title, description });
      toast("Ticket updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handlePriorityChange(priority: TicketPriority) {
    try {
      await updateTicketMutation.mutateAsync({ priority });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleAssigneeChange(assigneeId: string) {
    try {
      await assignTicketMutation.mutateAsync({ assigneeId: assigneeId || null });
      toast("Ticket assigned.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleStatusChange(status: TicketStatus) {
    try {
      await updateStatusMutation.mutateAsync({ status });
      toast("Status updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCommentMutation.mutateAsync({ body: newComment });
      setNewComment("");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Ticket</p>
        <h1 className="text-2xl font-bold text-slate-900">{ticket.title}</h1>
        <p className="text-slate-500 text-sm mt-1">
          Filed by {ticket.createdByEmail} on {new Date(ticket.createdAt).toLocaleDateString()}
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-3 text-sm mb-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Priority</label>
            <select
              value={ticket.priority}
              disabled={!canEditDetails}
              onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Status</label>
            <select
              value={ticket.status}
              disabled={!canChangeStatus}
              onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Assigned to</label>
            <select
              value={ticket.assigneeId ?? ""}
              disabled={!canManage}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={handleSaveDetails} className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Title</label>
          <Input required disabled={!canEditDetails} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Description</label>
          <textarea
            value={description}
            disabled={!canEditDetails}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
          />
          {canEditDetails && (
            <Button type="submit" disabled={updateTicketMutation.isPending}>
              Save changes
            </Button>
          )}
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Comments</h2>
        {commentsQuery.isLoading && <LoadingState />}
        {comments.length === 0 && !commentsQuery.isLoading && <EmptyState label="No comments yet." />}
        <ul className="space-y-2 mb-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm bg-slate-50 rounded-md p-2">
              <p className="text-slate-700">{c.body}</p>
              <p className="text-xs text-slate-400 mt-1">
                {c.authorEmail} — {new Date(c.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddComment} className="flex gap-2">
          <Input
            required
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Reply to this ticket…"
            className="flex-1"
          />
          <Button type="submit" disabled={createCommentMutation.isPending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
