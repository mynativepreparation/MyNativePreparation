import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// VITE_BASE is '/my-native-preparation/' when deployed to GitHub Pages, '/' otherwise.
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
