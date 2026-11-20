# NEXT — hand-off in 20 lines (read right after AGENTS.md; keep it SHORT, rewrite it at the end of every task)

Updated: 2026-11-20 by Claude.  P05 is DONE (T1-T8; 678 tests green, build JS 165.40 KB gzip, one folder `builds\web-0.1.0-20261120-0921`) but its COMMIT is not made yet.  ACTIVE phase: P06 (`docs/phases/P06-reader.md`, 9 tasks), plan written, no code yet.  P04 commit: 5da279f.

## State on disk
- P05 files not yet committed: `src/modules/home/*` (Home, Course, SectionPlaceholder, `layout.test.tsx`), `src/app/homeRoutes.test.tsx`, `Shell.tsx`, en.json (`home.*`, `course.*`), `scripts/p05-preview.ps1`, `scripts/p05-commit.ps1`, `docs/done/P05-summary.md`, `PROGRESS.md`, `docs/phases/P05-home.md`, `docs/phases/P06-reader.md`.
- Routes live: `/`, `/course/:id`, `/course/:id/overview|content|test|report` (placeholders; P06 replaces overview + content, P07 test, P08 report; keep the paths).
- Fingerprint + PIN lock: done in P04 (docs/IDENTITY.md "Locks"); only leftover (not blocking): both app locks are set from Settings.
- P06 plan facts: new module `src/modules/reader/`; font scale 0.8-2.0 by two-finger pinch + `A-`/`A+`; image tap = full-screen zoom viewer; library default `react-zoom-pan-pinch` (MIT, no dependencies; exact version and size to be confirmed at T1, decision goes to DECISIONS Q17).
- CSS rules (styles.test.ts): no hex colors, no raw `ms`/`s` durations, tokens only (`--np-space-1..5`, `--np-color-surface|text|text-muted|accent|border`, `--np-radius-md|lg|pill`, `--np-shadow-raised|inset`, `--np-motion-medium|slow`, `--np-ease`, `--np-font-size-sm|lg`, `--np-touch`, `--np-nav-height`, `--np-content-max`).

## Do now (one step per run)
1. FIRST the owner runs `.\run.cmd p05-commit.ps1`. Claude reads the tail 40 (step 4 must say the old stub keys are gone, builds\ folders: 1, commit made) and writes the commit hash into `docs/done/P05-summary.md` and the PROGRESS.md log line.
2. Then P06 T1: write `scripts/p06-npm-info.ps1` (prints `npm view react-zoom-pan-pinch version license dependencies dist.unpackedSize`), the owner runs it via `run.cmd`, Claude reads the tail and records Q17 in `docs/DECISIONS.md` (read only its tail 20, then append). Next in order: T2 `readerMath.ts` (pure helpers), T3 `BlockView`, T4 font scale, T5 `ImageViewer`, T6 `ReaderScreen` + routes.

## Token rules (the owner hit the limit several times)
- NEVER read a file > 10 KB whole. Use `head` / `tail`. Do NOT read the P04 or P05 file again; the P06 file is short. Big files: biometric.ts, pin.ts, session.ts, biometric.test.ts, PinCard.tsx, en.json (12 KB), DECISIONS.md (14 KB).
- Do NOT use `directory_tree` on `src`; use `list_directory`. Do NOT re-read files already reviewed in the log. Put NEW tests in NEW small files.
- One step per run; after each: tick box + ONE short log line + rewrite this file. Write files first, long thinking later.
- JSON edit tip: when a tool call carries Gujarati, type the real characters (not \u escapes), then check the diff.
