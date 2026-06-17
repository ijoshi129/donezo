import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// During development we proxy the API + uploaded images to the existing
// Node backend (server.js) so the new frontend talks to real data.
const BACKEND = process.env.DONEZO_BACKEND || "http://127.0.0.1:4173";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "Donezo",
        short_name: "Donezo",
        description: "A fast, swipe-first task manager.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#f4f1ea",
        theme_color: "#f4f1ea",
        icons: [
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            // Task list: fresh when online, last copy when offline.
            urlPattern: /\/api\/tasks$/,
            handler: "NetworkFirst",
            options: { cacheName: "donezo-tasks", networkTimeoutSeconds: 4 },
          },
          {
            // Uploaded images are immutable once written.
            urlPattern: /\/api\/images\//,
            handler: "CacheFirst",
            options: {
              cacheName: "donezo-images",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "donezo-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      // Keep the service worker out of dev — it only caused stale-bundle
      // confusion. The PWA/offline SW is built and served in production.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5180,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
});
