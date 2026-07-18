// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The page you land on after logging in. It calls the protected
// GET /api/v1/auth/me endpoint (protected meaning: the backend's
// `requireAuth` middleware checks your login cookie before answering).
// If that call fails (no cookie / expired session), we bounce back to the
// login page automatically instead of showing a broken screen.
//
// DAY 5 ADDITIONS: expanding an organization now also shows its roles,
// departments, and teams, lets you create a custom role and assign it to a
// member, and replaces the old "invite anyone, anywhere" form with an
// org-scoped one (pick a role for the invitee). Still deliberately
// plain-looking - see the Day 2 learning note for why (real design work is
// Day 6).
// ============================================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMe,
  logoutUser,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  listOrganizations,
  createOrganization,
  listOrganizationMembers,
  listRoles,
  createRole,
  deleteRole,
  listDepartments,
  createDepartment,
  deleteDepartment,
  listTeams,
  createTeam,
  deleteTeam,
  updateMemberRole,
  createOrgInvitation,
} from "../lib/api";
import { PERMISSIONS } from "@opssphere/shared-types";
import type {
  AuthUser,
  SessionSummary,
  OrganizationSummary,
  MembershipSummary,
  RoleSummary,
  DepartmentSummary,
  TeamSummary,
  Permission,
} from "@opssphere/shared-types";

