// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Every support ticket in the currently-viewed organization, plus a form to
// file a new one. Unlike ProjectsListPage's create form, this one has NO
// canManage gate at all - see ticket.routes.ts's comment for why: any
// active member can report an issue, that's the whole point of a helpdesk.
// ============================================================================

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LifeBuoy, Plus } from "lucide-react";
import { useOrganizationQuery, useTicketsQuery, useCreateTicketMutation, useMeQuery } from "../lib/queries";
import type { TicketPriority, TicketStatus } from "@opssphere/shared-types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

const STATUS_BADGE: Record<TicketStatus, string> = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  resolved: "bg-teal-50 text-teal-700 border-teal-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
};

const PRIORITY_BADGE: Record<TicketPriority, string> = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};

export default function TicketsListPage() {
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const orgQuery = useOrganizationQuery(organizationId);
  const ticketsQuery = useTicketsQuery(organizationId);
  const createTicketMutation = useCreateTicketMutation(organizationId);
  const meQuery = useMeQuery();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [formError, setFormError] = useState<string | null>(null);

  const currentUserId = meQuery.data?.user.id;
  const allTickets = ticketsQuery.data?.tickets ?? [];
  const tickets = allTickets
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) => !onlyMine || t.createdBy === currentUserId || t.assigneeId === currentUserId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const result = await createTicketMutation.mutateAsync({ title, description, priority });
      setTitle("");
      setDescription("");
      setPriority("medium");
      toast(`"${result.ticket.title}" filed.`);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tickets</h1>
        <p className="text-slate-500 text-sm">{orgQuery.data?.organization.name}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | "all")}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only mine (filed or assigned)
        </label>
      </div>

      {ticketsQuery.isLoading && <LoadingState label="Loading tickets…" />}
      {ticketsQuery.isError && <ErrorState label="Couldn't load tickets." />}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && (
        <>
          {tickets.length === 0 ? (
            <EmptyState label="No tickets match this view." />
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <Link key={ticket.id} to={`/dashboard/organizations/${organizationId}/tickets/${ticket.id}`}>
                  <Card className="hover:border-brand-teal transition-colors">
                    <div className="flex items-start gap-3">
                      <LifeBuoy className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-900 truncate">{ticket.title}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[11px] rounded-full px-2 py-0.5 ${PRIORITY_BADGE[ticket.priority]}`}>
                              {ticket.priority}
                            </span>
                            <span
                              className={`text-[11px] border rounded-full px-2 py-0.5 ${STATUS_BADGE[ticket.status]}`}
                            >
                              {ticket.status.replace("_", " ")}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Filed by {ticket.createdByEmail}
                          {ticket.assigneeEmail ? ` — assigned to ${ticket.assigneeEmail}` : " — unassigned"}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Any active member can file a ticket - no canManage gate here on
          purpose, see the file header comment. */}
      <Card className="max-w-md">
        <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> File a ticket
        </p>
        <form onSubmit={handleCreate} className="space-y-2">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's wrong?" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="More detail (optional)"
            rows={3}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
            <option value="urgent">Urgent</option>
          </select>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <Button type="submit" disabled={createTicketMutation.isPending} className="w-full">
            {createTicketMutation.isPending ? "Filing…" : "File ticket"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
