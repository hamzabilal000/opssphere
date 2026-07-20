// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Task model - the actual "work item" on the Kanban board. A few
// fields worth calling out:
//
//   - `parentTaskId` (optional): when set, THIS task is a SUBTASK of
//     another one. There's no separate "Subtask" model - a subtask is just
//     a regular Task that happens to point at a parent. Simpler than a
//     whole second model, and it means subtasks get everything a normal
//     task gets for free (their own status, assignees, comments, ...).
//
//   - `position` (a plain number): where this card sits within its OWN
//     status column on the board, low-to-high. See task.service.ts's
//     moveTask for exactly how this gets maintained - Day 8 keeps this
//     intentionally simple (append to the end of whichever column a card
//     is dropped into, not "insert at this exact slot and shift
//     everything else").
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { TaskStatus } from "@opssphere/shared-types";

export interface TaskAttrs {
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  sprintId?: Types.ObjectId;
  parentTaskId?: Types.ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeIds: Types.ObjectId[];
  dueDate?: Date;
  position: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<TaskAttrs>;

const taskSchema = new Schema<TaskAttrs>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sprintId: { type: Schema.Types.ObjectId, ref: "Sprint" },
    parentTaskId: { type: Schema.Types.ObjectId, ref: "Task", index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["todo", "in_progress", "in_review", "done"],
      required: true,
      default: "todo",
    },
    assigneeIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    dueDate: { type: Date },
    position: { type: Number, required: true, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Every board load fetches "all tasks in this project, grouped by status" -
// this compound index matches that access pattern directly.
taskSchema.index({ projectId: 1, status: 1 });

export const Task = mongoose.model<TaskAttrs>("Task", taskSchema);
