// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The full management view for ONE organization: members (with role
// assignment), roles (with custom-role creation), departments, teams, and
// an org-scoped invite form. This is the same functionality Days 4-5 built
// as an expandable panel inside DashboardPage - Day 6 gives it its own
// real page (`/dashboard/organizations/:organizationId`) and rebuilds it
// on TanStack Query instead of manual useState/useEffect + refetch
// functions.
// ============================================================================

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import {
  useOrganizationQuery,
  useOrganizationMembersQuery,
  useOrganizationRolesQuery,
  useOrganizationDepartmentsQuery,
  useOrganizationTeamsQuery,
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useCreateDepartmentMutation,
  useDeleteDepartmentMutation,
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useUpdateMemberRoleMutation,
  useCreateOrgInvitationMutation,
} from "../lib/queries";
import { PERMISSIONS } from "@opssphere/shared-types";
import type { Permission } from "@opssphere/shared-types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.ORG_MANAGE]: "Manage organization settings",
  [PERMISSIONS.MEMBER_INVITE]: "Invite members",
  [PERMISSIONS.MEMBER_REMOVE]: "Remove members",
  [PERMISSIONS.MEMBER_ROLE_UPDATE]: "Change member roles",
  [PERMISSIONS.ROLE_MANAGE]: "Manage roles",
  [PERMISSIONS.DEPARTMENT_MANAGE]: "Manage departments",
  [PERMISSIONS.TEAM_MANAGE]: "Manage teams",
  [PERMISSIONS.PROJECT_CREATE]: "Create projects",
  [PERMISSIONS.PROJECT_MANAGE]: "Manage projects (edit, archive, milestones)",
  [PERMISSIONS.PROJECT_MEMBER_MANAGE]: "Add/remove project members",
  [PERMISSIONS.TICKET_ASSIGN]: "Assign tickets (reserved for a later day)",
};

