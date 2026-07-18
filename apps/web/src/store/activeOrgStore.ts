// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The SRS tech stack calls for Zustand for "local UI state - things like
// sidebar state, filters." This store holds exactly one thing: WHICH
// organization the sidebar's org switcher currently has selected. This is
// deliberately NOT server data (that's what TanStack Query - see
// lib/queries.ts - is for) - it's just "what is this browser tab currently
// looking at," which is why it's a totally separate, much simpler tool.
//
// WHY NOT JUST useState IN AppShell.tsx?
// Several different components need to read AND change the active
// organization - the sidebar's switcher sets it, the topbar might show its
// name, a page might read it to know which org's data to fetch. Passing
// that around as props through every layer would be tedious. Zustand is a
// tiny global store any component can read/update directly, without the
// heavier ceremony of React Context (Toast.tsx's approach) for something
// this simple.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveOrgState {
  activeOrganizationId: string | null;
  setActiveOrganizationId: (id: string | null) => void;
}

// TYPESCRIPT NOTE: `create<ActiveOrgState>()(...)` - the extra `()` before
// the actual function is a quirk of how Zustand's TypeScript types work
// when you wrap `create` with a middleware like `persist` below; it's
// boilerplate you'll see in every Zustand + TypeScript store, not
// something to worry about copying differently each time.
export const useActiveOrgStore = create<ActiveOrgState>()(
  // `persist` automatically saves this store's state to the browser's
  // localStorage and reloads it on the next visit - so refreshing the page
  // (or closing and reopening the tab) doesn't forget which organization
  // you had selected. This is a real browser feature (unrelated to, and
  // not to be confused with, any restrictions on using localStorage inside
  // Claude-generated sandboxed artifacts - OpsSphere is a normal app
  // running in the user's own browser).
  persist(
    (set) => ({
      activeOrganizationId: null,
      setActiveOrganizationId: (id) => set({ activeOrganizationId: id }),
    }),
    { name: "opssphere-active-org" } // the localStorage key this gets saved under
  )
);
