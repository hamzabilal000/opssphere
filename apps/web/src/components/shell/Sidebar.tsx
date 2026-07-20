// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The dark navy column down the left side of every page inside the app
// shell: navigation links, plus the organization switcher the Day 6 plan
// calls for. "Role-aware" here means the Organization link shows your role
// in whichever org is currently selected, and the switcher itself is just
// picking from the list of orgs you're actually a member of (nothing here
// is ever a source of truth for permissions - that's still 100% the
// backend, see Day 5's tenant.middleware.ts).
// ============================================================================

import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, FolderKanban, LifeBuoy, Monitor, UserCircle, ChevronDown } from "lucide-react";
import { useOrganizationsQuery } from "../../lib/queries";
import { useActiveOrgStore } from "../../store/activeOrgStore";

const NAV_LINK_BASE =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-slate-300 hover:bg-white/10 hover:text-white";
const NAV_LINK_ACTIVE = "bg-white/10 text-white font-medium";

export function Sidebar() {
  const { data, isLoading } = useOrganizationsQuery();
  const organizations = data?.organizations ?? [];
  const { activeOrganizationId, setActiveOrganizationId } = useActiveOrgStore();

  // If nothing is selected yet (first visit, or the previously-selected
  // org somehow isn't in the list anymore), default to the first org once
  // the list loads - a switcher with nothing selected isn't very useful.
  useEffect(() => {
    if (organizations.length === 0) return;
    const stillValid = organizations.some((org) => org.id === activeOrganizationId);
    if (!activeOrganizationId || !stillValid) {
      setActiveOrganizationId(organizations[0]?.id ?? null);
    }
  }, [organizations, activeOrganizationId, setActiveOrganizationId]);

  const activeOrg = organizations.find((org) => org.id === activeOrganizationId);

  return (
    <aside className="w-64 shrink-0 bg-brand text-white flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-white/10">
        <p className="text-lg font-bold tracking-tight">OpsSphere</p>
        <p className="text-xs text-slate-400">Day 6 — App Shell</p>
      </div>

      {/* Organization switcher */}
      <div className="px-4 py-4 border-b border-white/10">
        <label className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">
          Organization
        </label>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : organizations.length === 0 ? (
          <p className="text-sm text-slate-400">None yet</p>
        ) : (
          <div className="relative">
            <select
              value={activeOrganizationId ?? ""}
              onChange={(e) => setActiveOrganizationId(e.target.value)}
              className="w-full appearance-none bg-white/10 text-white text-sm rounded-md pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id} className="text-slate-900">
                  {org.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300" />
          </div>
        )}
        {activeOrg && <p className="text-xs text-slate-400 mt-1">Your role: {activeOrg.myRole}</p>}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        <NavLink
          to="/dashboard"
          end
          className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Overview
        </NavLink>

        {activeOrganizationId && (
          <NavLink
            to={`/dashboard/organizations/${activeOrganizationId}`}
            end
            className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
          >
            <Building2 className="w-4 h-4" />
            Organization
          </NavLink>
        )}

        {activeOrganizationId && (
          <NavLink
            to={`/dashboard/organizations/${activeOrganizationId}/projects`}
            className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
          >
            <FolderKanban className="w-4 h-4" />
            Projects
          </NavLink>
        )}

        {/* DAY 10: org-level, same nesting depth as Projects above - not
            under any one project. This is also the first nav link every
            "Member"-role user actually has something of their own to do
            with (file a ticket) - see the Day 10 learning note. */}
        {activeOrganizationId && (
          <NavLink
            to={`/dashboard/organizations/${activeOrganizationId}/tickets`}
            className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
          >
            <LifeBuoy className="w-4 h-4" />
            Tickets
          </NavLink>
        )}

        <NavLink
          to="/dashboard/sessions"
          className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
        >
          <Monitor className="w-4 h-4" />
          Sessions
        </NavLink>

        <NavLink
          to="/dashboard/profile"
          className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
        >
          <UserCircle className="w-4 h-4" />
          Profile
        </NavLink>
      </nav>
    </aside>
  );
}