export default function OrganizationDetailPage() {
  // useParams() reads the `:organizationId` segment straight out of the
  // URL - react-router-dom fills it in from whatever route matched (see
  // App.tsx's `path="organizations/:organizationId"`).
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const { toast } = useToast();

  const orgQuery = useOrganizationQuery(organizationId);
  const membersQuery = useOrganizationMembersQuery(organizationId);
  const rolesQuery = useOrganizationRolesQuery(organizationId);
  const departmentsQuery = useOrganizationDepartmentsQuery(organizationId);
  const teamsQuery = useOrganizationTeamsQuery(organizationId);

  const createRoleMutation = useCreateRoleMutation(organizationId);
  const deleteRoleMutation = useDeleteRoleMutation(organizationId);
  const createDepartmentMutation = useCreateDepartmentMutation(organizationId);
  const deleteDepartmentMutation = useDeleteDepartmentMutation(organizationId);
  const createTeamMutation = useCreateTeamMutation(organizationId);
  const deleteTeamMutation = useDeleteTeamMutation(organizationId);
  const updateMemberRoleMutation = useUpdateMemberRoleMutation(organizationId);
  const createInvitationMutation = useCreateOrgInvitationMutation(organizationId);

  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<Permission[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDepartmentId, setNewTeamDepartmentId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");

  if (orgQuery.isLoading) return <LoadingState label="Loading organization…" />;
  if (orgQuery.isError || !orgQuery.data) return <ErrorState label="Couldn't load this organization." />;

  const org = orgQuery.data.organization;
  const roles = rolesQuery.data?.roles ?? [];
  const departments = departmentsQuery.data?.departments ?? [];
  const teams = teamsQuery.data?.teams ?? [];
  const members = membersQuery.data?.members ?? [];

  // NOTE: same as Day 5 - this is a FRONTEND-ONLY convenience for hiding
  // admin-ish controls, not a real permission check. The backend
  // (requirePermission, tenant.middleware.ts) is what actually enforces
  // everything - see the SRS principle quoted there: "hiding a button on
  // the frontend is a UX nicety, never real security."
  const canManage = org.myRole !== "Member";

  function toggleRolePermission(permission: Permission) {
    setNewRolePermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRoleMutation.mutateAsync({ name: newRoleName, permissions: newRolePermissions });
      setNewRoleName("");
      setNewRolePermissions([]);
      toast("Role created.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDeleteRole(roleId: string) {
    try {
      await deleteRoleMutation.mutateAsync(roleId);
      toast("Role deleted.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createDepartmentMutation.mutateAsync({ name: newDepartmentName });
      setNewDepartmentName("");
      toast("Department created.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTeamMutation.mutateAsync({ name: newTeamName, departmentId: newTeamDepartmentId || undefined });
      setNewTeamName("");
      setNewTeamDepartmentId("");
      toast("Team created.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleChangeMemberRole(membershipId: string, roleId: string) {
    try {
      await updateMemberRoleMutation.mutateAsync({ membershipId, roleId });
      toast("Member role updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createInvitationMutation.mutateAsync({ email: inviteEmail, roleId: inviteRoleId });
      setInviteEmail("");
      toast(`Invitation sent to ${inviteEmail}.`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
        <p className="text-slate-500 text-sm">
          {org.slug} · {org.timeZone} · {org.businessHours.start}–{org.businessHours.end} · Your role:{" "}
          {org.myRole}
        </p>
      </div>

      {/* Members */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Members</h2>
        {membersQuery.isLoading && <LoadingState />}
        {members.length === 0 && !membersQuery.isLoading && <EmptyState label="No members yet." />}
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {m.email}
                {m.status === "suspended" && <span className="text-red-500"> (suspended)</span>}
              </span>
              {canManage ? (
                <select
                  value={m.roleId}
                  onChange={(e) => handleChangeMemberRole(m.id, e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-slate-400">{m.roleName}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* Roles */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Roles</h2>
        <ul className="space-y-2 mb-4">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {r.name}
                {r.isSystemRole && <span className="text-slate-400"> (built-in)</span>} —{" "}
                {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
              </span>
              {canManage && !r.isSystemRole && (
                <button
                  onClick={() => handleDeleteRole(r.id)}
                  className="text-red-600 flex items-center gap-1 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <form onSubmit={handleCreateRole} className="space-y-2 border-t border-slate-100 pt-3">
            <Input
              required
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="New role name"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {Object.values(PERMISSIONS).map((permission) => (
                <label key={permission} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={newRolePermissions.includes(permission)}
                    onChange={() => toggleRolePermission(permission)}
                  />
                  {PERMISSION_LABELS[permission]}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={createRoleMutation.isPending}>
              <Plus className="w-4 h-4 inline mr-1" /> Create role
            </Button>
          </form>
        )}
      </Card>

      {/* Departments */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Departments</h2>
        <ul className="space-y-2 mb-3">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{d.name}</span>
              {canManage && (
                <button
                  onClick={() => deleteDepartmentMutation.mutate(d.id)}
                  className="text-red-600 flex items-center gap-1 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </li>
          ))}
          {departments.length === 0 && <EmptyState label="No departments yet." />}
        </ul>
        {canManage && (
          <form onSubmit={handleCreateDepartment} className="flex gap-2">
            <Input
              required
              value={newDepartmentName}
              onChange={(e) => setNewDepartmentName(e.target.value)}
              placeholder="New department"
            />
            <Button type="submit" disabled={createDepartmentMutation.isPending}>
              Add
            </Button>
          </form>
        )}
      </Card>

      {/* Teams */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Teams</h2>
        <ul className="space-y-2 mb-3">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{t.name}</span>
              {canManage && (
                <button
                  onClick={() => deleteTeamMutation.mutate(t.id)}
                  className="text-red-600 flex items-center gap-1 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </li>
          ))}
          {teams.length === 0 && <EmptyState label="No teams yet." />}
        </ul>
        {canManage && (
          <form onSubmit={handleCreateTeam} className="space-y-2">
            <Input
              required
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="New team"
            />
            <select
              value={newTeamDepartmentId}
              onChange={(e) => setNewTeamDepartmentId(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={createTeamMutation.isPending}>
              Add team
            </Button>
          </form>
        )}
      </Card>

      {/* Invite */}
      {canManage && (
        <Card>
          <h2 className="font-semibold text-slate-900 mb-3">Invite to this organization</h2>
          <form onSubmit={handleInvite} className="space-y-2 max-w-sm">
            <Input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="someone@example.com"
            />
            <select
              required
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Choose a role
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={createInvitationMutation.isPending}>
              {createInvitationMutation.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
