// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A "file attachment" on a task - DELIBERATELY just a name + a URL, not a
// real uploaded file. Real file storage (streaming an upload, saving it to
// the MinIO bucket already sitting in docker-compose.yml since Day 1,
// generating signed download URLs) is a legitimate, reasonable next step -
// it's just also a decent chunk of NEW infrastructure (multipart upload
// parsing, an S3-compatible client, bucket setup) that this project can't
// actually spin up and test in this environment today. Storing a link
// (e.g. to a file already in Drive/Dropbox/wherever) still delivers the
// real feature - "attach something to a task" - without pretending file
// storage was built and verified when it wasn't. See the Day 8 learning
// note for the full reasoning.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TaskAttachmentAttrs {
  organizationId: Types.ObjectId;
  taskId: Types.ObjectId;
  name: string;
  url: string;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
}

export type TaskAttachmentDocument = HydratedDocument<TaskAttachmentAttrs>;

const taskAttachmentSchema = new Schema<TaskAttachmentAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TaskAttachment = mongoose.model<TaskAttachmentAttrs>("TaskAttachment", taskAttachmentSchema);
