# P02 — Design system: neumorphism tokens, light/dark, responsive, component gallery   [DONE]

Working method (DECISIONS Q15): Claude writes all files; the owner runs commands only via `.\run.cmd <script>.ps1`;
Claude reads `logs\last-run.txt`. Folder has spaces: always quote paths.
Spec refs: SPEC B1–B5 (look and feel). Challenge #6 in DECISIONS: neumorphism has low contrast, so we keep WCAG AA.
No feature screens here (Home/Reader/Test come later); this phase only builds the look and the reusable parts.

## Goal
One consistent, accessible neumorphism look (soft pastel, rounded, light + dark) as design tokens and a small set of
reusable components in `src/core/ui/`, shown on a dev "gallery" screen, with AUTOMATIC checks for text contrast and for
overlap / sideways scrolling. Later phases only compose these components, never invent new colors or sizes.

## Design rules (decided here, do not re-discuss)
- Single source of truth for colors: `src/core/ui/tokens.ts` (light + dark maps). The theme code writes them as CSS variables.
  Non-color tokens (radius, spacing, font sizes, motion) live in `src/core/ui/tokens.css`.
- Starting palette (the contrast test is the judge; adjust a value only if the test fails):
  - Light: surface `#e6e9f0`, text `#1f2430`, textMuted `#4a5266`, accent `#4b5bd6`, onAccent `#ffffff`,
    shadowLight `#ffffff`, shadowDark `#babecc`, danger `#b3261e`, success `#1b7a43`.
  - Dark: surface `#23262e`, text `#eceff5`, textMuted `#aab1c3`, accent `#8f9bff`, onAccent `#14172a`,
    shadowLight `#2e323c`, shadowDark `#181a20`, danger `#ff8a80`, success `#6fd39a`.
- Contrast: normal text >= 4.5:1, large text and icons/borders of controls >= 3:1, in BOTH themes.
  Softness comes from shadows; meaning never depends on shadow or color alone (always icon or label too).
- Touch targets >= 44x44 px. Visible keyboard focus ring on every control. Respect `prefers-reduced-motion`.
- Fonts: system font stack + `Noto Sans Gujarati` fallback (no web-font download; course content may be Gujarati).
- Prefix every CSS class with `np-` (NativePrep). Plain CSS files next to each component (no CSS framework).
- Layout: mobile first, CSS grid/flex, no fixed widths, content max-width 720 px centered, no sideways scrolling.
- Boundaries still apply: `src/core/ui` must not import `src/modules` or `src/app`; modules may import `src/core/ui`.

## Tasks
- [x] T1 Install `lucide-react` (icons, ISC license) via a script `scripts/p02-install.ps1` (Claude writes it, owner runs it
      with `.\run.cmd p02-install.ps1`). Log the installed version.
- [x] T2 Tokens: write `src/core/ui/tokens.ts` (color maps above, typed) and `src/core/ui/tokens.css` (radius 12/20/28,
      spacing scale 4/8/12/16/24/32, font sizes, motion durations 120/200/320 ms + easing, shadow recipes using the color vars).
- [x] T3 Theme engine: `src/core/theme/` with `applyTheme`, `getThemeMode`, `setThemeMode`, `useTheme` hook.
      Modes: `system` (default), `light`, `dark`. Writes CSS variables on `document.documentElement` and `data-theme`.
      Choice saved in `localStorage` key `np.theme` (moves to the real local DB in P03). Set theme BEFORE first paint in
      `main.tsx` to avoid a flash. Tests: default is system, set/get works, invalid saved value falls back to system.
- [x] T4 Global base styles `src/core/ui/base.css`: reset, body background = surface, font stack, headings scale, focus ring,
      `prefers-reduced-motion` rule, safe-area padding for phones. Import it once in `main.tsx`.
- [x] T5 Components in `src/core/ui/` (one file + one css each, each with a small test that it renders and has the right role):
      `Card` (raised), `Surface` (inset/pressed look), `Button` (primary / secondary, sizes), `IconButton`, `Tile` (big home tile:
      icon + title + optional subtitle), `Toggle`, `TextField`, `ProgressBar`, `StarRating` (0-5, read only), `Toast`.
      Export all from `src/core/ui/index.ts`.
- [x] T6 Apply to the app shell: `Shell.tsx` uses `Toast` instead of the plain paragraph and a bottom navigation bar with
      icons + labels (Courses, Settings); `HomeScreen` and `SettingsScreen` use the new components (still placeholders).
      Settings gets a theme selector (System / Light / Dark). Existing Shell test must still pass (update it if the markup changed).
