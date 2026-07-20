import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See SRS section 8 (Frontend Experience) - Vite gives us a fast dev server
// and route-level code splitting out of the box.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the frontend call "/api/v1/..." during dev without CORS pain;
      // Express itself still enforces its own CORS/allow-list in production.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // DAY 9: Socket.IO's default path. `ws: true` is the one thing the
      // plain "/api" proxy above doesn't need - it tells Vite's dev proxy
      // to also forward the WebSocket UPGRADE handshake, not just normal
      // HTTP requests. Without it, the socket connection would silently
      // fail to ever actually open in dev.
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
      },
    },
  },
});
