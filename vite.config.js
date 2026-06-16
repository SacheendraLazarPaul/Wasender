import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// React frontend builds into ./dist, which the Express server (server.js) serves.
// In dev (`npm run dev`), Vite runs on 5173 and proxies API calls to Express on 3000.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/webhook": "http://localhost:3000",
    },
  },
});
