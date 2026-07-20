// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// One project's risk register - every DAY 11 Risk, plus a form to add one.
// Unlike TicketsListPage (any active member can file a ticket), the create
// form AND every edit/delete action here is gated behind the SAME
// `canManage` frontend heuristic ProjectDetailPage.tsx already uses - the
// REAL gate is risk.manage on the backend (see risk.routes.ts), this is
// just the "don't even show the button" UX nicety documented everywhere
// else in this project.
// ============================================================================

import { useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldAlert, Plus, Pencil, Trash2, X } from "lucide-react";
import {
  useOrganizationQuery,
  useOrganizationMembersQuery,
  useProjectQuery,
  useRisksQuery,
  useCreateRiskMutation,
  useUpdateRiskMutation,
  useDeleteRiskMutation,
} from "../lib/queries";
import type { RiskImpact, RiskLikelihood, RiskStatus, RiskSummary } from "@opssphere/shared-types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

const LEVEL_BADGE: Record<RiskLikelihood | RiskImpact, string> = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-red-50 text-red-700",
};

const STATUS_BADGE: Record<RiskStatus, string> = {
  identified: "bg-amber-50 text-amber-700 border-amber-200",
  mitigating: "bg-blue-50 text-blue-700 border-blue-200",
  resolved: "bg-teal-50 text-teal-700 border-teal-200",
  accepted: "bg-slate-100 text-slate-500 border-slate-200",
};

interface RiskFormState {
  title: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigationPlan: string;
  ownerId: string;
}

const EMPTY_FORM: RiskFormState = {
  title: "",
  description: "",
  likelihood: "medium",
  impact: "medium",
  mitigationPlan: "",
  ownerId: "",
};

