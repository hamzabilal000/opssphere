// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Same idea as Button.tsx - the `className="w-full border border-slate-300
// rounded-md px-3 py-2 text-sm"` string every text input has repeated since
// Day 2, now written once.
// ============================================================================

import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal ${className}`}
      {...props}
    />
  );
}
