// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The "basic account/profile page" the Day 6 plan calls for: your account
// details, plus a link to the forgot-password flow (there's no in-app
// "change password while logged in" form yet - Day 3 only built the
// email-link based reset flow, which still works fine for this).
// ============================================================================

import { Link } from "react-router-dom";
import { useMeQuery } from "../lib/queries";
import { Card } from "../components/ui/Card";
import { LoadingState } from "../components/ui/States";

export default function ProfilePage() {
  const { data, isLoading } = useMeQuery();

  if (isLoading) return <LoadingState label="Loading profile…" />;
  if (!data) return null; // ProtectedRoute already guarantees we're logged in by the time we get here

  const { user } = data;

  return (
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-500 text-sm">Your account details.</p>
      </div>

      <Card>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-400">Email</dt>
            <dd className="text-slate-900 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Email verified</dt>
            <dd className="text-slate-900 font-medium">{user.isEmailVerified ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Account created</dt>
            <dd className="text-slate-900 font-medium">{new Date(user.createdAt).toLocaleString()}</dd>
          </div>
        </dl>

        <p className="text-sm text-slate-500 mt-4 pt-4 border-t border-slate-100">
          Want to change your password?{" "}
          <Link to="/forgot-password" className="text-brand-blue underline">
            Send yourself a reset link
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
