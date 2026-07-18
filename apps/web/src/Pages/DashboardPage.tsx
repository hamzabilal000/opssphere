// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The page you land on after logging in. It calls the protected
// GET /api/v1/auth/me endpoint (protected meaning: the backend's
// `requireAuth` middleware checks your login cookie before answering).
// If that call fails (no cookie / expired session), we bounce back to the
// login page automatically instead of showing a broken screen.
//
// DAY 3 ADDITIONS: this page now also shows your active sessions ("where
// you're logged in") with revoke buttons, and a small form to invite
// someone new by email. Still deliberately plain-looking - see the Day 2
// learning note for why (real design work is Day 6).
// ============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMe,
  logoutUser,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  createInvitation,
  listOrganizations,
  createOrganization,
  listOrganizationMembers,
} from "../lib/api";
import type { AuthUser, SessionSummary, OrganizationSummary, MembershipSummary } from "@opssphere/shared-types";

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgCreating, setOrgCreating] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Which org's member list is currently expanded, plus a simple cache so
  // re-expanding the same org doesn't re-fetch every time.
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [membersByOrgId, setMembersByOrgId] = useState<Record<string, MembershipSummary[]>>({});
  const [membersLoading, setMembersLoading] = useState(false);

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSending(true);
    setInviteStatus(null);
    try {
      await createInvitation({ email: inviteEmail });
      setInviteStatus(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail("");
    } catch (err) {
      setInviteStatus((err as Error).message);
    } finally {
      setInviteSending(false);
    }
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

  async function handleToggleMembers(organizationId: string) {
    if (expandedOrgId === organizationId) {
      setExpandedOrgId(null);
      return;
    }
    setExpandedOrgId(organizationId);
    if (membersByOrgId[organizationId]) return; // already cached, no need to re-fetch

    setMembersLoading(true);
    const res = await listOrganizationMembers(organizationId).catch(() => ({
      members: [] as MembershipSummary[],
    }));
    setMembersByOrgId((prev) => ({ ...prev, [organizationId]: res.members }));
    setMembersLoading(false);
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

      {/* DAY 4: organizations */}
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
            {organizations.map((org) => (
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
                    onClick={() => handleToggleMembers(org.id)}
                    className="shrink-0 text-slate-700 border border-slate-300 rounded px-2 py-1"
                  >
                    {expandedOrgId === org.id ? "Hide members" : "View members"}
                  </button>
                </div>

                {expandedOrgId === org.id && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    {membersLoading && !membersByOrgId[org.id] ? (
                      <p className="text-slate-400">Loading members…</p>
                    ) : (
                      <ul className="space-y-1">
                        {(membersByOrgId[org.id] ?? []).map((m) => (
                          <li key={m.id} className="text-slate-600">
                            {m.email} — {m.role}
                            {m.status === "suspended" ? " (suspended)" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
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

      {/* DAY 3: invite someone */}
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Invite someone</h2>
        <p className="text-slate-500 mb-4 text-sm">
          They'll get an email with a link to create their own account.
        </p>

        <form onSubmit={handleInvite}>
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="someone@example.com"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-3 text-sm"
          />
          <button
            type="submit"
            disabled={inviteSending}
            className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {inviteSending ? "Sending…" : "Send invitation"}
          </button>
        </form>

        {inviteStatus && <p className="text-sm text-slate-600 mt-3">{inviteStatus}</p>}
      </div>
    </div>
  );
}
