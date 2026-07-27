import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is "/" for dev and API-mode builds; the static (GitHub Pages) build sets
// VITE_BASE to "/<repo>/" so asset and dataset URLs resolve under the project path.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
