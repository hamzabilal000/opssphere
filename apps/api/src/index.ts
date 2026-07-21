// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the file that actually STARTS the server. It's the equivalent of
// the bottom half of your usual server/index.js:
//     mongoose.connect(...).then(() => console.log("db connected"))
//     app.listen(8080, () => console.log("Running"))
//
// We just do it in a specific ORDER on purpose: connect to the database
// FIRST, and only start accepting HTTP requests AFTER that succeeds. If the
// database can't be reached, we don't want the server pretending to be
// healthy while every request would actually fail.
// ============================================================================

import { createServer } from "node:http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { connectDatabase } from "./lib/db.js";
import { createApp } from "./app.js";
import { initSocketServer } from "./lib/socket.js";
import { ensureBucketExists } from "./lib/storage.js";

// TYPESCRIPT NOTE: `async function main() { ... }`
// Nothing TypeScript-specific here — this is exactly the async/await
// pattern you already use. We wrap the startup steps in a function called
// `main` just so we can `await` each step in order, top to bottom.
async function main() {
  // Step 1: connect to MongoDB. `await` pauses here until it either
  // succeeds or throws an error.
  await connectDatabase();

  // DAY 12: make sure our MinIO bucket exists before accepting any
  // requests - see lib/storage.ts for why this doesn't crash the server
  // the way a bad Mongo URI would (file uploads are one feature, not the
  // whole app).
  await ensureBucketExists();

  // Step 2: build the Express app (see app.ts) — routes, middleware, etc.
  const app = createApp();

  // Step 3: DAY 9 CHANGE — instead of `app.listen(...)` directly, we build
  // the plain Node http.Server ourselves first. Express's `.listen()` was
  // secretly doing exactly this the whole time (Express apps ARE just a
  // request handler function under the hood) - we just need our own
  // reference to that raw server object so Socket.IO can attach itself to
  // the SAME server and share the SAME port (see lib/socket.ts). Two
  // separate servers on two separate ports would work too, but sharing one
  // port means the frontend only ever talks to http://localhost:4000,
  // whether it's a normal fetch() call or a live socket connection.
  const httpServer = createServer(app);
  initSocketServer(httpServer);

  // Step 4: start listening for real HTTP (and now WebSocket) requests.
  const server = httpServer.listen(env.PORT, () => {
    logger.info(`OpsSphere API listening on http://localhost:${env.PORT}`);
  });

  // ---- Graceful shutdown (a small extra you haven't needed before) -----
  // When you press Ctrl+C in the terminal, or when a hosting platform
  // restarts your app, Node sends a "signal" (SIGINT/SIGTERM) to warn the
  // process it's about to be killed. Here we listen for that and close the
  // server cleanly (finish in-flight requests, then exit) instead of just
  // getting killed mid-request.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C in the terminal
  process.on("SIGTERM", () => shutdown("SIGTERM")); // sent by Docker/hosting platforms

  // TYPESCRIPT NOTE: `(signal: string) => shutdown(signal)` — the
  // `: string` after `signal` just tells TypeScript "this parameter will
  // always be text." It's optional documentation; the arrow function
  // itself (`(x) => doSomething(x)`) is plain modern JavaScript, same as
  // what you'd write in a .jsx file already.
}

// Actually run everything above, and if ANYTHING in that chain throws
// (bad Mongo URI, port already in use, etc.), log it clearly and exit
// instead of leaving a half-started, broken process running silently.
main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
