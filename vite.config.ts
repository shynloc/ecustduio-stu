import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: "web",
  publicDir: "../public",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "^/api(?:/|[?]|$)": {target: "http://127.0.0.1:" + (process.env.ECUSTUDIO_DEV_PORT || "37892"), changeOrigin: false},
      "/health": {target: "http://127.0.0.1:" + (process.env.ECUSTUDIO_DEV_PORT || "37892"), changeOrigin: false},
    },
  },
});
