// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// One of the Day 6 deliverables is "shared UI patterns: loading/empty/error
// states." Every page so far has handled these three moments slightly
// differently (some plain text, some nothing at all). These three small
// components give every page in the app the exact same look for "still
// fetching," "fetched, but there's nothing here," and "something went
// wrong" - instead of each page inventing its own wording and styling.
// ============================================================================

import { Loader2, Inbox, AlertTriangle } from "lucide-react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
      {/* lucide's icons all support Tailwind's `animate-spin` utility
          directly - no separate spinner component needed. */}
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-slate-400 text-sm py-6">
      <Inbox className="w-6 h-6" />
      {label}
    </div>
  );
}

export function ErrorState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-red-600 text-sm py-4">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {label}
    </div>
  );
}
