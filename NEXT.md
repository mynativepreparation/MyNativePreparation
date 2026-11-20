# NEXT — hand-off in 20 lines (read right after AGENTS.md; keep it SHORT, rewrite it at the end of every task)

Updated: 2026-11-20 by Claude.  P06 CLOSED (commit `c030dc6`; build JS **177.75 KB gzip**, budget 250; `npm audit --omit=dev` 0).  ACTIVE phase: **P07 Test game** (`docs/phases/P07-test-game.md`, T1-T12). T1-T10 DONE (967 tests green, 67 files; owner visual check passed after the wrong-answer sound fix). T11 script `scripts/p07-commit.ps1` WRITTEN, not yet run.

## State on disk
- Uncommitted (go into the P07 commit): `scripts/js-size.ps1`, the `build.ps1` change, `docs/done/P06-summary.md`, PROGRESS/NEXT/DECISIONS (Q18) edits, the P07 file, `scripts/p07-*.ps1`, all `src/modules/test-game/*`, plus the extras `deleteSetting(key)` in `repo.ts` + its test (harmless, KEEP).
- INCIDENT 2026-11-20 (fixed by `scripts/p07-restore.ps1`): `src/core/storage/sessionStore.ts` is a REAL file used by 10 files. NEVER delete or rewrite a file only because it looks unused; read its head and the importers first.
- Routes live: `/`, `/course/:id`, overview/content = reader, `/course/:id/test` = real game (module `test-game`, auto-found by `app/boot.ts`); only `/course/:id/report` is still a placeholder in `modules/home/index.tsx` (P08).
- P07 decisions: pure `engine.ts`, NO new dependency (own Web Audio `sound.ts` + own canvas `confetti.ts`, DECISIONS Q18), stars/percent only from `core/content/scoring.ts`, `repo.addAttempt` once at the end, mute in localStorage `np.test.sound`. Wrong-answer sound = triangle E4 sliding to C4 (fixed on owner report; if the laptop is ever silent again, first suspect the cached old build: `registerType: 'prompt'` in `vite.config.ts`).
- Open, not blocking: 4 moderate dev-only audit findings (`minimatch` via `vite-plugin-pwa`), a P14 item.

## Do now (one step per run)
1. Owner runs `.\run.cmd build.ps1` (JS gzip must be <= 250 KB; exactly one folder in `builds\`). Claude reads tail 40; if red fix only what failed. Then the owner runs `.\run.cmd p07-commit.ps1`; Claude reads tail 40 (expect: no new runtime dependency OK, no library OK, sessionStore exists OK, `npm audit --omit=dev` 0, commit `P07: test game, stars, sound, confetti`). Then tick T11 + one log line.
2. T12 phase end (new files first): `docs/done/P07-summary.md` (5 lines, with the JS number), PROGRESS.md (P07 DONE, P08 ACTIVE; read its head first), the detailed `docs/phases/P08-*.md` (Report PDF: start with a Gujarati text-shaping spike; web search PDF libraries first; check licences and the 250 KB JS budget; record the choice in DECISIONS.md tail 6 / append), rewrite this file for P08, tell the owner in Gujarati.

## Token rules (the owner hit the limit several times)
- NEVER read a file > 10 KB whole. Use `head` / `tail`. Do NOT read the P04, P05, P06 or P07 file again except head 40 / tail 6. Big files: biometric.ts, pin.ts, session.ts, biometric.test.ts, PinCard.tsx, sound.test.ts, en.json (12 KB), DECISIONS.md (15 KB; head 28 or tail 6 only).
- The disk can be newer than memory: before editing a core file, read its head. Do NOT use `directory_tree` on `src`; use `list_directory`. NEW tests go into NEW small files. Use `edit_file` for small edits. After each step: tick box + ONE short log line + rewrite this file. Write files first, long thinking later.
- JSON edit tip: when a tool call carries Gujarati, type the real characters (not \u escapes), then check the diff.
