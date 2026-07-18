// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The landing page once you're inside the app shell (the index route under
// /dashboard). Shows every organization you belong to as cards, and a form
// to create a new one - the same job Days 4-5's DashboardPage did, just
// restyled to fit the Day 6 shell and rebuilt on TanStack Query instead of
// manual useState/useEffect.
// ============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { useOrganizationsQuery, useCreateOrganizationMutation } from "../lib/queries";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";
import { useActiveOrgStore } from "../store/activeOrgStore";

export default function OverviewPage() {
  const { data, isLoading, isError } = useOrganizationsQuery();
  const createOrgMutation = useCreateOrganizationMutation();
  const { toast } = useToast();
  const setActiveOrganizationId = useActiveOrgStore((s) => s.setActiveOrganizationId);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      // Same TYPESCRIPT NOTE as Day 5's version of this form:
      // CreateOrganizationInput is inferred from the schema's OUTPUT shape
      // (after Zod fills in defaults), so timeZone/businessHours are
      // typed as required here even though the backend would happily fill
      // them in itself - simplest fix is just sending the same defaults.
      const result = await createOrgMutation.mutateAsync({
        name,
        slug,
        timeZone: "UTC",
        businessHours: { start: "09:00", end: "17:00" },
      });
      setName("");
      setSlug("");
      setActiveOrganizationId(result.organization.id);
      toast(`${result.organization.name} created.`);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-slate-500 text-sm">Every organization you belong to.</p>
      </div>

      {isLoading && <LoadingState label="Loading organizations…" />}
      {isError && <ErrorState label="Couldn't load your organizations." />}

      {!isLoading && !isError && (
        <>
          {(data?.organizations.length ?? 0) === 0 ? (
            <EmptyState label="You're not part of an organization yet - create one below." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data?.organizations.map((org) => (
                <Link
                  key={org.id}
                  to={`/dashboard/organizations/${org.id}`}
                  onClick={() => setActiveOrganizationId(org.id)}
                >
                  <Card className="hover:border-brand-teal transition-colors h-full">
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-slate-900">{org.name}</p>
                        <p className="text-xs text-slate-400">{org.slug}</p>
                        <p className="text-xs text-slate-500 mt-1">Your role: {org.myRole}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <Card className="max-w-sm">
        <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Create a new organization
        </p>
        <form onSubmit={handleCreate} className="space-y-2">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
          />
          <Input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="url-slug-like-this"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase letters, numbers, and hyphens only"
          />
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <Button type="submit" disabled={createOrgMutation.isPending} className="w-full">
            {createOrgMutation.isPending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
