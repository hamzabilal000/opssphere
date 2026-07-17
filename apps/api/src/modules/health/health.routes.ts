// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the same idea as a route file in your other projects
// (e.g. teacher.route.js), just using Express's Router the same way you
// already know: `router.get(...)`, then `module.exports` at the bottom
// (written here as `export` since this project uses the newer import/export
// syntax instead of require/module.exports).
//
// Two endpoints, on purpose:
//   /live  -> "is the server process even running?"          (no database check)
//   /ready -> "can the server actually handle real requests?" (checks MongoDB)
// ============================================================================

import { Router } from "express";
import mongoose from "mongoose";

// TYPESCRIPT NOTE: `import type { ApiSuccessResponse, HealthStatus } from "..."`
// These are TYPE-ONLY imports — they describe the SHAPE of the JSON we're
// about to send back (see packages/shared-types/src/index.ts), purely so
// your editor can warn you if you typo a field name below. They vanish
// completely when this file is compiled to plain JavaScript.
import type { ApiSuccessResponse, HealthStatus } from "@opssphere/shared-types";

// Same as `const router = express.Router()` in your other projects.
export const healthRouter = Router();

// GET /api/v1/health/live
healthRouter.get("/live", (_req, res) => {
  // TYPESCRIPT NOTE: `const body: ApiSuccessResponse<HealthStatus> = { ... }`
  // The `<HealthStatus>` part is called a "generic" — think of
  // ApiSuccessResponse as a reusable template that says "success: true,
  // plus a data field," and `<HealthStatus>` fills in "and specifically,
  // `data` will be shaped like a HealthStatus object." This just means:
  // if you accidentally forget a field HealthStatus requires (like
  // `status` or `timestamp`), TypeScript will underline it in red before
  // you even run the code.
  const body: ApiSuccessResponse<HealthStatus> = {
    success: true,
    data: {
      status: "ok",
      service: "opssphere-api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
  res.status(200).json(body);
});

// GET /api/v1/health/ready
healthRouter.get("/ready", (_req, res) => {
  // mongoose.connection.readyState is a number Mongoose maintains for us:
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting.
  // We only consider the app "ready" when it's exactly 1 (fully connected).
  const dbReady = mongoose.connection.readyState === 1;

  const body: ApiSuccessResponse<HealthStatus> = {
    success: true,
    data: {
      status: dbReady ? "ok" : "degraded",
      service: "opssphere-api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
  // If the database isn't ready, we deliberately send HTTP 503
  // ("Service Unavailable") instead of 200, so automated monitoring tools
  // (and Docker) can tell something's wrong just from the status code.
  res.status(dbReady ? 200 : 503).json(body);
});
