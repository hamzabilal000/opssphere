// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// A "toast" is the small notification that pops up in a corner of the
// screen for a few seconds ("Invitation sent.") and then disappears on its
// own - one of the Day 6 "shared UI patterns" deliverables. Days 2-5 showed
// this kind of feedback as plain text sitting inline in the page (easy to
// miss, and it pushes the rest of the form around). A toast is a small
// upgrade: it shows up in the SAME place every time, and cleans itself up.
//
// HOW THIS WORKS, IF YOU HAVEN'T USED REACT CONTEXT BEFORE:
// `createContext` + a Provider is React's built-in way to make one piece of
// state (here, "the current list of toasts") available to ANY component
// anywhere in the tree, without passing it down as a prop through every
// layer in between. `ToastProvider` wraps the whole app once (see App.tsx);
// any component can then call `useToast()` to add a new toast, no matter
// how deeply nested it is.
// ============================================================================

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastVariant = "success" | "error";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

// `undefined` as the default means "nobody's wrapped this in a
// ToastProvider yet" - useToast() below turns that into a clear error
// instead of a confusing crash somewhere else.
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // TYPESCRIPT NOTE: `useCallback` just memoizes this function so it
  // doesn't get recreated on every render - not strictly required here,
  // but a common pattern for functions handed out through context.
  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, variant }]);
    // Auto-dismiss - remove this exact toast (by id) after a few seconds.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Fixed to the corner of the viewport, stacked newest-on-bottom -
          rendered here ONCE, at the top of the app, so it's always on top
          of whatever page is currently showing. */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-md shadow-lg border p-3 text-sm bg-white ${
              t.variant === "success" ? "border-teal-200" : "border-red-200"
            }`}
          >
            {t.variant === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <p className="flex-1 text-slate-700">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() was called outside of <ToastProvider> - check main.tsx.");
  }
  return ctx;
}
