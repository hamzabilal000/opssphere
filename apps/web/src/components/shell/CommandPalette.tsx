// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// DAY 17 ("Polish"): press Cmd+K (Mac) or Ctrl+K (everyone else) from
// anywhere in the app to open a quick-jump search box - type a few
// letters of an organization, a project, or a static page name (Overview,
// Sessions, Profile, ...) and press Enter to go straight there instead of
// clicking through the sidebar.
//
// Mounted ONCE, in AppShell.tsx, so it's available no matter which page is
// currently showing - it manages its own open/closed state internally and
// renders nothing at all when closed (no wasted DOM, no wasted listeners
// beyond the one global keydown check).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, FolderKanban, LayoutDashboard, Monitor, UserCircle, LifeBuoy } from "lucide-react";
import { useOrganizationsQuery, useProjectsQuery } from "../../lib/queries";
import { useActiveOrgStore } from "../../store/activeOrgStore";

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  path: string;
  icon: typeof Search;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeOrganizationId } = useActiveOrgStore();
  const organizationsQuery = useOrganizationsQuery();
  // DAY 17 SCOPE: only the currently-ACTIVE organization's projects are
  // searchable, not every project across every organization - fetching
  // every org's project list just to power a search box would mean N
  // extra network requests every time this opens. Switching the active
  // organization first (via the sidebar) is the reasonable trade-off.
  const projectsQuery = useProjectsQuery(activeOrganizationId ?? "");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isOpenShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isOpenShortcut) {
        e.preventDefault();
        setIsOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus the search input the moment the palette opens - otherwise
  // someone who just pressed Cmd+K would need to click before typing.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      // A tiny delay so the input actually exists in the DOM before we
      // try to focus it (it was just conditionally rendered this instant).
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  const items: PaletteItem[] = useMemo(() => {
    const organizations = organizationsQuery.data?.organizations ?? [];
    const projects = activeOrganizationId ? (projectsQuery.data?.projects ?? []) : [];

    const staticItems: PaletteItem[] = [
      { id: "overview", label: "Overview", path: "/dashboard", icon: LayoutDashboard },
      { id: "sessions", label: "Sessions", path: "/dashboard/sessions", icon: Monitor },
      { id: "profile", label: "Profile", path: "/dashboard/profile", icon: UserCircle },
    ];

    if (activeOrganizationId) {
      staticItems.push(
        {
          id: "active-org",
          label: "Organization settings",
          path: `/dashboard/organizations/${activeOrganizationId}`,
          icon: Building2,
        },
        {
          id: "active-org-tickets",
          label: "Tickets",
          path: `/dashboard/organizations/${activeOrganizationId}/tickets`,
          icon: LifeBuoy,
        }
      );
    }

    const organizationItems: PaletteItem[] = organizations.map((org) => ({
      id: `org-${org.id}`,
      label: org.name,
      sublabel: "Organization",
      path: `/dashboard/organizations/${org.id}`,
      icon: Building2,
    }));

    const projectItems: PaletteItem[] = projects.map((project) => ({
      id: `project-${project.id}`,
      label: project.name,
      sublabel: "Project board",
      path: `/dashboard/organizations/${activeOrganizationId}/projects/${project.id}/board`,
      icon: FolderKanban,
    }));

    return [...staticItems, ...organizationItems, ...projectItems];
  }, [organizationsQuery.data, projectsQuery.data, activeOrganizationId]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  function goTo(path: string) {
    setIsOpen(false);
    navigate(path);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const first = filteredItems[0];
    if (first) goTo(first.path);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 pt-24 px-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to an organization, project, or page…"
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </form>

        <div className="max-h-80 overflow-y-auto py-1">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No matches.</p>
          ) : (
            filteredItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => goTo(item.path)}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                >
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 text-slate-800">{item.label}</span>
                  {item.sublabel && <span className="text-xs text-slate-400">{item.sublabel}</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
