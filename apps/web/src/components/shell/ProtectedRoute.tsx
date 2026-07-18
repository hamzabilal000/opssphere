// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Days 2-5 repeated the SAME three lines at the top of DashboardPage.tsx:
// call getMe(), if it fails navigate("/login"), otherwise render the page.
// This component pulls that pattern out ONCE, so every page that needs
// "you must be logged in to see this" can just live under it in App.tsx,
// instead of copy-pasting the same check into every new page forever.
//
// HOW IT'S USED (see App.tsx): react-router-dom lets a <Route> have no
// `path` of its own, just an `element` - any ROUTES NESTED under it only
// render if this one's `element` renders an `<Outlet />`. So wrapping a
// group of routes in `<Route element={<ProtectedRoute />}>` means ALL of
// them get this same login check, automatically, in one place.
// ============================================================================

import { Navigate, Outlet } from "react-router-dom";
import { useMeQuery } from "../../lib/queries";
import { LoadingState } from "../ui/States";

export function ProtectedRoute() {
  const { data, isLoading, isError } = useMeQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  // getMe() failing means "no valid login cookie" - same as Days 2-5's
  // manual `.catch(() => navigate("/login"))`, just centralized here now.
  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }

  // Logged in - render whatever route is actually nested inside this one.
  return <Outlet />;
}
