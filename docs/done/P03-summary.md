# P03 summary — DONE 2026-11-18

- Content format: typed `manifest.json` + per-course files in `public/content/`, stable IDs (`crs-/blk-/qst-/tst-`), SHA-256 hashes made by `scripts/make-manifest.mjs`; spec in `docs/CONTENT-FORMAT.md`.
- Hand-written validators (path-based errors, never throw), Q6 star scoring with every boundary tested, and a loader that returns `ready` / `empty` / `invalid` per section (a missing or empty section = "not available").
- Sample content: "Sample: General Science" (overview, content with image, 6-question test) and "Sample: Empty Course" (only `course.json`); `sampleContent.test.ts` checks files, hashes and images on disk.
- Local database (Dexie, `np-local`: profile, readProgress, attempts, kv) accessed only through `src/core/storage/repo.ts` (enforced by a boundary rule); tests use `fake-indexeddb`.
- `npm run check` = 207 tests green; build JS 105 KB gzip (Dexie not yet imported by any screen); commit `835ce6a` on `master`; `npm audit --omit=dev` = 0 vulnerabilities.