export default function RiskRegisterPage() {
  const { organizationId = "", projectId = "" } = useParams<{ organizationId: string; projectId: string }>();
  const { toast } = useToast();

  const orgQuery = useOrganizationQuery(organizationId);
  const orgMembersQuery = useOrganizationMembersQuery(organizationId);
  const projectQuery = useProjectQuery(organizationId, projectId);
  const risksQuery = useRisksQuery(organizationId, projectId);
  const createRiskMutation = useCreateRiskMutation(organizationId, projectId);
  const updateRiskMutation = useUpdateRiskMutation(organizationId, projectId);
  const deleteRiskMutation = useDeleteRiskMutation(organizationId, projectId);

  const [statusFilter, setStatusFilter] = useState<RiskStatus | "all">("all");
  const [createForm, setCreateForm] = useState<RiskFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RiskFormState>(EMPTY_FORM);

  const canManage = orgQuery.data?.organization.myRole !== "Member";
  const orgMembers = orgMembersQuery.data?.members ?? [];
  const allRisks = risksQuery.data?.risks ?? [];
  const risks = allRisks.filter((r) => statusFilter === "all" || r.status === statusFilter);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      await createRiskMutation.mutateAsync({
        title: createForm.title,
        description: createForm.description,
        likelihood: createForm.likelihood,
        impact: createForm.impact,
        mitigationPlan: createForm.mitigationPlan,
        ownerId: createForm.ownerId || undefined,
      });
      setCreateForm(EMPTY_FORM);
      toast("Risk added to the register.");
    } catch (err) {
      setCreateError((err as Error).message);
    }
  }

  function startEdit(risk: RiskSummary) {
    setEditingRiskId(risk.id);
    setEditForm({
      title: risk.title,
      description: risk.description,
      likelihood: risk.likelihood,
      impact: risk.impact,
      mitigationPlan: risk.mitigationPlan,
      ownerId: risk.ownerId ?? "",
    });
  }

  async function handleSaveEdit(riskId: string) {
    try {
      await updateRiskMutation.mutateAsync({
        riskId,
        input: {
          title: editForm.title,
          description: editForm.description,
          likelihood: editForm.likelihood,
          impact: editForm.impact,
          mitigationPlan: editForm.mitigationPlan,
          ownerId: editForm.ownerId || null,
        },
      });
      setEditingRiskId(null);
      toast("Risk updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleStatusChange(riskId: string, status: RiskStatus) {
    try {
      await updateRiskMutation.mutateAsync({ riskId, input: { status } });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDelete(riskId: string) {
    try {
      await deleteRiskMutation.mutateAsync(riskId);
      toast("Risk removed.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  if (projectQuery.isLoading) return <LoadingState label="Loading project…" />;
  if (projectQuery.isError || !projectQuery.data) return <ErrorState label="Couldn't load this project." />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-brand" /> Risk register
        </h1>
        <p className="text-slate-500 text-sm">{projectQuery.data.project.name}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RiskStatus | "all")}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="identified">Identified</option>
          <option value="mitigating">Mitigating</option>
          <option value="resolved">Resolved</option>
          <option value="accepted">Accepted</option>
        </select>
      </div>

      {risksQuery.isLoading && <LoadingState label="Loading risks…" />}
      {risksQuery.isError && <ErrorState label="Couldn't load the risk register." />}

      {!risksQuery.isLoading && !risksQuery.isError && (
        <>
          {risks.length === 0 ? (
            <EmptyState label="No risks match this view." />
          ) : (
            <div className="space-y-2">
              {risks.map((risk) => {
                const isEditing = editingRiskId === risk.id;
                return (
                  <Card key={risk.id}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-700">Editing risk</p>
                          <button onClick={() => setEditingRiskId(null)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <Input
                          required
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="Title"
                        />
                        <textarea
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Description"
                          rows={2}
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editForm.likelihood}
                            onChange={(e) => setEditForm({ ...editForm, likelihood: e.target.value as RiskLikelihood })}
                            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                          >
                            <option value="low">Likelihood: low</option>
                            <option value="medium">Likelihood: medium</option>
                            <option value="high">Likelihood: high</option>
                          </select>
                          <select
                            value={editForm.impact}
                            onChange={(e) => setEditForm({ ...editForm, impact: e.target.value as RiskImpact })}
                            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                          >
                            <option value="low">Impact: low</option>
                            <option value="medium">Impact: medium</option>
                            <option value="high">Impact: high</option>
                          </select>
                        </div>
                        <textarea
                          value={editForm.mitigationPlan}
                          onChange={(e) => setEditForm({ ...editForm, mitigationPlan: e.target.value })}
                          placeholder="Mitigation plan"
                          rows={2}
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                        />
                        <select
                          value={editForm.ownerId}
                          onChange={(e) => setEditForm({ ...editForm, ownerId: e.target.value })}
                          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                        >
                          <option value="">Unassigned</option>
                          {orgMembers.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.email}
                            </option>
                          ))}
                        </select>
                        <Button
                          onClick={() => handleSaveEdit(risk.id)}
                          disabled={updateRiskMutation.isPending}
                          className="w-full"
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-slate-900">{risk.title}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[11px] rounded-full px-2 py-0.5 ${LEVEL_BADGE[risk.likelihood]}`}>
                              L: {risk.likelihood}
                            </span>
                            <span className={`text-[11px] rounded-full px-2 py-0.5 ${LEVEL_BADGE[risk.impact]}`}>
                              I: {risk.impact}
                            </span>
                            <span className="text-[11px] rounded-full px-2 py-0.5 bg-slate-900 text-white">
                              Score {risk.riskScore}
                            </span>
                          </div>
                        </div>
                        {risk.description && <p className="text-sm text-slate-500 mt-1">{risk.description}</p>}
                        {risk.mitigationPlan && (
                          <p className="text-xs text-slate-500 mt-1">
                            <span className="font-medium text-slate-600">Mitigation:</span> {risk.mitigationPlan}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          Raised by {risk.createdByEmail}
                          {risk.ownerEmail ? ` — owned by ${risk.ownerEmail}` : " — unowned"}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          {canManage ? (
                            <select
                              value={risk.status}
                              onChange={(e) => handleStatusChange(risk.id, e.target.value as RiskStatus)}
                              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                            >
                              <option value="identified">Identified</option>
                              <option value="mitigating">Mitigating</option>
                              <option value="resolved">Resolved</option>
                              <option value="accepted">Accepted</option>
                            </select>
                          ) : (
                            <span className={`text-[11px] border rounded-full px-2 py-0.5 ${STATUS_BADGE[risk.status]}`}>
                              {risk.status}
                            </span>
                          )}
                          {canManage && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEdit(risk)} className="text-slate-400 hover:text-slate-600">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(risk.id)} className="text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* risk.manage gated - see the file header comment for why this is
          different from TicketsListPage's open-to-everyone create form. */}
      {canManage && (
        <Card className="max-w-md">
          <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add a risk
          </p>
          <form onSubmit={handleCreate} className="space-y-2">
            <Input
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="What could go wrong?"
            />
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="More detail (optional)"
              rows={2}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={createForm.likelihood}
                onChange={(e) => setCreateForm({ ...createForm, likelihood: e.target.value as RiskLikelihood })}
                className="border border-slate-300 rounded-md px-2 py-2 text-sm"
              >
                <option value="low">Likelihood: low</option>
                <option value="medium">Likelihood: medium</option>
                <option value="high">Likelihood: high</option>
              </select>
              <select
                value={createForm.impact}
                onChange={(e) => setCreateForm({ ...createForm, impact: e.target.value as RiskImpact })}
                className="border border-slate-300 rounded-md px-2 py-2 text-sm"
              >
                <option value="low">Impact: low</option>
                <option value="medium">Impact: medium</option>
                <option value="high">Impact: high</option>
              </select>
            </div>
            <textarea
              value={createForm.mitigationPlan}
              onChange={(e) => setCreateForm({ ...createForm, mitigationPlan: e.target.value })}
              placeholder="Mitigation plan (optional)"
              rows={2}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={createForm.ownerId}
              onChange={(e) => setCreateForm({ ...createForm, ownerId: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {orgMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.email}
                </option>
              ))}
            </select>
            {createError && <p className="text-red-600 text-sm">{createError}</p>}
            <Button type="submit" disabled={createRiskMutation.isPending} className="w-full">
              {createRiskMutation.isPending ? "Adding…" : "Add risk"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
