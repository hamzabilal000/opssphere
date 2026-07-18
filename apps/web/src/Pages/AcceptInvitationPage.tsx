// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Two steps on one page:
//   1. On load, fetch a PREVIEW of the invitation (just the email + expiry)
//      so we can show "You're accepting an invite for bob@example.com"
//      before asking for a password.
//   2. Once the user picks a password and submits, call acceptInvitation -
//      which creates their account AND logs them in immediately (see
//      auth.service.ts's acceptInvitation - it returns tokens just like a
//      normal login would).
//
// NOTE ON WHY THIS ONE DOESN'T NEED THE useRef GUARD from VerifyEmailPage:
// that page's bug happened because verifying a token CONSUMES it (calling
// it twice makes the second call fail). Fetching a PREVIEW here doesn't
// consume anything - it's just a read - so React StrictMode calling it
// twice in development is harmless (it just fetches the same data twice).
// ============================================================================

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getInvitationPreview, acceptInvitation } from "../lib/api";

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [email, setEmail] = useState<string | null>(null);
  // DAY 5: only set for an org-scoped invitation - a plain Day-3-style
  // invitation leaves these both undefined/null, and the page just shows
  // the generic "setting up an account" message below.
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setPreviewStatus("error");
      setPreviewError("No invitation token found in the link.");
      return;
    }
    getInvitationPreview(token)
      .then((preview) => {
        setEmail(preview.email);
        setOrganizationName(preview.organizationName ?? null);
        setRoleName(preview.roleName ?? null);
        setPreviewStatus("ready");
      })
      .catch((err) => {
        setPreviewError((err as Error).message);
        setPreviewStatus("error");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await acceptInvitation(token, password);
      navigate("/dashboard");
    } catch (err) {
      setSubmitError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Accept your invitation</h1>

        {previewStatus === "loading" && <p className="text-slate-400 text-sm">Loading invitation…</p>}

        {previewStatus === "error" && <p className="text-red-600 text-sm">{previewError}</p>}

        {previewStatus === "ready" && (
          <>
            <p className="text-slate-500 mb-6 text-sm">
              Setting up an account for <span className="font-medium text-slate-700">{email}</span>
              {organizationName && (
                <>
                  {" "}
                  to join <span className="font-medium text-slate-700">{organizationName}</span> as{" "}
                  <span className="font-medium text-slate-700">{roleName}</span>
                </>
              )}
              . Choose a password to finish.
            </p>

            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
              />

              {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
