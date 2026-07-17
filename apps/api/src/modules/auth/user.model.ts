// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is our first real Mongoose model — same job as a `.model.js` file in
// your other projects (e.g. `teacher.model.js`), just with TypeScript types
// layered on top so your editor knows exactly what fields a "User" document
// has everywhere you use it.
//
// A quick reminder of the concepts, in your usual terms:
//   mongoose.Schema(...)  -> describes what fields a document has
//   mongoose.model(...)   -> turns that schema into something you can
//                            actually query (User.findOne(...), etc.)
// ============================================================================

import mongoose, { Schema, type HydratedDocument } from "mongoose";

// ----------------------------------------------------------------------------
// TYPESCRIPT NOTE: why do we write an `interface` AND a `Schema`?
// ----------------------------------------------------------------------------
// The Schema (further down) is what MONGOOSE actually uses at runtime to
// validate and save documents — this part is identical in spirit to your
// usual `mongoose.Schema({...})`.
//
// The `interface` below is ONLY for TypeScript/your editor — it describes
// the same fields, so that when you write `user.email`, your editor knows
// that's a string, and would warn you if you typo'd `user.emial`. It has
// zero effect on how the database actually behaves.
export interface UserAttrs {
  email: string;
  passwordHash: string;
  isEmailVerified: boolean;
  // ?  means optional — most users won't have a pending verification token
  // at any given moment (only right after registering).
  emailVerificationTokenHash?: string;
  emailVerificationTokenExpiresAt?: Date;
  // These two are never set manually anywhere in our code — the
  // `timestamps: true` option below tells Mongoose to fill them in and
  // keep them updated automatically. We still list them here so
  // TypeScript knows `user.createdAt` is a valid, real field to read.
  createdAt: Date;
  updatedAt: Date;
}

// TYPESCRIPT NOTE: `HydratedDocument<UserAttrs>` describes "a real Mongoose
// document that has the fields from UserAttrs, PLUS Mongoose's own extras"
// (like ._id, .save(), .createdAt from timestamps, etc). This is the type
// we'll use whenever a function receives an actual user fetched from the
// database.
export type UserDocument = HydratedDocument<UserAttrs>;

// This part is exactly your usual Mongoose schema definition —
// `require: true` becomes `required: true` here (this project spells it
// correctly; both work in Mongoose, but `required` is the standard spelling).
const userSchema = new Schema<UserAttrs>(
  {
    email: {
      type: String,
      required: true,
      unique: true, // MongoDB will reject a second user with the same email
      lowercase: true, // always store emails lowercase, so lookups are consistent
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      // select: false means "don't include this field by default when
      // fetching a user" — you have to explicitly ask for it
      // (`.select("+passwordHash")`). This is an extra safety net so a
      // careless `User.findOne(...)` elsewhere in the app can never
      // accidentally leak a password hash into an API response.
      select: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationTokenExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    // Same as passing `{ timestamps: true }` in a plain JS Mongoose schema —
    // Mongoose automatically adds and maintains createdAt/updatedAt fields.
    timestamps: true,
  }
);

// Same job as `module.exports = { ODM }` in your other projects — just
// using `export` instead. "User" here is the MongoDB collection name
// (Mongoose automatically lowercases + pluralizes it to "users").
export const User = mongoose.model<UserAttrs>("User", userSchema);
