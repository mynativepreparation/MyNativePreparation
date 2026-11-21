import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE is '/my-native-preparation/' when deployed to GitHub Pages, '/' otherwise.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // the app asks the user before switching to a new version
      // the default precache is js, css and html; the report fonts (public/fonts/*.woff, P08) must be cached too, so the PDF works offline
      workbox: { globPatterns: ['**/*.{js,css,html,woff}'] },
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
