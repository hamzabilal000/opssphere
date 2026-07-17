// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The page you land on after logging in. It calls the protected
// GET /api/v1/auth/me endpoint (protected meaning: the backend's
// `requireAuth` middleware checks your login cookie before answering).
// If that call fails (no cookie / expired session), we bounce back to the
// login page automatically instead of showing a broken screen.
// ============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, logoutUser } from "../lib/api";
import type { AuthUser } from "@opssphere/shared-types";

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  async function handleLogout() {
    await logoutUser();
    navigate("/login");
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
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
    </div>
  );
}
