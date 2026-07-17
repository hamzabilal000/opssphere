// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// This is the very first file that runs in the browser. Its ONE job is to
// find the empty <div id="root"></div> in index.html and render our React
// app into it — same concept as main.jsx in your other React projects,
// just with a couple of extra "wrapper" providers added around <App />.
// ============================================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom"; // same BrowserRouter you already use
import App from "./App";
import "./index.css"; // Tailwind's generated styles get pulled in here

// ----------------------------------------------------------------------------
// WHAT IS "TanStack Query" AND WHY DO WE NEED IT?
// ----------------------------------------------------------------------------
// In your other projects, you fetch data like this:
//   useEffect(() => { axios.get(...).then(res => setState(res.data)) }, [])
// ...and you manage loading/error state yourself with useState.
//
// TanStack Query does that same job for you automatically — given a fetch
// function, it gives you back `{ data, isLoading, isError }` without you
// writing useEffect/useState boilerplate every time, and it also caches
// results so you don't refetch the same data over and over. You'll see it
// in action in App.tsx below (the `useQuery` call).
//
// `QueryClient` is just the "engine" that manages all of this caching —
// you create ONE for your whole app (here) and every component can then
// use it via `useQuery`.
const queryClient = new QueryClient();

// TYPESCRIPT NOTE: `document.getElementById("root")!`
// The `!` at the end is called a "non-null assertion" — it tells
// TypeScript "I promise this element exists, stop warning me that
// getElementById COULD return null." We know it exists because it's
// literally in index.html. You'll see this exact pattern in every Vite +
// TypeScript + React project's main.tsx — it's boilerplate, not something
// you need to write differently yourself.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* QueryClientProvider makes the queryClient above available to every
        component in the app, no matter how deeply nested, without having
        to manually pass it down as a prop. */}
    <QueryClientProvider client={queryClient}>
      {/* BrowserRouter enables react-router-dom's <Routes>/<Route> —
          same as wrapping <App /> in your Pages-based projects, just done
          here instead of inside App.tsx. */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
