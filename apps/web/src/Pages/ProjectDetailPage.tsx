// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// One project's full management view: status, milestones, and members
// (drawn from - and validated against - the organization's own member
// list, see project.service.ts's addProjectMember for why you can only
// add EXISTING org members to a project).
// ============================================================================

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Trash2, Plus, LayoutGrid } from "lucide-react";
import {
  useOrganizationQuery,
  useOrganizationMembersQuery,
  useProjectQuery,
  useUpdateProjectMutation,
  useProjectMembersQuery,
  useAddProjectMemberMutation,
  useRemoveProjectMemberMutation,
  useMilestonesQuery,
  useCreateMilestoneMutation,
  useUpdateMilestoneMutation,
  useDeleteMilestoneMutation,
} from "../lib/queries";
import type { ProjectStatus, ProjectMemberRole } from "@opssphere/shared-types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

export default function ProjectDetailPage() {
  const { organizationId = "", projectId = "" } = useParams<{ organizationId: string; projectId: string }>();
  const { toast } = useToast();

  const orgQuery = useOrganizationQuery(organizationId);
  const orgMembersQuery = useOrganizationMembersQuery(organizationId);
  const projectQuery = useProjectQuery(organizationId, projectId);
  const updateProjectMutation = useUpdateProjectMutation(organizationId, projectId);
  const membersQuery = useProjectMembersQuery(organizationId, projectId);
  const addMemberMutation = useAddProjectMemberMutation(organizationId, projectId);
  const removeMemberMutation = useRemoveProjectMemberMutation(organizationId, projectId);
  const milestonesQuery = useMilestonesQuery(organizationId, projectId);
  const createMilestoneMutation = useCreateMilestoneMutation(organizationId, projectId);
  const updateMilestoneMutation = useUpdateMilestoneMutation(organizationId, projectId);
  const deleteMilestoneMutation = useDeleteMilestoneMutation(organizationId, projectId);

  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<ProjectMemberRole>("member");
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");

  if (projectQuery.isLoading) return <LoadingState label="Loading project…" />;
  if (projectQuery.isError || !projectQuery.data) return <ErrorState label="Couldn't load this project." />;

  const project = projectQuery.data.project;
  const members = membersQuery.data?.members ?? [];
  const milestones = milestonesQuery.data?.milestones ?? [];
  const orgMembers = orgMembersQuery.data?.members ?? [];

  const canManage = orgQuery.data?.organization.myRole !== "Member";

  // Only org members who AREN'T already on this project can be added -
  // same idea as project.service.ts's server-side duplicate check, just
  // reflected here so the dropdown doesn't even offer an invalid choice.
  const projectMemberUserIds = new Set(members.map((m) => m.userId));
  const addableOrgMembers = orgMembers.filter((m) => !projectMemberUserIds.has(m.userId));

  async function handleStatusChange(status: ProjectStatus) {
    try {
      await updateProjectMutation.mutateAsync({ status });
      toast("Project status updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addMemberMutation.mutateAsync({ userId: newMemberUserId, role: newMemberRole });
      setNewMemberUserId("");
      toast("Member added.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await removeMemberMutation.mutateAsync(memberId);
      toast("Member removed.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleCreateMilestone(e: React.FormEvent) {
    e.preventDefault();
    try {
      // TYPESCRIPT NOTE: the <input type="date"> below always gives us a
      // plain text value like "2026-08-01" - CreateMilestoneInput's
      // dueDate field is typed as a real `Date` (see createMilestoneSchema's
      // z.coerce.date() in packages/validation), so we convert it here
      // with `new Date(...)` before sending it.
      await createMilestoneMutation.mutateAsync({ name: newMilestoneName, dueDate: new Date(newMilestoneDate) });
      setNewMilestoneName("");
      setNewMilestoneDate("");
      toast("Milestone created.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleToggleMilestone(milestoneId: string, isComplete: boolean) {
    await updateMilestoneMutation.mutateAsync({ milestoneId, input: { isComplete } });
  }

  async function handleDeleteMilestone(milestoneId: string) {
    await deleteMilestoneMutation.mutateAsync(milestoneId);
    toast("Milestone deleted.");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <div className="flex items-center gap-2">
            <Link
              to={`/dashboard/organizations/${organizationId}/projects/${projectId}/board`}
              className="flex items-center gap-1.5 text-sm rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              <LayoutGrid className="w-4 h-4" /> Board
            </Link>
            {canManage ? (
              <select
                value={project.status}
                onChange={(e) => handleStatusChange(e.target.value as ProjectStatus)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            ) : (
              <span className="text-sm text-slate-500">{project.status}</span>
            )}
          </div>
        </div>
        {project.description && <p className="text-slate-500 text-sm mt-1">{project.description}</p>}
      </div>

      {/* Milestones */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Milestones</h2>
        {milestonesQuery.isLoading && <LoadingState />}
        {milestones.length === 0 && !milestonesQuery.isLoading && <EmptyState label="No milestones yet." />}
        <ul className="space-y-2 mb-3">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={m.isComplete}
                  disabled={!canManage}
                  onChange={(e) => handleToggleMilestone(m.id, e.target.checked)}
                />
                <span className={m.isComplete ? "line-through text-slate-400" : ""}>{m.name}</span>
                <span className="text-xs text-slate-400">— due {new Date(m.dueDate).toLocaleDateString()}</span>
              </label>
              {canManage && (
                <button onClick={() => handleDeleteMilestone(m.id)} className="text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <form onSubmit={handleCreateMilestone} className="flex gap-2">
            <Input
              required
              value={newMilestoneName}
              onChange={(e) => setNewMilestoneName(e.target.value)}
              placeholder="New milestone"
              className="flex-1"
            />
            <input
              type="date"
              required
              value={newMilestoneDate}
              onChange={(e) => setNewMilestoneDate(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={createMilestoneMutation.isPending}>
              Add
            </Button>
          </form>
        )}
      </Card>

      {/* Members */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Members</h2>
        {membersQuery.isLoading && <LoadingState />}
        {members.length === 0 && !membersQuery.isLoading && <EmptyState label="No members yet." />}
        <ul className="space-y-2 mb-3">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {m.email} <span className="text-slate-400">— {m.role}</span>
              </span>
              {canManage && (
                <button
                  onClick={() => handleRemoveMember(m.id)}
                  className="text-red-600 flex items-center gap-1 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <form onSubmit={handleAddMember} className="flex gap-2">
            <select
              required
              value={newMemberUserId}
              onChange={(e) => setNewMemberUserId(e.target.value)}
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="" disabled>
                {addableOrgMembers.length === 0 ? "No addable org members" : "Choose an org member"}
              </option>
              {addableOrgMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.email}
                </option>
              ))}
            </select>
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as ProjectMemberRole)}
              className="border border-slate-300 rounded-md px-2 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="lead">Lead</option>
            </select>
            <Button type="submit" disabled={addMemberMutation.isPending || !newMemberUserId}>
              <Plus className="w-4 h-4" />
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
