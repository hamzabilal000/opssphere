// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A "file attachment" on a task. Day 8 deliberately kept this to just a
// name + an external URL (a link to a file already in Drive/Dropbox/
// wherever) - real uploads were a disclosed, reasonable-next-step gap.
// DAY 12 closes that gap by adding a SECOND way to create one: a real
// uploaded file, stored in the MinIO bucket that's been sitting unused in
// docker-compose.yml since Day 1 (see lib/storage.ts).
//
// An attachment is now EITHER:
//   - a LINK  → `url` is set, `storageKey` is not (Day 8's original shape)
//   - an UPLOAD → `storageKey`/`mimeType`/`sizeBytes` are set, `url` is not
//     (the actual file bytes live in MinIO, referenced by `storageKey`)
// Exactly one of `url`/`storageKey` should ever be set on one document -
// enforced in task.service.ts, not by the schema itself (Mongoose doesn't
// have a clean "exactly one of these two fields" validator built in).
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TaskAttachmentAttrs {
  organizationId: Types.ObjectId;
  taskId: Types.ObjectId;
  name: string;
  url?: string; // set only for a LINK attachment
  storageKey?: string; // set only for an UPLOADED attachment - the MinIO object key
  mimeType?: string; // set only for an UPLOADED attachment
  sizeBytes?: number; // set only for an UPLOADED attachment
  uploadedBy: Types.ObjectId;
  createdAt: Date;
}

export type TaskAttachmentDocument = HydratedDocument<TaskAttachmentAttrs>;

const taskAttachmentSchema = new Schema<TaskAttachmentAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String },
    storageKey: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TaskAttachment = mongoose.model<TaskAttachmentAttrs>("TaskAttachment", taskAttachmentSchema);
