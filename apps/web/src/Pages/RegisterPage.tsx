// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A simple registration form: email + password, submit, show a message
// telling the user to check their email. Deliberately plain — no styling
// polish yet (that's Day 6, "Frontend App Shell").
//
// A NOTE ON STYLE: your usual pattern uses `useRef` for form inputs. This
// page uses `useState` instead, on purpose — it makes it much easier to
// show a specific error message under a specific field (e.g. "Password
// must be at least 8 characters" right under the password box), which
// matters more here because our validation rules come from a shared Zod
// schema with several possible messages. Both approaches are valid React;
// this is a case where we've deviated from your usual style for a good
// practical reason.
// ============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { registerUser } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function RegisterPage() {
  // Same idea as `let [state, setState] = useState()` in your other
  // projects — just with `const` (the modern convention) instead of `let`.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  // TYPESCRIPT NOTE: `useState<"idle" | "loading" | "success">("idle")` —
  // the `<...>` here tells useState "this piece of state can ONLY ever be
  // one of these three exact strings," instead of TypeScript assuming it
  // could be any string. That means a typo like `setStatus("loding")`
  // would get caught immediately by your editor.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // stops the browser's default "reload the page" form behavior
    setStatus("loading");
    setError(null);

    try {
      await registerUser({ email, password });
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      setError((err as Error).message);
    }
  }

  // Once registration succeeds, just show a message instead of the form —
  // simpler than redirecting somewhere, since there's nothing to log into
  // yet (the user still needs to verify their email first).
  if (status === "success") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-500">
            We sent a verification link to <b>{email}</b>. Open{" "}
            <a className="text-brand-blue underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
              Mailpit
            </a>{" "}
            to find it (that's our fake local inbox for development).
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8">
        <form onSubmit={handleSubmit}>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
          <p className="text-slate-500 mb-6 text-sm">OpsSphere</p>

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
            placeholder="At least 8 characters"
          />

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <Button type="submit" disabled={status === "loading"} className="w-full">
            {status === "loading" ? "Creating account…" : "Create account"}
          </Button>

          <p className="text-sm text-slate-500 mt-4 text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-blue underline">
              Log in
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
