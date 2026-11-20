# P06 summary — DONE 2026-11-20

- E-book reader (`src/modules/reader/`): Overview and Content screens show the developer's blocks in order (title, subtitle, text, image, each optional); empty, broken or unknown sections show the SPEC C3 "not available" text with Back (`NotAvailable` moved to `core/ui`).
- Font size 0.8-2.0 by two-finger pinch (own Pointer Events code) and `A-` / `A+`, remembered in `localStorage` (broken storage never breaks the reader); reading width stays fixed (layout checks at 360 / 768 / 1366 px, light and dark).
- Tapping an image opens a full-screen zoom/pan viewer with Close, Esc, focus return and a Tab trap; library `react-zoom-pan-pinch` 4.2.0 (MIT, exact pin, DECISIONS Q17) is imported only in `ImageViewer`; fixed a blank-picture bug found in the owner's check (SVG with only a viewBox).
- 762 tests green, 133 files in the boundary check; owner visual check OK on PC and phone; commit `c030dc6`; `npm audit --omit=dev` = 0 (4 moderate dev-only findings via `vite-plugin-pwa`, review in P14).
- Build JS 177.75 KB gzip (budget 250 KB); new `scripts/js-size.ps1` enforces the budget and `build.ps1` calls it.
