// Vite config used ONLY by scripts/p08-measure.ps1: bundles the PDF adapter alone (the way the app's lazy chunk will be) into
// logs/p08-size so its minified and gzip size can be measured before the screen exists. Not used by the normal build.
export default {
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: 'logs/p08-size',
    emptyOutDir: true,
    minify: true,
    copyPublicDir: false,
    lib: {
      entry: 'src/modules/report/pdf/pdfLibSurface.ts',
      formats: ['es'],
      fileName: 'pdf-surface',
    },
  },
};