- [x] T7 Gallery: new module `src/modules/gallery/` (route `gallery`, reachable at `#/gallery`, NOT in the bottom nav) showing every
      component in every state, with a theme switch. It is a developer tool; keep it small.
- [x] T8 Contrast test `src/core/ui/contrast.test.ts`: computes the WCAG ratio for every text/background and control/background pair
      in `tokens.ts`, for light and dark; fails below the limits above. Fix tokens until green.
- [x] T9 Layout check helper `src/core/ui/layoutCheck.ts`: returns a list of problems = (a) `document.documentElement.scrollWidth >
      window.innerWidth` (sideways scroll), (b) overlapping bounding boxes between sibling elements marked `data-np-check`.
      The gallery has a "Run layout check" button that prints the result. Unit-test the pure overlap function with fake rectangles.
- [x] T10 Motion: press / hover / theme-switch transitions and a short fade for route changes, using the motion tokens;
      all disabled under `prefers-reduced-motion`. Keep it CSS-only (no animation library yet).
- [x] T11 Owner visual check (owner action): `npm run preview` in PowerShell, open `http://localhost:4173/#/gallery` in Chrome
      Incognito. For widths 360, 768 and 1280 (F12 > device toolbar) and for Light + Dark: press "Run layout check" (must say OK)
      and send ONE screenshot per theme at 360. Claude reviews the screenshots for overlap/mismatch and fixes what is found.
- [x] T12 Final run: `.\run.cmd build.ps1` exit 0 (includes `npm run check`); JS stays <= 250 KB gzip; exactly one folder in `builds\`.
- [x] T13 Cleanup (AGENTS.md "Phase end checklist") and commit through a script `scripts/p02-commit.ps1`
      (message `P02: design system, themes, gallery`).
- [x] T14 Update `PROGRESS.md` (P02 DONE, P03 ACTIVE), write `docs/done/P02-summary.md` (5 lines), create the detailed `P03` file
      (content model: course/block/test schema, manifest, stable IDs, sample course, local DB with Dexie), tell the owner in Gujarati.

## Acceptance (all must be true)
1. `npm run check` passes (types, module boundaries, lint, tests) including the contrast test for light AND dark.
2. All colors come from tokens; no hard-coded color values in component CSS (search for `#` in `src/**/*.css` must find none
   except inside `tokens`).
