import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    // `npm run dev` (frontend) forwards /api calls to the backend started with `npm run dev` in server/
    proxy: { "/api": process.env.API_URL || "http://localhost:8080" },
  },
});
