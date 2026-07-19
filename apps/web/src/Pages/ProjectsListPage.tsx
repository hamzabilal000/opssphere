// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Every project in the currently-viewed organization, plus a form to
// create a new one. The Day 7 acceptance test is basically this page: "a
// manager creates a project, adds two members, and sees it appear
// correctly on the projects list."
// ============================================================================

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";
import { useOrganizationQuery, useProjectsQuery, useCreateProjectMutation } from "../lib/queries";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal-50 text-teal-700 border-teal-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function ProjectsListPage() {
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const orgQuery = useOrganizationQuery(organizationId);
  const projectsQuery = useProjectsQuery(organizationId);
  const createProjectMutation = useCreateProjectMutation(organizationId);
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Same frontend-only convenience as the Organization page - see Day 5's
  // learning note for why this is fine (the backend's requirePermission
  // is what actually enforces project.create).
  const canManage = orgQuery.data?.organization.myRole !== "Member";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const result = await createProjectMutation.mutateAsync({ name, description });
      setName("");
      setDescription("");
      toast(`${result.project.name} created.`);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <p className="text-slate-500 text-sm">{orgQuery.data?.organization.name}</p>
      </div>

      {projectsQuery.isLoading && <LoadingState label="Loading projects…" />}
      {projectsQuery.isError && <ErrorState label="Couldn't load projects." />}

      {!projectsQuery.isLoading && !projectsQuery.isError && (
        <>
          {(projectsQuery.data?.projects.length ?? 0) === 0 ? (
            <EmptyState label="No projects yet - create one below." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projectsQuery.data?.projects.map((project) => (
                <Link key={project.id} to={`/dashboard/organizations/${organizationId}/projects/${project.id}`}>
                  <Card className="hover:border-brand-teal transition-colors h-full">
                    <div className="flex items-start gap-3">
                      <FolderKanban className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-900 truncate">{project.name}</p>
                          <span
                            className={`text-[11px] border rounded-full px-2 py-0.5 shrink-0 ${STATUS_BADGE[project.status]}`}
                          >
                            {project.status}
                          </span>
                        </div>
                        {project.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{project.description}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          {project.memberCount} member{project.memberCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {canManage && (
        <Card className="max-w-sm">
          <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Create a new project
          </p>
          <form onSubmit={handleCreate} className="space-y-2">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <Button type="submit" disabled={createProjectMutation.isPending} className="w-full">
              {createProjectMutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
