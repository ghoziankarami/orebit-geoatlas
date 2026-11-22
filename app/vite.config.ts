import { defineConfig } from "vite";

// Two pages: the landing page at "/" and the map application at "/app/" (paths relative to app/).
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { landing: "index.html", app: "app/index.html" },
      output: { manualChunks: { maplibre: ["maplibre-gl"] } },
    },
  },
});
