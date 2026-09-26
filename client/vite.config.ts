/// <reference types="vitest/config" />
import { realpathSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Resolve Windows 8.3 short paths (e.g. C:\Users\NAME~1) to the real path so Vite's
// file-serving allow list matches the files it serves.
const root = realpathSync.native(__dirname);

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(root, "src") } },
  server: {
    port: 5373,
    strictPort: true,
    fs: { allow: [path.resolve(root, "..")] },
    proxy: { "/api": { target: "http://localhost:4200", changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
