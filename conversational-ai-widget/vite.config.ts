import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Local playground for validating the widget before packaging. It renders the
// widget from source and proxies same-origin `/mcp` requests to the mcp-uacapi
// backend so the browser never hits a cross-origin (CORS-blocked) endpoint.
export default defineConfig({
  root: "playground",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: true,
    // Allow importing the widget source from the parent directory.
    fs: { allow: [".."] },
    proxy: {
      "/mcp": {
        target: process.env.MCP_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mcp/, ""),
      },
    },
  },
});
