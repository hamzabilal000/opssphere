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
import { getMe, logoutUser, listSessions, revokeSession, revokeOtherSessions, createInvitation } from "../lib/api";
import type { AuthUser, SessionSummary } from "@opssphere/shared-types";

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
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
