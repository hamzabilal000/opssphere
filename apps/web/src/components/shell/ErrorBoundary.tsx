// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// DAY 16 ("Hardening"): if ANY component anywhere in this app throws while
// rendering (a genuine bug - a null reference, bad data shape, whatever),
// React's default behavior is to unmount the ENTIRE app and leave a blank
// white screen with nothing but a console error. That's the worst possible
// experience for a real user, who has no idea what just happened or that
// there's even a console to check.
//
// A React "error boundary" catches exactly that class of error and renders
// a friendly fallback UI instead - "Something went wrong, try reloading" -
// rather than a blank screen. This is the ONE thing in React that still
// REQUIRES a class component; there is no hooks-based equivalent as of
// this writing (getDerivedStateFromError / componentDidCatch have no
// function-component form), so this file is deliberately the one class
// component in an otherwise all-function-components codebase.
//
// IMPORTANT LIMITATION (worth knowing, not a bug): error boundaries only
// catch errors thrown DURING RENDERING (or in lifecycle methods) - NOT
// errors inside event handlers (an onClick throwing), NOT errors inside
// async code (a rejected promise), and NOT errors during server-side
// rendering (irrelevant here anyway). Those are already handled elsewhere
// in this app: TanStack Query's `isError` states cover failed fetches, and
// every mutation's `.catch()` + useToast() covers failed writes. This
// boundary's job is narrower and different - genuine RENDER-time crashes.
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// TYPESCRIPT NOTE: `extends Component<Props, State>`
// This is the class-component equivalent of a function component's
// `useState` - `this.state` holds this component's own local state
// (just one boolean here), and `this.setState(...)` is how it's updated.
// Function components can't do what this file needs (see the big comment
// above), so this is the one place in the app that uses the OLDER,
// class-based way of writing a React component instead.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  // React calls this automatically the moment a CHILD component throws
  // during rendering - returning { hasError: true } here is what tells
  // React "render the fallback UI below instead of the children that just
  // crashed."
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  // Also called automatically, right after getDerivedStateFromError -
  // this is where the actual error gets LOGGED (to the console for now;
  // a real production deployment would send this to an error-tracking
  // service instead, a reasonable further hardening step this project
  // doesn't need for a teaching/portfolio build).
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Uncaught render error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.assign("/dashboard");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <Card className="max-w-md w-full p-8 text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-500 text-sm mb-6">
              This page ran into an unexpected error. Reloading usually fixes it - if it keeps
              happening, let us know what you were doing when it occurred.
            </p>
            <Button onClick={this.handleReload} className="w-full">
              Reload
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
