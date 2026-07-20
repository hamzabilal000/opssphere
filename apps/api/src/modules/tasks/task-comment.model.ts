// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A comment on a task. Deliberately minimal for Day 8 - no editing, no
// replies/threading, no @mentions (that last one is a Day 9+ "Real-Time"
// module feature per the SRS, not today's job).
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TaskCommentAttrs {
  organizationId: Types.ObjectId;
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}

export type TaskCommentDocument = HydratedDocument<TaskCommentAttrs>;

const taskCommentSchema = new Schema<TaskCommentAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TaskComment = mongoose.model<TaskCommentAttrs>("TaskComment", taskCommentSchema);
