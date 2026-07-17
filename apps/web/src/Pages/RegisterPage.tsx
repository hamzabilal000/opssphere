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
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-500">
            We sent a verification link to <b>{email}</b>. Open{" "}
            <a className="text-blue-600 underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
              Mailpit
            </a>{" "}
            to find it (that's our fake local inbox for development).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8"
      >
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
        <p className="text-slate-500 mb-6 text-sm">Day 2 — Authentication Core</p>

        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
          placeholder="you@example.com"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
          placeholder="At least 8 characters"
        />

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
        >
          {status === "loading" ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm text-slate-500 mt-4 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
