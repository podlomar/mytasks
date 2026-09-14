import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development Vite serves the app and forwards /api to the Express server.
// In production Express serves the built app from dist/ itself.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:4123" },
  },
});
