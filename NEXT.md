# NEXT — hand-off in 20 lines (read right after AGENTS.md; keep it SHORT, rewrite it at the end of every task)

Updated: 2026-11-20 by Claude.  P05 is CLOSED (commit ccbb2ba on master; 678 tests, build JS 165.40 KB gzip, `npm audit` 0 vulnerabilities).  ACTIVE phase: P06 (`docs/phases/P06-reader.md`, 9 tasks).  T1-T8 DONE (last check exit 0, 762 tests; owner visual check OK on PC and phone).  T9 (phase end) in progress: `scripts/p06-commit.ps1` written, NOT yet run; T9 box still `[ ]`.

## State on disk
- Everything is committed (ccbb2ba) except: log/NEXT/PROGRESS edits, `scripts/p06-npm-info.ps1`, `scripts/p06-install.ps1`, the Q17 line in DECISIONS.md, `package.json` / `package-lock.json` (react-zoom-pan-pinch 4.2.0), and all new P06 source (`src/modules/reader/*`, `core/ui/NotAvailable.*`, home/app edits); they go into the P06 commit.
- Routes live: `/`, `/course/:id`, `/course/:id/overview|content` (real reader after T6), `/course/:id/test|report` (placeholders; P07 test, P08 report; keep the paths).
- Fingerprint + PIN lock: done in P04 (docs/IDENTITY.md "Locks"); only leftover (not blocking): both app locks are set from Settings.
- P06 plan facts: module `src/modules/reader/`; font scale 0.8-2.0 by two-finger pinch + `A-`/`A+`; image tap = full-screen zoom viewer with `react-zoom-pan-pinch` 4.2.0 (used ONLY in ImageViewer; text pinch is our own Pointer Events code).
- Open note: the full `npm audit` printed 4 moderate vulnerabilities at the P06 install (`npm audit --omit=dev` = 0, so dev side). Re-check at T9 (`npm audit`, read only the summary); not blocking now.
- CSS rules (styles.test.ts): no hex colors, no raw `ms`/`s` durations, tokens only (`--np-space-1..5`, `--np-color-surface|text|text-muted|accent|border`, `--np-radius-md|lg|pill`, `--np-shadow-raised|inset`, `--np-motion-medium|slow`, `--np-ease`, `--np-font-size-sm|lg`, `--np-touch`, `--np-nav-height`, `--np-content-max`).

## Do now (one step per run)
1. T9 part 1: the owner runs `.\run.cmd build.ps1` (check + build; JS gzip must be <= 250 KB; exactly one folder in `builds\`), then `.\run.cmd p06-commit.ps1`. Claude reads tail 40 of each log (build: the gzip line; commit: audit summary + commit hash).
2. T9 part 2 (after the commit): PROGRESS.md (P06 DONE, P07 ACTIVE), `docs/done/P06-summary.md` (5 lines), the P07 file (the Test game; read SPEC C5 + DECISIONS Q5/Q6 only for that; web search for sound/confetti libraries first), tick T9, rewrite this file.

## Token rules (the owner hit the limit several times)
- NEVER read a file > 10 KB whole. Use `head` / `tail`. Do NOT read the P04 or P05 file again; the P06 file is short. Big files: biometric.ts, pin.ts, session.ts, biometric.test.ts, PinCard.tsx, en.json (12 KB), DECISIONS.md (14 KB).
- Do NOT use `directory_tree` on `src`; use `list_directory`. Do NOT re-read files already reviewed in the log. Put NEW tests in NEW small files.
- One step per run; after each: tick box + ONE short log line + rewrite this file. Write files first, long thinking later.
- JSON edit tip: when a tool call carries Gujarati, type the real characters (not \u escapes), then check the diff.
