import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// VITE_BASE is '/MyNativePreparation/' when deployed to GitHub Pages (set by .github/workflows/pages.yml), '/' otherwise.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  // The app version for the About card (P09): one source, package.json. Vitest reads this config too, so tests see it as well.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // the app asks the user before switching to a new version
      // the default precache is js, css and html; the report fonts (public/fonts/*.woff, P08) must be cached too, so the PDF works offline
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff}'],
        // the reader fonts (public/fonts/*.woff2, P10 T11c + T11p) are NOT precached (about 16 families, most texts use one or two): the browser downloads a
        // font the first time a text uses it and this rule keeps it, so a font that was shown once also works offline (owner choice A, 22 Nov)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: { cacheName: 'np-fonts', expiration: { maxEntries: 120 }, cacheableResponse: { statuses: [0, 200] } },
          },
          // The published course files (P11 T8a). They are NOT precached (see globPatterns), so a new or changed course never needs an app update;
          // a course that was opened once keeps working offline. The rules match the PATH part `/content/`, so they work for any VITE_BASE.
          // Each `urlPattern` function is copied as text into the service worker: it must not use anything defined outside of it.
          {
            // manifest.json, course.json, overview / content / test files: fresh when there is a network (3 s), else the saved copy
            urlPattern: ({ url }) => /\/content\/.+\.json$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'np-content-data',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // A picture file name can be used again after a picture is replaced or removed, so a saved picture is shown at once
            // (offline too) and refreshed in the background, never kept forever.
            urlPattern: ({ url }) => /\/content\/.+\.(?:svg|webp|png|jpe?g|gif)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'np-content-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'My Native Preparation',
        short_name: 'NativePrep',
        description: 'Exam preparation: read, practice, test.',
        display: 'standalone',
        theme_color: '#e6e9f0',
        background_color: '#e6e9f0',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
