# P02 summary — DONE 2026-11-18

- Design tokens (`src/core/ui/tokens.ts` + `tokens.css`): neumorphism light and dark palettes, radius/spacing/font/motion scales; success-light color adjusted to `#17693a` to pass WCAG AA.
- Theme engine (`src/core/theme`): System / Light / Dark, saved in `localStorage` (`np.theme`), applied before first paint (no white flash, owner-verified).
- 10 reusable components in `src/core/ui` (Card, Surface, Button, IconButton, Tile, Toggle, TextField, ProgressBar, StarRating, Toast), bottom navigation, CSS-only motion that respects reduced-motion.
- Automatic guards: contrast test (both themes), no-hex/no-raw-duration style test, layout check helper; gallery at `#/gallery` has "Run layout check" (OK in light and dark at 400/974/1366 px).
- `npm run check` = 52 tests green; build JS 105 KB gzip; commit `714719d` on `master`.
