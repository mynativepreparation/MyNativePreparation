# P06 — Reader (Overview + Content): e-book style blocks, pinch font zoom, zoomable images   [ACTIVE]

Working method (DECISIONS Q15): Claude writes all files; the owner runs commands only via `.\run.cmd <script>.ps1`;
Claude reads `logs\last-run.txt`. Folder has spaces: always quote paths. Token rules are in NEXT.md.
Spec refs: SPEC C4 (reader), C3 (not-available text), B1-B5 (look, tokens, layout, smooth), A2 (modular). Block format: `docs/CONTENT-FORMAT.md` (title, subtitle, text, image; every part optional).
Inputs from earlier phases: `core/content/loader.ts` (`loadCourse`, `contentUrl`, `SectionState` = ready | empty | invalid), `core/content/types.ts` (block types; read head 60), `core/ui` (`Button`, `IconButton`, `Card`, `Surface`), `core/i18n` (`t`), `modules/home` (`NotAvailable`, `CourseScreen`, `SectionPlaceholder`, routes in `index.tsx`), hash router + `Shell`.

## Goal
From a course, the tiles Overview and Content open a reader. The blocks are shown in the developer's order as an e-book: reading area fixed in width, no sideways scrolling, text reflows when the font size changes. Two-finger pinch on the text changes the font size. An infographic image opens full screen where it can be pinch-zoomed and panned (not bound to the reading area). Empty or broken data shows the owner's Gujarati message. Nothing here reads personal data.

## Design (made here, do not re-discuss)
- Module: new `src/modules/reader/` registers `course/:courseId/overview` and `course/:courseId/content` (one `ReaderScreen` with a `section` prop). `modules/home/index.tsx` drops ONLY those two placeholder routes (Test and Report keep theirs for P07 / P08). Before writing, read ONLY: head 40 of `src/core/wire/module.ts`, how modules are registered (find with `search_files` pattern `**/registry*`, then head 40), and `src/app/homeRoutes.test.tsx` head 40 (it checks all 6 routes: update it so overview/content use the real reader with `loadCourse` mocked).
- Data: `ReaderScreen` reads `:courseId`, calls `loadCourse(courseId)`, uses `overview` or `content` by `section`. `ready` = blocks; `empty` / `invalid` / unknown course / any error = `NotAvailable` (from home: move it to `core/ui` now if the boundary check forbids importing it from another module) + Back to the course. Loading = status text + skeleton, tokens only. Never throws.
- Page structure: one `<h1>` = tile name (Overview / Content) plus the course title; block `title` = `<h2>`, `subtitle` = `<h3>`, `text` = paragraphs (split on blank lines, single line breaks kept), `image` = figure. All text is plain text, never HTML. Keys = block ids.
- Fixed reading area: one column, `max-width: var(--np-content-max)`, `overflow-wrap: anywhere`, images `max-width: 100%` with `loading="lazy"` and `alt` from the block. No horizontal scroll at any width.
- Font zoom: scale factor 0.8 to 2.0 (design default), start 1.0. Applied as an inline `font-size` on the reading area (in `rem` times scale) unless `styles.test.ts` allows a module-local custom property: read its head 40 first (rules: no hex, no raw `ms`/`s`, tokens only). Two-finger pinch with Pointer Events on the text area (`touch-action: pan-y`, so the browser does not zoom the page and vertical scrolling still works); pure helpers `clampScale` and `pinchScale(startDistance, distance, startScale)`. Also `A-` / `A+` icon buttons (keyboard and mouse users; ctrl + wheel on desktop is optional). The scale is remembered in `localStorage` (a number, not personal data; every access in try/catch, empty storage = 1.0). Settings screen control comes later (P09).
- Images: the inline image is a button; tap opens a full-screen `role="dialog"` `aria-modal` viewer with pinch zoom, pan, double-tap, `+` `-` reset buttons, a Close button, Esc to close, focus moves to Close and returns to the image. Library default: `react-zoom-pan-pinch` (MIT, no dependencies, touch + mouse + touchpad; web search 2026-11-20). T1 confirms the exact current version and size from npm and records the choice in `docs/DECISIONS.md` (Q17); if it is too big or unmaintained, write a small own Pointer Events viewer instead.
- Opened fact for the report (P08): emit it only through `core/wire` if its API already has an event bus (read head 40 of `core/wire/index.ts`); the reader never imports `core/storage` (module rule). If nothing fits, write one line for the P08 plan, do not invent a table.
- Look: `Card`/`Surface`, tokens only (see NEXT.md list), soft corners, light and dark, short fade-in, smooth zoom transitions via `--np-motion-*` / `--np-ease`. All text in `en.json`.
- Boundaries: `modules/reader` may import `core/content`, `core/ui`, `core/i18n`, `core/wire`; never other modules, never `core/storage`.

