// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The thin bar across the top of the app shell: who's logged in, and a way
// to log out from anywhere, not just the old Dashboard page.
//
// NOTE ON PERFORMANCE: this calls useMeQuery() too, same as
// ProtectedRoute.tsx. That's NOT a second network request - TanStack Query
// caches by queryKey ("me"), so both components share the exact same
// cached result. This is one of the things Days 2-5's manual useState
// approach didn't get for free.
// ============================================================================

import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useMeQuery, useLogoutMutation } from "../../lib/queries";
import { useToast } from "../ui/Toast";

export function Topbar() {
  const { data } = useMeQuery();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const { toast } = useToast();

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    toast("Logged out.");
    navigate("/login");
  }

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-end px-6 gap-4">
      <span className="text-sm text-slate-500">{data?.user.email}</span>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <LogOut className="w-4 h-4" />
        Log out
      </button>
    </header>
  );
}
