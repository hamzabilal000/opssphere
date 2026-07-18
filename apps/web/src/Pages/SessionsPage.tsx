// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// "Where you're logged in" - the same feature Day 3 built and Day 5's
// DashboardPage displayed inline. Now its own page, rebuilt on TanStack
// Query.
// ============================================================================

import { Monitor } from "lucide-react";
import { useSessionsQuery, useRevokeSessionMutation, useRevokeOtherSessionsMutation } from "../lib/queries";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { LoadingState, EmptyState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

export default function SessionsPage() {
  const { data, isLoading } = useSessionsQuery();
  const revokeMutation = useRevokeSessionMutation();
  const revokeOthersMutation = useRevokeOtherSessionsMutation();
  const { toast } = useToast();

  const sessions = data?.sessions ?? [];

  async function handleRevoke(id: string) {
    await revokeMutation.mutateAsync(id);
    toast("Session revoked.");
  }

  async function handleRevokeOthers() {
    await revokeOthersMutation.mutateAsync();
    toast("All other sessions were logged out.");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
        <p className="text-slate-500 text-sm">Every device with an active refresh token.</p>
      </div>

      <Card>
        {isLoading && <LoadingState />}
        {!isLoading && sessions.length === 0 && <EmptyState label="No active sessions found." />}

        <ul className="space-y-2 mb-4">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="border border-slate-200 rounded-md p-3 text-sm flex items-start justify-between gap-2"
            >
              <div className="flex items-start gap-2">
                <Monitor className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-700">
                    {s.isCurrent ? "This device" : s.userAgent ?? "Unknown device"}
                  </p>
                  <p className="text-xs text-slate-400">IP: {s.ipAddress ?? "unknown"}</p>
                  <p className="text-xs text-slate-400">
                    Last used: {new Date(s.lastUsedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {!s.isCurrent && (
                <Button variant="danger" onClick={() => handleRevoke(s.id)} className="shrink-0">
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>

        <Button variant="secondary" onClick={handleRevokeOthers} className="w-full">
          Log out all other devices
        </Button>
      </Card>
    </div>
  );
}
