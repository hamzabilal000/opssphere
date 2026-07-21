// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Two steps on one page:
//   1. On load, fetch a PREVIEW of the invitation (email + expiry, and as
//      of DAY 15, whether that email already has an OpsSphere account).
//   2. What happens next depends on that ONE flag:
//      - accountExists === false: unchanged since Day 3/5 - pick a
//        password, acceptInvitation() creates the account AND logs them in.
//      - accountExists === true: DAY 15's new path. No password field at
//        all - instead we check (via useMeQuery, the same hook every
//        other page uses to know who's logged in) whether the CURRENT
//        session already belongs to that exact email. If so, one button
//        calls acceptInvitationAsExisting() to just add the Membership. If
//        not (or nobody's logged in), the page tells them to log in as
//        that email first, then come back to this same link - the token
//        isn't consumed by a preview, so revisiting it is always safe.
//
// NOTE ON WHY THIS ONE DOESN'T NEED THE useRef GUARD from VerifyEmailPage:
// that page's bug happened because verifying a token CONSUMES it (calling
// it twice makes the second call fail). Fetching a PREVIEW here doesn't
// consume anything - it's just a read - so React StrictMode calling it
// twice in development is harmless (it just fetches the same data twice).
// ============================================================================

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getInvitationPreview, acceptInvitation, acceptInvitationAsExisting } from "../lib/api";
import { useMeQuery } from "../lib/queries";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState } from "../components/ui/States";

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const meQuery = useMeQuery();

  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [email, setEmail] = useState<string | null>(null);
  // DAY 5: only set for an org-scoped invitation - a plain Day-3-style
  // invitation leaves these both undefined/null, and the page just shows
  // the generic "setting up an account" message below.
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  // DAY 15: decides which of the two acceptance flows below gets shown.
  const [accountExists, setAccountExists] = useState(false);
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
        setAccountExists(preview.accountExists);
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

  // DAY 15: the "join a second org with my existing login" button.
  async function handleAcceptAsExisting() {
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await acceptInvitationAsExisting(token);
      navigate("/dashboard");
    } catch (err) {
      setSubmitError((err as Error).message);
      setSubmitting(false);
    }
  }

  // Is the person currently sitting on this page ALREADY logged in as the
  // exact account this invitation was sent to? Case-insensitive, matching
  // the backend's own comparison in acceptInvitationAsExistingUser.
  const loggedInAsInvitee =
    Boolean(meQuery.data) && meQuery.data?.user.email.toLowerCase() === email?.toLowerCase();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Accept your invitation</h1>

        {previewStatus === "loading" && <LoadingState label="Loading invitation…" />}

        {previewStatus === "error" && <p className="text-red-600 text-sm">{previewError}</p>}

        {/* DAY 15: an email that's brand new to OpsSphere still goes through
            the ORIGINAL Day 3/5 flow - pick a password, create the account. */}
        {previewStatus === "ready" && !accountExists && (
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
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-2"
              />

              {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </>
        )}

        {/* DAY 15: an email that ALREADY has an account joins a SECOND
            organization instead - no password, just "are you logged in as
            that account right now?" */}
        {previewStatus === "ready" && accountExists && (
          <>
            <p className="text-slate-500 mb-6 text-sm">
              <span className="font-medium text-slate-700">{email}</span> already has an OpsSphere
              account.
              {organizationName && (
                <>
                  {" "}
                  This invitation adds it to{" "}
                  <span className="font-medium text-slate-700">{organizationName}</span> as{" "}
                  <span className="font-medium text-slate-700">{roleName}</span>.
                </>
              )}
            </p>

            {meQuery.isLoading ? (
              <LoadingState label="Checking your session…" />
            ) : loggedInAsInvitee ? (
              <>
                {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}
                <Button onClick={handleAcceptAsExisting} disabled={submitting} className="w-full">
                  {submitting ? "Joining…" : `Join${organizationName ? ` ${organizationName}` : ""}`}
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                {meQuery.data
                  ? "You're logged in as a different account. Log out, log back in as " +
                    email +
                    ", then open this invitation link again."
                  : "Log in as " + email + ", then open this invitation link again to accept it."}{" "}
                <a href="/login" className="text-brand-blue underline">
                  Go to login
                </a>
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
