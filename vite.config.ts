import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { youwareVitePlugin } from "@youware/vite-plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [youwareVitePlugin(), react()],
  optimizeDeps: {
    // Limit dep scanning to the app entry so temporary browser profile files
    // under ./tmp are never treated as source inputs.
    entries: ["index.html"],
  },
  server: {
    host: "localhost",
    port: 5173,
    watch: {
      ignored: ["**/tmp/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true,
      },
      "/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
