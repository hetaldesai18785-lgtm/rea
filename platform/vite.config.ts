import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "shared"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4100",
        changeOrigin: false,
      },
      "/preview": {
        target: "http://127.0.0.1:4100",
        changeOrigin: false,
      },
      "/deployed": {
        target: "http://127.0.0.1:4100",
        changeOrigin: false,
      },
    },
  },
});
