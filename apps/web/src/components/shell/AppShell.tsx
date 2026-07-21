// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The layout every logged-in page shares: Sidebar on the left, Topbar
// across the top, and whichever page is actually active rendered in the
// middle (via <Outlet />, same nested-routing idea as ProtectedRoute.tsx).
// This is what the Day 6 plan means by "app shell" - previously (Days 2-5)
// every page was its own full-screen, centered box with no shared
// structure at all.
// ============================================================================

import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette"; // DAY 17: Cmd/Ctrl+K quick navigation

export function AppShell() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      {/* Mounted once, here - renders nothing until Cmd/Ctrl+K is pressed. */}
      <CommandPalette />
    </div>
  );
}
