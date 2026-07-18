// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// An Organization is one company's workspace. This is the FIRST model in the
// project that isn't about a single person - everything from Day 5 onward
// (projects, tickets, teams...) belongs to exactly one Organization, which is
// how OpsSphere keeps different companies' data completely separate while
// sharing the same running app and database ("multi-tenancy" - see the big
// comment in tenant.middleware.ts for how that separation is actually
// enforced).
// ============================================================================

import mongoose, { Schema, type HydratedDocument } from "mongoose";

export interface OrganizationAttrs {
  name: string;
  // The short, URL-safe identifier (e.g. "acme-inc"). Unique across the
  // WHOLE app, not just within some other scope - two different companies
  // can't both be "acme-inc".
  slug: string;
  timeZone: string;
  // A plain sub-object, not its own model - "business hours" is small
  // enough that a separate collection/relationship would be overkill.
  businessHours: {
    start: string; // "09:00"
    end: string; // "17:00"
  };
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationDocument = HydratedDocument<OrganizationAttrs>;

const organizationSchema = new Schema<OrganizationAttrs>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true, // MongoDB itself will reject a second org with the same slug
      lowercase: true,
      trim: true,
      index: true,
    },
    timeZone: { type: String, required: true, default: "UTC" },
    businessHours: {
      // `_id: false` - without it, Mongoose would give this small
      // sub-object its own auto-generated _id field, which we don't need
      // (it's not a separate document, just a nested value on the org).
      _id: false,
      start: { type: String, required: true, default: "09:00" },
      end: { type: String, required: true, default: "17:00" },
    },
  },
  { timestamps: true }
);

export const Organization = mongoose.model<OrganizationAttrs>("Organization", organizationSchema);
