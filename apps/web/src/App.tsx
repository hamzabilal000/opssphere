// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Per your usual style guide: "App.jsx has ONLY routes." As of Day 2, that's
// exactly what this file is - a URL-to-page map, nothing else. All the
// actual logic now lives in src/Pages/*.
//
// DAY 6 CHANGE: everything under /dashboard is now NESTED routes instead
// of one flat page. `<Route element={<ProtectedRoute />}>` wraps a group -
// every route inside it requires being logged in (see
// components/shell/ProtectedRoute.tsx). Inside that, `<Route path=
// "/dashboard" element={<AppShell />}>` wraps a SECOND group - every route
// inside THAT renders inside the sidebar+topbar layout (see
// components/shell/AppShell.tsx). Two independent, reusable layers,
// stacked - any future page just needs to be added as one more nested
// <Route> here to get both automatically.
// ============================================================================

import { Routes, Route, Navigate } from "react-router-dom";
import RegisterPage from "./Pages/RegisterPage";
import LoginPage from "./Pages/LoginPage";
import VerifyEmailPage from "./Pages/VerifyEmailPage";
import ForgotPasswordPage from "./Pages/ForgotPasswordPage";
import ResetPasswordPage from "./Pages/ResetPasswordPage";
import AcceptInvitationPage from "./Pages/AcceptInvitationPage";
import OverviewPage from "./Pages/OverviewPage";
import OrganizationDetailPage from "./Pages/OrganizationDetailPage";
import SessionsPage from "./Pages/SessionsPage";
import ProfilePage from "./Pages/ProfilePage";
import { ProtectedRoute } from "./components/shell/ProtectedRoute";
import { AppShell } from "./components/shell/AppShell";

export default function App() {
  return (
    <Routes>
      {/* Public routes - no login required */}
      <Route path="/" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

      {/* Everything below requires being logged in AND renders inside the
          app shell (sidebar + topbar) - see the big comment above. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="organizations/:organizationId" element={<OrganizationDetailPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* Anything unmatched just goes back to the register page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