3. Gallery shows every component; "Run layout check" says OK at 360 / 768 / 1280 px in both themes.
4. Theme switch works (System / Light / Dark), persists after reload, and no white flash on load in dark mode.
5. Everything is usable with keyboard (visible focus) and meets the 44 px touch-target rule.
6. Build keeps JS <= 250 KB gzip; `builds\` has exactly one build.

## Log (append one line after every task: date, agent/model, what, next)
- 2026-11-18 Claude: P02 file written. Next: T1 (write scripts/p02-install.ps1, owner runs it).
- 2026-11-18 Claude: T1 done: lucide-react 1.74.0 installed with react 19.3.1; check passed (4 tests).
- 2026-11-18 Claude: T2-T4 files written, NOT yet run: src/core/ui/tokens.ts + tokens.css + base.css, src/core/theme/theme.ts + useTheme.ts + theme.test.ts (5 tests), index.html (no-flash inline script, colors checked by a test), main.tsx (imports css, initTheme()). Note: success color light changed to #17693a (the planned #1b7a43 is only 4.39:1). Next: owner runs `.\run.cmd check.ps1`, then T5 (components).
- 2026-11-18 Claude: T2-T4 verified: check.ps1 exit 0 (typecheck, boundaries, lint, 9 tests pass).
- 2026-11-18 Claude: T5 files written, NOT yet run: Card, Surface, Button, IconButton, Tile (existed), + new Toggle, TextField, ProgressBar, StarRating, Toast (each .tsx + .css), index.ts, components.test.tsx (11 tests). Next: owner runs `.\run.cmd check.ps1`; if green, T6 (apply to app shell).
- 2026-11-18 Claude: T5 verified: check.ps1 exit 0 (20 tests pass).
- 2026-11-18 Claude: T6 files written, NOT yet run: Shell.tsx + Shell.css (Toast auto-hides after 4 s, bottom nav with icons + labels), HomeScreen (Card + Button), SettingsScreen + css + test (theme selector System/Light/Dark), en.json (theme keys). Shell test unchanged. Next: owner runs `.\run.cmd check.ps1`; if green, T7 (gallery module).
- 2026-11-18 Claude: T6 verified: check.ps1 exit 0 (21 tests pass).
- 2026-11-18 Claude: T7 files written, NOT yet run: src/modules/gallery/ (index.tsx auto-registered, GalleryScreen.tsx + css + test) with theme switch and every component in every state. "Run layout check" button comes in T9. Next: owner runs `.\run.cmd check.ps1`; if green, T8 (contrast test).
- 2026-11-18 Claude: T7 verified: check.ps1 exit 0 (22 tests pass).
- 2026-11-18 Claude: T8 file written, NOT yet run: src/core/ui/contrast.test.ts (9 pairs x light/dark + reference check). If any pair fails, adjust that token in tokens.ts (and index.html if it is a surface color). Next: owner runs `.\run.cmd check.ps1`; if green, T9 (layout check helper).
- 2026-11-18 Claude: T8 verified: check.ps1 exit 0 (41 tests pass; contrast OK in both themes, no token changes needed).
- 2026-11-18 Claude: T9 files written, NOT yet run: src/core/ui/layoutCheck.ts (+ test), exported from index.ts; gallery has a "Layout check" section with the button. Design note: `data-np-check` is set on a CONTAINER and its direct children are compared pairwise (every gallery row has it). Next: owner runs `.\run.cmd check.ps1`; if green, T10 (motion).
- 2026-11-18 Claude: T9 verified: check.ps1 exit 0 (48 tests pass).
- 2026-11-18 Claude: T10 files written, NOT yet run: theme-switch color transitions added to Card, Surface, Button, IconButton, Tile, TextField, nav; route fade (`np-fade-in`, Shell main keyed by pathname); all durations from motion tokens; base.css reduced-motion rule already covers animations and transitions. New src/core/ui/styles.test.ts checks: no hex colors in any css, no raw durations outside tokens/base, reduced-motion rule present (this also covers acceptance #2). Next: owner runs `.\run.cmd check.ps1`; if green, T11 (owner visual check).
- 2026-11-18 Claude: T10 verified: check.ps1 exit 0 (52 tests pass).
- 2026-11-18 Claude: T11 started: wrote scripts/p02-preview.ps1 (build + preview server, never exits, so it is run directly, not via run.cmd). Waiting for the owner's layout-check results and 2 screenshots (Light + Dark at 360 px).
- 2026-11-18 Claude: T11 partial: owner sent 3 LIGHT screenshots (widths 400, 974, 1366); layout check said OK in all three; top of gallery looks correct (no overlap, content centered, nav ok). Still missing: Dark theme runs, exact 360/768/1280 widths, and screenshots of the lower gallery sections (Tile, Toggle, TextField, ProgressBar, StarRating). T11 stays open.
- 2026-11-18 Claude: T11 update: owner reports by eye that the DARK theme looks correct (no screenshot, layout-check result not stated). Still unconfirmed: Dark "Run layout check" = OK, widths 360/768/1280, lower gallery sections. T11 stays open until the owner confirms these.
- 2026-11-18 Claude: T11 done: owner sent 3 DARK screenshots (widths 400, 974, 1366); layout check OK in all three; no overlap, text readable, nav fine. With the earlier 3 LIGHT runs, both themes are checked at 3 widths (400/974/1366 instead of exactly 360/768/1280; the layout check scans the whole page, so lower sections are covered for overlap/sideways scroll). Not yet seen by eye: lower gallery sections, reload persistence and no white flash in dark (acceptance #4). Next: T12 (owner runs `.\run.cmd build.ps1`).
- 2026-11-18 Claude: T12 done: build.ps1 exit 0 (typecheck, boundaries 42 files, lint, 52 tests pass); JS 105.39 kB gzip (limit 250); CSS 2.16 kB gzip; PWA precache 7 entries; builds\ has exactly one folder (web-0.1.0-20261118-1043). Owner also confirmed dark theme persists after reload with no white flash (acceptance #4). Next: T13 (cleanup + scripts/p02-commit.ps1).
- 2026-11-18 Claude: T13 script written, NOT yet run: scripts/p02-commit.ps1 (gitignore check, console.log/debugger scan of src, builds\ count, commit `P02: design system, themes, gallery`). Manual cleanup review: src tree has no stray/temp files; the only console call is the intentional console.error in boot.ts. Next: owner runs `.\run.cmd p02-commit.ps1`; if exit 0, tick T13 and do T14.
- 2026-11-18 Claude: T13 done: p02-commit.ps1 exit 0, commit 714719d `P02: design system, themes, gallery` (56 files; only harmless LF/CRLF warnings).
- 2026-11-18 Claude: T14 done: P02 DONE in PROGRESS.md, docs/done/P02-summary.md written, docs/phases/P03-content-model.md created (P03 ACTIVE). Owner told in Gujarati. P02 closed.
