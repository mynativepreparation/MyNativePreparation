# P01 summary — DONE 2026-11-18

- Vite + React + TypeScript project with a PWA shell (`vite-plugin-pwa`, update prompt, installable in Chrome).
- Central wire (`src/core/wire`): typed events, a failing handler never breaks others; modules auto-load from `src/modules/*`.
- Module isolation is enforced by `scripts/check-boundaries.mjs` (part of `npm run check`); self-test proved a bad import is rejected.
- `npm run check` = types + boundaries + lint + 4 tests; `scripts/build.ps1` builds (JS 100 KB gzip) and keeps only the newest build.
- Working method fixed: Claude + PowerShell via `.\run.cmd` (DECISIONS Q15); first git commit `9dbdc17` on branch `master`.
