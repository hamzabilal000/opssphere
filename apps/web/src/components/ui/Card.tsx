// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The white, rounded, bordered box every page from Day 2 onward has copy-
// pasted as `className="max-w-md w-full bg-white border border-slate-200
// rounded-lg shadow-sm p-8"`. One component now, instead of that string
// repeated in nine different files.
// ============================================================================

import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-lg shadow-sm p-6 ${className}`}
      {...props}
    />
  );
}
