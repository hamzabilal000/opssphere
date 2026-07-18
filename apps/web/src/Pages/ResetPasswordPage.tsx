// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Reads the `?token=...` from the URL (the same link sent by the forgot-
// password email), lets the user type a new password, and submits both to
// the backend. On success, sends them to /login to sign in with the new
// password (we don't auto-login here - resetting a password is exactly the
// kind of action where the user re-typing it into a fresh log-in form is a
// good, safe confirmation step).
// ============================================================================

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("No reset token found in the link.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await resetPassword({ token, password });
      navigate("/login");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Choose a new password</h1>
        <p className="text-slate-500 mb-6 text-sm">
          This will replace your old password immediately. You'll be logged out of every device.
        </p>

        {!token && (
          <p className="text-red-600 text-sm mb-4">
            No reset token found in the link. Please use the link from your email.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
          />

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Resetting…" : "Reset password"}
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-4 text-center">
          <Link to="/login" className="text-blue-600 underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
