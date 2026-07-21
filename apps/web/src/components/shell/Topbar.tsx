// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The thin bar across the top of the app shell: who's logged in, a way to
// log out from anywhere, and (DAY 17) a notifications bell.
//
// NOTE ON PERFORMANCE: this calls useMeQuery() too, same as
// ProtectedRoute.tsx. That's NOT a second network request - TanStack Query
// caches by queryKey ("me"), so both components share the exact same
// cached result. This is one of the things Days 2-5's manual useState
// approach didn't get for free.
// ============================================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMeQuery,
  useLogoutMutation,
  useNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from "../../lib/queries";
import { useNotificationSocket } from "../../lib/socket";
import { useToast } from "../ui/Toast";
import type { NotificationSummary } from "@opssphere/shared-types";

export function Topbar() {
  const { data } = useMeQuery();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsQuery = useNotificationsQuery();
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();
  const queryClient = useQueryClient();

  // DAY 17: a new notification pushed from the server (see
  // notification.service.ts's createNotification) just invalidates the
  // SAME query key useNotificationsQuery already uses - same "reuse
  // TanStack Query's existing fetch/cache/render pipeline" idea Day 9
  // established for the board, applied here to the bell badge instead.
  useNotificationSocket(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    toast("Logged out.");
    navigate("/login");
  }

  async function handleNotificationClick(notification: NotificationSummary) {
    setShowNotifications(false);
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
    navigate(notification.linkPath);
  }

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-end px-6 gap-4 relative">
      <div className="relative">
        <button
          onClick={() => setShowNotifications((v) => !v)}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <>
            {/* Click-outside-to-close backdrop - invisible, just catches clicks */}
            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
            <div
              role="dialog"
              aria-label="Notifications"
              className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="text-xs text-brand-blue hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">You're all caught up.</p>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 flex gap-2 items-start ${
                          n.isRead ? "text-slate-500" : "text-slate-900 font-medium"
                        }`}
                      >
                        {!n.isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-teal shrink-0" />}
                        <span className={n.isRead ? "ml-3.5" : ""}>
                          {n.message}
                          <span className="block text-xs text-slate-400 font-normal mt-0.5">
                            {new Date(n.createdAt).toLocaleString()}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

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
