import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Dedicated, strict port so Trendline never shares a localhost origin with
    // other local apps (e.g. the MRI portal on 5173). Sharing an origin lets a
    // stale service worker from the other app hijack Trendline and break /api.
    port: 5280,
    strictPort: true,
    proxy: {
      // All /api calls in dev are forwarded to Express. Use 127.0.0.1 (not
      // "localhost") so the proxy always hits IPv4 and never fails on a
      // localhost→::1 resolution mismatch.
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
