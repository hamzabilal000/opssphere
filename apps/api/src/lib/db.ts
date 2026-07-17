// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is our version of the one line you always write in your other
// projects:
//     mongoose.connect("mongodb://localhost:27017/DBNAME").then(res => console.log("db connected"))
//
// We just wrap it in a function so it's easy to call from index.ts, and we
// listen for a couple of extra events so we get a log line if the
// connection ever drops or errors out later (not just when it first connects).
// ============================================================================

import mongoose from "mongoose";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// TYPESCRIPT NOTE: `export async function connectDatabase(): Promise<void>`
//   - `export` = other files can import this function.
//   - `async` = this function uses `await` inside it and returns a Promise
//     (same meaning as in plain JavaScript — TypeScript doesn't change how
//     async/await behaves, it just lets us also WRITE what the function
//     returns).
//   - `: Promise<void>` is TypeScript describing the return type: "this
//     function returns a Promise that doesn't resolve to any useful value."
//     You can safely ignore this part while learning — it's optional
//     documentation for your editor, not something you have to write
//     yourself yet.
export async function connectDatabase(): Promise<void> {
  // strictQuery just tells Mongoose to be strict about only querying fields
  // that are actually defined in your schema — avoids silent typos in queries.
  mongoose.set("strictQuery", true);

  // mongoose.connection is an "event emitter" — same concept as addEventListener
  // in the browser, or how Socket.IO events work. We're saying:
  // "WHEN the connection succeeds, RUN this little function."
  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected");
  });

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  // This is the actual connection call — same job as
  // `mongoose.connect("mongodb://...")` in your other projects.
  // `await` pauses this function until the connection finishes (or fails).
  await mongoose.connect(env.MONGODB_URI);
}

// A small helper used later in tests, so we can cleanly close the database
// connection after a test run finishes instead of leaving it hanging open.
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
