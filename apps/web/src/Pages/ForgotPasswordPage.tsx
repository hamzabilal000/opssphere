// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A simple form: type your email, submit, get a message telling you to
// check your inbox. Same shape as LoginPage - the only interesting part is
// that we show the SAME success message no matter what the backend
// actually did (see the big comment in the backend's forgotPassword
// function for why: it stops this form from being usable to guess which
// emails have accounts).
// ============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // We deliberately don't wrap this in try/catch to show a DIFFERENT
    // message on failure - the backend's forgotPassword always resolves
    // successfully (it never throws for "email not found"), so the only
    // way this could reject is a real network/server problem, which is
    // rare enough that always showing the same success screen is fine.
    await forgotPassword({ email }).catch(() => {
      // Even on an unexpected error, we still show the same neutral
      // screen - see comment above.
    });
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Forgot your password?</h1>
        <p className="text-slate-500 mb-6 text-sm">
          Enter your email and we'll send you a link to reset it.
        </p>

        {submitted ? (
          <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-4">
            If an account with that email exists, a reset link has been sent. Check your inbox
            (in development, that's Mailpit at{" "}
            <a href="http://localhost:8025" className="text-blue-600 underline">
              localhost:8025
            </a>
            ).
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
              placeholder="you@example.com"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-sm text-slate-500 mt-4 text-center">
          <Link to="/login" className="text-blue-600 underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
