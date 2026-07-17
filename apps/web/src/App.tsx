// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Per your usual style guide: "App.jsx has ONLY routes." As of Day 2, that's
// exactly what this file is - a URL-to-page map, nothing else. All the
// actual logic now lives in src/Pages/*.
//
// (Day 1's version of this file was a temporary test screen that called
// the health check directly - that job is done now, so it's gone.)
// ============================================================================

import { Routes, Route, Navigate } from "react-router-dom";
import RegisterPage from "./Pages/RegisterPage";
import LoginPage from "./Pages/LoginPage";
import VerifyEmailPage from "./Pages/VerifyEmailPage";
import DashboardPage from "./Pages/DashboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      {/* Anything unmatched just goes back to the register page for now -
          real 404 handling can come later once there's a real app shell. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
