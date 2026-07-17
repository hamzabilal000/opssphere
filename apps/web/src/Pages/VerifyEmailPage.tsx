// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the page the link inside the verification email points to:
//     http://localhost:5173/verify-email?token=abc123...
// The moment this page loads, it reads that "?token=..." part of the URL
// and immediately calls the backend to confirm it, without the user having
// to click anything else.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../lib/api";

export default function VerifyEmailPage() {
  // useSearchParams is react-router's way of reading ?query=params from the
  // current URL - same concept as reading req.query on the backend, just
  // on the frontend side.
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  // ----------------------------------------------------------------------
  // WHY THIS REF EXISTS (a real bug this project hit, worth understanding):
  // ----------------------------------------------------------------------
  // In development, React's <StrictMode> (see main.tsx) deliberately runs
  // every effect TWICE on purpose - it's an intentional stress-test to
  // help you catch effects that aren't safe to run more than once. Our
  // verification call is exactly that kind of effect: the token is
  // "used up" the first time it succeeds (same idea as a one-time password
  // reset link), so calling it a second time with the same token correctly
  // fails - and since that second, failing call finishes last, it was
  // overwriting our success message on screen.
  //
  // `hasRunRef` is a value that survives between renders WITHOUT causing a
  // re-render itself (that's what useRef is for, vs. useState). We flip it
  // to `true` the first time the effect actually runs its logic, and skip
  // running it again if it's already true - so StrictMode's intentional
  // double-call becomes harmless.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return; // StrictMode's 2nd call - do nothing
    hasRunRef.current = true;

    if (!token) {
      setStatus("error");
      setError("No verification token found in the link.");
      return;
    }

    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError((err as Error).message);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center">
        {status === "checking" && <p className="text-slate-400">Verifying your email…</p>}

        {status === "success" && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Email verified</h1>
            <p className="text-slate-500 mb-6">Your account is ready. You can log in now.</p>
            <Link to="/login" className="text-blue-600 underline text-sm">
              Go to login
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Verification failed</h1>
            <p className="text-red-600 text-sm">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
