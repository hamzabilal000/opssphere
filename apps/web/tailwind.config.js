/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // DAY 6: the same navy/teal palette used in every OpsSphere learning
      // note and PDF so far - now it's a real part of the running app too,
      // not just the docs. Used mainly by the sidebar/topbar (AppShell.tsx).
      colors: {
        brand: {
          DEFAULT: "#0f2138", // deep navy - sidebar background
          dark: "#0d2436",
          teal: "#16b8a6", // accent - active nav item, focus rings
          blue: "#2f6fed",
        },
      },
    },
  },
  plugins: [],
};
