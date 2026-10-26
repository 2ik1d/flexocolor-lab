import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.BASE_PATH || "/";
export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          fan: ["./src/data/coated.json"],
          libraries: [
            "react",
            "react-dom",
            "dexie",
            "decimal.js",
            "zod",
            "lucide-react",
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "FlexoColor Lab",
        short_name: "FlexoColor",
        description: "Помощник колориста УФ-флексопечати",
        lang: "ru",
        theme_color: "#10151a",
        background_color: "#10151a",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
