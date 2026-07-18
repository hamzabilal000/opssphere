// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// DAY 6: the SRS names shadcn/ui as the component library - shadcn isn't a
// normal npm package though, it works by copying small, editable component
// files straight into your project (that's its whole selling point - you
// own the code, no black-box dependency). We can't run its install CLI in
// this environment, so this file does the same JOB by hand: one small,
// reusable Button component with the same "variant" idea shadcn's Button
// uses, instead of retyping `className="bg-slate-900 text-white ..."` on
// every single button across the app like Days 2-5 did.
// ============================================================================

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

// TYPESCRIPT NOTE: `ButtonHTMLAttributes<HTMLButtonElement>` means "every
// prop a normal HTML <button> already accepts" (onClick, disabled, type,
// ...). Extending it means our <Button> can be used EXACTLY like a plain
// <button>, plus the one extra `variant` prop defined below.
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:opacity-50",
  secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50",
  danger: "bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 disabled:opacity-50",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      // TYPESCRIPT NOTE: template literals (backtick strings) let us build
      // one final className by combining the variant's classes with
      // whatever the CALLER passed in via `className` - so a page can still
      // add one-off spacing (e.g. `className="mt-4"`) without losing the
      // Button's built-in styling.
      className={`rounded-md py-2 px-4 text-sm font-medium transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
