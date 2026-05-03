import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The Builder API does not send CORS headers, so dev requests must go
    // through a same-origin proxy. In production, deploy this app behind the
    // same host as the API (or set VITE_API_BASE to its absolute URL with
    // CORS enabled server-side).
    proxy: {
      "/api": {
        target: "https://api.agnt-gm.ai",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