// A friendly label for each permission string, just for this form - the
// permission STRING itself (e.g. "role.manage") is what actually gets sent
// to the backend; this map only controls what a human reads next to the
// checkbox.
const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.ORG_MANAGE]: "Manage organization settings",
  [PERMISSIONS.MEMBER_INVITE]: "Invite members",
  [PERMISSIONS.MEMBER_REMOVE]: "Remove members",
  [PERMISSIONS.MEMBER_ROLE_UPDATE]: "Change member roles",
  [PERMISSIONS.ROLE_MANAGE]: "Manage roles",
  [PERMISSIONS.DEPARTMENT_MANAGE]: "Manage departments",
  [PERMISSIONS.TEAM_MANAGE]: "Manage teams",
  [PERMISSIONS.PROJECT_CREATE]: "Create projects (reserved for a later day)",
  [PERMISSIONS.TICKET_ASSIGN]: "Assign tickets (reserved for a later day)",
};

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgCreating, setOrgCreating] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Which org's detail panel is currently open, plus caches (keyed by org
  // id) for everything that panel shows - members, roles, departments,
  // teams - so re-opening the same org doesn't re-fetch every time.
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [membersByOrgId, setMembersByOrgId] = useState<Record<string, MembershipSummary[]>>({});
  const [rolesByOrgId, setRolesByOrgId] = useState<Record<string, RoleSummary[]>>({});
  const [departmentsByOrgId, setDepartmentsByOrgId] = useState<Record<string, DepartmentSummary[]>>({});
  const [teamsByOrgId, setTeamsByOrgId] = useState<Record<string, TeamSummary[]>>({});

  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<Permission[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDepartmentId, setNewTeamDepartmentId] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => {
        // Not logged in (or session expired) - send them back to /login.
        // This is the frontend equivalent of the backend's
        // AUTHENTICATION_REQUIRED error from requireAuth.
        navigate("/login");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // Load the sessions list separately - if THIS call fails, we don't
  // bounce to /login (a failure here shouldn't lock the user out of a page
  // they're otherwise validly logged into) - we just show an empty list.
  useEffect(() => {
    listSessions()
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  // DAY 4: load "your organizations" the same way - independently, so a
  // failure here doesn't block the rest of the dashboard either.
  useEffect(() => {
    refreshOrganizations().finally(() => setOrgsLoading(false));
  }, []);

  async function refreshOrganizations() {
    const res = await listOrganizations().catch(() => ({ organizations: [] as OrganizationSummary[] }));
    setOrganizations(res.organizations);
  }

  async function refreshSessions() {
    const res = await listSessions().catch(() => ({ sessions: [] as SessionSummary[] }));
    setSessions(res.sessions);
  }

  async function handleLogout() {
    await logoutUser();
    navigate("/login");
  }

  async function handleRevoke(id: string) {
    await revokeSession(id);
    await refreshSessions();
  }

  async function handleRevokeOthers() {
    await revokeOtherSessions();
    await refreshSessions();
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgCreating(true);
    setOrgError(null);
    try {
      // TYPESCRIPT NOTE: CreateOrganizationInput is inferred from the
      // schema's OUTPUT shape (after Zod fills in defaults), so timeZone
      // and businessHours are typed as required here even though the
      // backend would happily fill them in itself if we omitted them.
      // Simplest fix: just send the same defaults explicitly from here too.
      await createOrganization({
        name: orgName,
        slug: orgSlug,
        timeZone: "UTC",
        businessHours: { start: "09:00", end: "17:00" },
      });
      setOrgName("");
      setOrgSlug("");
      await refreshOrganizations();
    } catch (err) {
      setOrgError((err as Error).message);
    } finally {
      setOrgCreating(false);
    }
  }

  // Loads (or reloads) everything the expanded org panel shows, in
  // parallel - four independent GETs, not four steps of one big one.
  async function loadOrgDetails(organizationId: string) {
    setDetailLoading(true);
    const [membersRes, rolesRes, departmentsRes, teamsRes] = await Promise.all([
      listOrganizationMembers(organizationId).catch(() => ({ members: [] as MembershipSummary[] })),
      listRoles(organizationId).catch(() => ({ roles: [] as RoleSummary[] })),
      listDepartments(organizationId).catch(() => ({ departments: [] as DepartmentSummary[] })),
      listTeams(organizationId).catch(() => ({ teams: [] as TeamSummary[] })),
    ]);
    setMembersByOrgId((prev) => ({ ...prev, [organizationId]: membersRes.members }));
    setRolesByOrgId((prev) => ({ ...prev, [organizationId]: rolesRes.roles }));
    setDepartmentsByOrgId((prev) => ({ ...prev, [organizationId]: departmentsRes.departments }));
    setTeamsByOrgId((prev) => ({ ...prev, [organizationId]: teamsRes.teams }));
    setDetailLoading(false);
  }

  function handleToggleOrg(organizationId: string) {
    if (expandedOrgId === organizationId) {
      setExpandedOrgId(null);
      return;
    }
    setExpandedOrgId(organizationId);
    setRoleError(null);
    setInviteStatus(null);
    if (!membersByOrgId[organizationId]) {
      loadOrgDetails(organizationId);
    }
  }

  function toggleRolePermission(permission: Permission) {
    setNewRolePermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  }

  async function handleCreateRole(e: React.FormEvent, organizationId: string) {
    e.preventDefault();
    setRoleError(null);
    try {
      await createRole(organizationId, { name: newRoleName, permissions: newRolePermissions });
      setNewRoleName("");
      setNewRolePermissions([]);
      await loadOrgDetails(organizationId);
    } catch (err) {
      setRoleError((err as Error).message);
    }
  }

  async function handleDeleteRole(organizationId: string, roleId: string) {
    await deleteRole(organizationId, roleId).catch((err) => setRoleError((err as Error).message));
    await loadOrgDetails(organizationId);
  }

  async function handleCreateDepartment(e: React.FormEvent, organizationId: string) {
    e.preventDefault();
    await createDepartment(organizationId, { name: newDepartmentName }).catch(() => {});
    setNewDepartmentName("");
    await loadOrgDetails(organizationId);
  }

  async function handleDeleteDepartment(organizationId: string, departmentId: string) {
    await deleteDepartment(organizationId, departmentId).catch(() => {});
    await loadOrgDetails(organizationId);
  }

  async function handleCreateTeam(e: React.FormEvent, organizationId: string) {
    e.preventDefault();
    await createTeam(organizationId, {
      name: newTeamName,
      departmentId: newTeamDepartmentId || undefined,
    }).catch(() => {});
    setNewTeamName("");
    setNewTeamDepartmentId("");
    await loadOrgDetails(organizationId);
  }

  async function handleDeleteTeam(organizationId: string, teamId: string) {
    await deleteTeam(organizationId, teamId).catch(() => {});
    await loadOrgDetails(organizationId);
  }

  async function handleChangeMemberRole(organizationId: string, membershipId: string, roleId: string) {
    await updateMemberRole(organizationId, membershipId, roleId).catch((err) =>
      setRoleError((err as Error).message)
    );
    await loadOrgDetails(organizationId);
  }

  async function handleOrgInvite(e: React.FormEvent, organizationId: string) {
    e.preventDefault();
    setInviteSending(true);
    setInviteStatus(null);
    try {
      await createOrgInvitation(organizationId, { email: inviteEmail, roleId: inviteRoleId });
      setInviteStatus(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail("");
    } catch (err) {
      setInviteStatus((err as Error).message);
    } finally {
      setInviteSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  // If we get here with no user, the redirect above is already in
  // progress - render nothing instead of a flash of broken content.
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 flex flex-col items-center gap-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome</h1>
        <p className="text-slate-500 mb-6 text-sm">
          You're logged in - this proves cookies, JWTs, and the auth middleware are all working together.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm mb-6">
          <p>
            <span className="font-semibold">Email:</span> {user.email}
          </p>
          <p>
            <span className="font-semibold">Verified:</span> {user.isEmailVerified ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-semibold">Account created:</span>{" "}
            {new Date(user.createdAt).toLocaleString()}
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium"
        >
          Log out
        </button>
      </div>

      {/* DAY 4/5: organizations */}
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Your organizations</h2>
        <p className="text-slate-500 mb-4 text-sm">
          Every company workspace you belong to. Data in one is never visible from another.
        </p>

        {orgsLoading ? (
          <p className="text-slate-400 text-sm">Loading organizations…</p>
        ) : organizations.length === 0 ? (
          <p className="text-slate-400 text-sm mb-4">You're not part of an organization yet.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {organizations.map((org) => {
              // NOTE: this is a FRONTEND-ONLY convenience, not a real
              // permission check - it just hides admin-ish controls for
              // anyone whose role is literally named "Member" so the panel
              // isn't cluttered with buttons most people can't use. The
              // REAL enforcement is 100% on the backend (requirePermission
              // in tenant.middleware.ts) - if this guess is ever wrong,
              // the backend still rejects the request with a clean 403.
              // See the SRS principle: "hiding a button on the frontend is
              // a UX nicety, never real security."
              const canManage = org.myRole !== "Member";
              const roles = rolesByOrgId[org.id] ?? [];
              const departments = departmentsByOrgId[org.id] ?? [];
              const teams = teamsByOrgId[org.id] ?? [];
              const members = membersByOrgId[org.id] ?? [];

              return (
                <li key={org.id} className="border border-slate-200 rounded-md p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-700">
                        {org.name} <span className="text-slate-400">({org.slug})</span>
                      </p>
                      <p className="text-slate-400">
                        Your role: {org.myRole} · {org.timeZone} · {org.businessHours.start}–
                        {org.businessHours.end}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleOrg(org.id)}
                      className="shrink-0 text-slate-700 border border-slate-300 rounded px-2 py-1"
                    >
                      {expandedOrgId === org.id ? "Hide details" : "View details"}
                    </button>
                  </div>

                  {expandedOrgId === org.id && (
                    <div className="mt-3 border-t border-slate-200 pt-3 space-y-4">
                      {detailLoading && members.length === 0 ? (
                        <p className="text-slate-400">Loading…</p>
                      ) : (
                        <>
                          {/* Members + role assignment */}
                          <div>
                            <p className="font-semibold text-slate-700 mb-1">Members</p>
                            <ul className="space-y-1">
                              {members.map((m) => (
                                <li key={m.id} className="flex items-center justify-between gap-2">
                                  <span className="text-slate-600">
                                    {m.email}
                                    {m.status === "suspended" ? " (suspended)" : ""}
                                  </span>
                                  {canManage ? (
                                    <select
                                      value={m.roleId}
                                      onChange={(e) => handleChangeMemberRole(org.id, m.id, e.target.value)}
                                      className="border border-slate-300 rounded px-1 py-0.5"
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
                          </div>

                          {/* Roles */}
                          <div>
                            <p className="font-semibold text-slate-700 mb-1">Roles</p>
                            <ul className="space-y-1 mb-2">
                              {roles.map((r) => (
                                <li key={r.id} className="flex items-center justify-between gap-2">
                                  <span className="text-slate-600">
                                    {r.name}
                                    {r.isSystemRole ? " (built-in)" : ""} — {r.permissions.length} permission
                                    {r.permissions.length === 1 ? "" : "s"}
                                  </span>
                                  {canManage && !r.isSystemRole && (
                                    <button
                                      onClick={() => handleDeleteRole(org.id, r.id)}
                                      className="text-red-600"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>

                            {canManage && (
                              <form onSubmit={(e) => handleCreateRole(e, org.id)} className="space-y-1">
                                <input
                                  type="text"
                                  required
                                  value={newRoleName}
                                  onChange={(e) => setNewRoleName(e.target.value)}
                                  placeholder="New role name"
                                  className="w-full border border-slate-300 rounded px-2 py-1"
                                />
                                <div className="grid grid-cols-1 gap-0.5">
                                  {Object.values(PERMISSIONS).map((permission) => (
                                    <label key={permission} className="flex items-center gap-1 text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={newRolePermissions.includes(permission)}
                                        onChange={() => toggleRolePermission(permission)}
                                      />
                                      {PERMISSION_LABELS[permission]}
                                    </label>
                                  ))}
                                </div>
                                {roleError && <p className="text-red-600">{roleError}</p>}
                                <button
                                  type="submit"
                                  className="bg-slate-900 text-white rounded px-2 py-1"
                                >
                                  Create role
                                </button>
                              </form>
                            )}
                          </div>

                          {/* Departments */}
                          <div>
                            <p className="font-semibold text-slate-700 mb-1">Departments</p>
                            <ul className="space-y-1 mb-2">
                              {departments.map((d) => (
                                <li key={d.id} className="flex items-center justify-between gap-2">
                                  <span className="text-slate-600">{d.name}</span>
                                  {canManage && (
                                    <button
                                      onClick={() => handleDeleteDepartment(org.id, d.id)}
                                      className="text-red-600"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </li>
                              ))}
                              {departments.length === 0 && <li className="text-slate-400">None yet.</li>}
                            </ul>
                            {canManage && (
                              <form
                                onSubmit={(e) => handleCreateDepartment(e, org.id)}
                                className="flex gap-1"
                              >
                                <input
                                  type="text"
                                  required
                                  value={newDepartmentName}
                                  onChange={(e) => setNewDepartmentName(e.target.value)}
                                  placeholder="New department"
                                  className="flex-1 border border-slate-300 rounded px-2 py-1"
                                />
                                <button className="bg-slate-900 text-white rounded px-2 py-1">Add</button>
                              </form>
                            )}
                          </div>

                          {/* Teams */}
                          <div>
                            <p className="font-semibold text-slate-700 mb-1">Teams</p>
                            <ul className="space-y-1 mb-2">
                              {teams.map((t) => (
                                <li key={t.id} className="flex items-center justify-between gap-2">
                                  <span className="text-slate-600">{t.name}</span>
                                  {canManage && (
                                    <button
                                      onClick={() => handleDeleteTeam(org.id, t.id)}
                                      className="text-red-600"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </li>
                              ))}
                              {teams.length === 0 && <li className="text-slate-400">None yet.</li>}
                            </ul>
                            {canManage && (
                              <form onSubmit={(e) => handleCreateTeam(e, org.id)} className="space-y-1">
                                <input
                                  type="text"
                                  required
                                  value={newTeamName}
                                  onChange={(e) => setNewTeamName(e.target.value)}
                                  placeholder="New team"
                                  className="w-full border border-slate-300 rounded px-2 py-1"
                                />
                                <select
                                  value={newTeamDepartmentId}
                                  onChange={(e) => setNewTeamDepartmentId(e.target.value)}
                                  className="w-full border border-slate-300 rounded px-2 py-1"
                                >
                                  <option value="">No department</option>
                                  {departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                                <button className="bg-slate-900 text-white rounded px-2 py-1">Add</button>
                              </form>
                            )}
                          </div>

                          {/* Org-scoped invite */}
                          {canManage && (
                            <div>
                              <p className="font-semibold text-slate-700 mb-1">Invite to this organization</p>
                              <form onSubmit={(e) => handleOrgInvite(e, org.id)} className="space-y-1">
                                <input
                                  type="email"
                                  required
                                  value={inviteEmail}
                                  onChange={(e) => setInviteEmail(e.target.value)}
                                  placeholder="someone@example.com"
                                  className="w-full border border-slate-300 rounded px-2 py-1"
                                />
                                <select
                                  required
                                  value={inviteRoleId}
                                  onChange={(e) => setInviteRoleId(e.target.value)}
                                  className="w-full border border-slate-300 rounded px-2 py-1"
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
                                <button
                                  type="submit"
                                  disabled={inviteSending}
                                  className="bg-slate-900 text-white rounded px-2 py-1 disabled:opacity-50"
                                >
                                  {inviteSending ? "Sending…" : "Send invitation"}
                                </button>
                              </form>
                              {inviteStatus && <p className="text-slate-600 mt-1">{inviteStatus}</p>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleCreateOrg} className="border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Create a new organization</p>
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
          />
          <input
            type="text"
            required
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value.toLowerCase())}
            placeholder="url-slug-like-this"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase letters, numbers, and hyphens only"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
          />

          {orgError && <p className="text-red-600 text-sm mb-2">{orgError}</p>}

          <button
            type="submit"
            disabled={orgCreating}
            className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {orgCreating ? "Creating…" : "Create organization"}
          </button>
        </form>
      </div>

      {/* DAY 3: sessions ("where you're logged in") */}
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">Where you're logged in</h2>
        </div>
        <p className="text-slate-500 mb-4 text-sm">
          Every device with an active refresh token shows up here.
        </p>

        {sessionsLoading ? (
          <p className="text-slate-400 text-sm">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-slate-400 text-sm">No active sessions found.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="border border-slate-200 rounded-md p-3 text-xs flex items-start justify-between gap-2"
              >
                <div>
                  <p className="font-medium text-slate-700">
                    {s.isCurrent ? "This device" : s.userAgent ?? "Unknown device"}
                  </p>
                  <p className="text-slate-400">IP: {s.ipAddress ?? "unknown"}</p>
                  <p className="text-slate-400">Last used: {new Date(s.lastUsedAt).toLocaleString()}</p>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => handleRevoke(s.id)}
                    className="shrink-0 text-red-600 border border-red-200 rounded px-2 py-1"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={handleRevokeOthers}
          className="w-full bg-white border border-slate-300 text-slate-700 rounded-md py-2 text-sm font-medium"
        >
          Log out all other devices
        </button>
      </div>
    </div>
  );
}
