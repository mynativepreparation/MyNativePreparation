# P10 summary — Admin editor (closed 2026-11-23)

- Commits: `df6188c` `P10: admin editor` and `d636564` `P10: several tests per course (Q27)`. FULL check at T12: 173 test files / 2863 tests green; the later Q27 work was checked with `fast.ps1` (FAST CHECK OK). Build JS **722.51 KB gzip** (budget 800 KB), `npm audit --omit=dev` = 0, no new runtime dependency.
- Admin page: login with a GitHub token (held in memory only; access = `permissions.push` on `mynativepreparation/MyNativePreparation`, DECISIONS Q24); drafts are kept in the browser and survive a reload; a published course can be loaded back for editing.
- Course window (Q26, no editor library): own rich-text engine (`core/admin/richDoc.ts`, `useRichDoc`, `RichBox`), toolbar with 16 fonts, sizes, colours, letter / word / paragraph boxes, pictures (width, height, position), chapters, parts Overview | Content | Test; test editor (Word paste, `**` marks, form); several tests per course (Q27, `tests/<tst-id>.json`).
- Look: third theme "Colour" (pastel, Q28); the `system` theme is gone (an old saved value reads as Light).
- NOT built, by plan: WRITING to GitHub. `core/admin/github.ts` only reads; Publish / Unpublish, offline cache of content and the deploy workflow are P11.
- Leftovers (never auto-delete, ask the owner): 16 `fingerprint.*` keys + `toast.dismiss` in `en.json` look unused; `core/identity/handover.ts` and `modules/onboarding/FingerprintScreen.tsx` look unrouted; `logs\p10-removed\` is a backup of the old admin window.