## Tasks
- [ ] T1 Library decision: `scripts/p06-npm-info.ps1` (prints version, license, dependencies, size of `react-zoom-pan-pinch` via `npm view`); Claude records Q17 in `docs/DECISIONS.md` (append: read tail 20 first); if kept, `scripts/p06-install.ps1` runs `npm install react-zoom-pan-pinch --save-exact` and the owner runs it via `run.cmd`.
- [ ] T2 `src/modules/reader/readerMath.ts` + test: `clampScale`, `pinchScale`, `splitParagraphs` (pure, no DOM).
- [ ] T3 `BlockView.tsx/.css` + test: title, subtitle, text, image (lazy, alt, tap target), optional parts missing, plain text only, block order kept.
- [ ] T4 `useFontScale.ts` + `FontControls.tsx` + pinch handler + tests (clamp 0.8 to 2.0, buttons, remembered, broken storage ignored).
- [ ] T5 `ImageViewer.tsx/.css` + test: opens on tap, dialog role, Close / Esc, focus in and back, alt text.
- [ ] T6 `ReaderScreen.tsx/.css` + `modules/reader/index.tsx` (2 routes) + remove the 2 placeholder routes from home + update `homeRoutes.test.tsx` + en.json keys + tests (sample course: both sections render; empty course: message + Back; unknown id: message).
- [ ] T7 Layout checks: new small `src/modules/reader/layout.test.tsx` like `modules/home/layout.test.tsx` (360 / 768 / 1366 px, `data-np-check` on the block list, `runLayoutCheck` = []); `styles.test.ts` must still pass.
- [ ] T8 Owner visual check: `scripts/p06-preview.ps1` (like p05-preview) on the laptop; pinch needs a touch screen, so also the phone link script from P04 (`p04-phone.ps1`, read its head 20 first). Walk: Overview and Content of "Sample: General Science", text pinch, A- / A+, image tap + pinch + close, "Sample: Empty Course" message, light/dark, narrow window. Claude records the result; fix only what he reports.
- [ ] T9 `.\run.cmd check.ps1` exit 0, `.\run.cmd build.ps1` exit 0 (JS <= 250 KB gzip, one folder in `builds\`); cleanup (AGENTS.md "Phase end checklist"), `scripts/p06-commit.ps1` (copy of p05-commit, message `P06: reader, font zoom, zoomable images`), `PROGRESS.md` (P06 DONE, P07 ACTIVE), `docs/done/P06-summary.md` (5 lines), detailed P07 file, tell the owner in Gujarati.

## Acceptance (all must be true)
1. `npm run check` passes; helper, block, font, viewer and screen tests are green.
2. Overview and Content open from the course tiles and show the blocks in the developer's order; title, subtitle, text and image are each optional; an empty or broken section, an unknown course or a load error shows the exact Gujarati text from SPEC C3 with a Back button; no crash anywhere.
3. The reading area is fixed in width: no sideways scroll and no overlap at 360 / 768 / 1366 px, light and dark; long words wrap.
4. Two-finger pinch on the text changes the font size between 0.8 and 2.0 and the text reflows inside the same width; `A-` / `A+` do the same; the size is remembered; a broken `localStorage` never breaks the reader.
5. Tapping an image opens a full-screen viewer with pinch zoom and pan that is not bound to the reading area; Close and Esc work and focus returns to the image.
6. All visible text is in `src/core/i18n/en.json`; at most one new runtime dependency (exact version, noted in DECISIONS Q17); JS <= 250 KB gzip; `builds\` has exactly one build.

## Log (append one line after every task: date, agent/model, what, next)
- 2026-11-20 Claude: P06 file written (just-in-time planning at the end of P05 from SPEC C3/C4/B1-B5, CONTENT-FORMAT.md and one web search: react-zoom-pan-pinch is MIT with no dependencies and supports touch, mouse and touchpad; exact version and size to be confirmed at T1). No code yet. Next: T1 (library decision + `p06-npm-info.ps1`).
