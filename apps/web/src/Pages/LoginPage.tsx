// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Email + password, submit, and on success navigate to the dashboard —
// same overall shape as the login pages you've built before, just using
// our shared `loginUser()` API helper instead of a direct axios.post call.
// ============================================================================

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom"; // same useNavigate you already use
import { loginUser } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await loginUser({ email, password });
      // Same idea as your usual `if (res.data.success == true) { navigate('/nextpage') }`
      // - we only get here if loginUser() DIDN'T throw, which means the
      // backend already confirmed success (see lib/api.ts's apiRequest —
      // it throws automatically whenever success is false).
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8">
        <form onSubmit={handleSubmit}>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Log in</h1>
          <p className="text-slate-500 mb-6 text-sm">Welcome back to OpsSphere</p>

          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4"
            placeholder="you@example.com"
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-2"
          />

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Logging in…" : "Log in"}
          </Button>

          <p className="text-sm text-slate-500 mt-3 text-center">
            <Link to="/forgot-password" className="text-brand-blue underline">
              Forgot your password?
            </Link>
          </p>

          <p className="text-sm text-slate-500 mt-2 text-center">
            Don't have an account?{" "}
            <Link to="/" className="text-brand-blue underline">
              Create one
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
