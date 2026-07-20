// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A comment on a task. Day 8 kept this minimal (no editing, no replies/
// threading, no @mentions). Day 9 - the "Real-Time" module the code has
// been forward-referencing since Day 8 - adds two of those three: editing
// (see `updatedAt`, now enabled) and @mentions (`mentionedUserIds`).
// Replies/threading still isn't built - that's a bigger feature (nested
// comment trees) than a single day's scope, and nothing so far has
// specifically promised it.
//
// HOW MENTIONS WORK: Day 9 doesn't build a fancy "@" autocomplete picker -
// that needs real UI work (a dropdown that filters as you type) beyond
// what a single day should try to also verify. Instead, a mention is just
// "@" immediately followed by a project member's exact email address
// (e.g. "@hamza@example.com") - see task.service.ts's `detectMentions` for
// the actual parsing. Simple, unambiguous, and disclosed as a deliberate
// scope choice - see the Day 9 learning note.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface TaskCommentAttrs {
  organizationId: Types.ObjectId;
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  mentionedUserIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type TaskCommentDocument = HydratedDocument<TaskCommentAttrs>;

const taskCommentSchema = new Schema<TaskCommentAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    mentionedUserIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  // DAY 9 CHANGE: `updatedAt` is now tracked (was `updatedAt: false` in
  // Day 8) - this is exactly how the frontend knows to show "(edited)" on
  // a comment: compare `updatedAt` to `createdAt`, see task.service.ts's
  // comment-summary mapping.
  { timestamps: true }
);

export const TaskComment = mongoose.model<TaskCommentAttrs>("TaskComment", taskCommentSchema);
