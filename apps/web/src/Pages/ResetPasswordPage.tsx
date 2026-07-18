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
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

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
      <Card className="max-w-md w-full p-8">
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
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-2"
          />

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <Button type="submit" disabled={loading || !token} className="w-full">
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </form>

        <p className="text-sm text-slate-500 mt-4 text-center">
          <Link to="/login" className="text-brand-blue underline">
            Back to log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
