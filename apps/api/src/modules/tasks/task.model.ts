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
//
//   - `dependsOnTaskIds` (DAY 11): other tasks in the SAME project that
//     must be "done" before this one can be marked "done" - see
//     task.service.ts's moveTask (the actual block) and
//     assertNoDependencyCycle (stops you from creating a loop like A
//     depends on B depends on A).
//
//   - `checklistItems` (DAY 11): a small to-do list living directly ON the
//     task - no separate model, same "keep it embedded" spirit as
//     `position` above. Each item is a Mongoose SUBDOCUMENT (defined by
//     `checklistItemSchema` below) - it automatically gets its own `_id`,
//     which is how task.service.ts finds/updates/removes one specific item.
// ============================================================================

import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";
import type { TaskStatus } from "@opssphere/shared-types";

export interface ChecklistItemAttrs {
  _id: Types.ObjectId;
  text: string;
  isDone: boolean;
  createdAt: Date;
}

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
  dependsOnTaskIds: Types.ObjectId[];
  checklistItems: ChecklistItemAttrs[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<TaskAttrs>;

// A SCHEMA describing one checklist item - the same idea as taskSchema
// below, just smaller and never used to create its own top-level
// collection. Passing `[checklistItemSchema]` as a field's type (see
// `checklistItems` below) tells Mongoose "this field is an array of
// documents shaped like THIS," not just plain objects - that's what gives
// each item its own auto-generated `_id`.
const checklistItemSchema = new Schema<ChecklistItemAttrs>(
  {
    text: { type: String, required: true, trim: true },
    isDone: { type: Boolean, required: true, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

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
    dependsOnTaskIds: { type: [Schema.Types.ObjectId], ref: "Task", default: [] },
    checklistItems: { type: [checklistItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Every board load fetches "all tasks in this project, grouped by status" -
// this compound index matches that access pattern directly.
taskSchema.index({ projectId: 1, status: 1 });

export const Task = mongoose.model<TaskAttrs>("Task", taskSchema);
