# NEXT — hand-off in 20 lines (read right after AGENTS.md; keep it SHORT, rewrite it at the end of every task)

Updated: 2026-11-20 by Claude.  Phase: P04 (`docs/phases/P04-identity.md`).  Task: T16 (commit pending). T1-T15 DONE.

## State on disk
- Last verified green: `p04-cleanup.ps1` 2026-11-20 08:35, exit 0, 632 tests in 42 files, 106 files in the boundary check, OnboardingStub.tsx deleted. Build: `builds\web-0.1.0-20261120-0832` (only folder, JS 163.4 KB gzip; built before the cleanup, which only removed code and text, so no rebuild is needed).
- `scripts\p04-commit.ps1` is WRITTEN, not run: checks, `npm audit --omit=dev` (information), then git commit `P04: identity, onboarding, encrypted local store`.
- Lock rule (final): fingerprint first; a good fingerprint opens the app, no PIN; else the PIN screen (12 words from there). In docs/IDENTITY.md. Known gap (in IDENTITY.md): FingerprintScreen "Turn on" does not offer the PIN; both locks are set from Settings.

## Do now (one step per run)
1. Owner runs `.\run.cmd p04-commit.ps1`. Claude reads the tail of `logs\last-run.txt` (commit made? audit result? warnings?), then ticks T16 and logs the audit result.
2. T17: PROGRESS.md (P04 DONE, P05 ACTIVE), `docs/done/P04-summary.md` (5 lines), detailed `P05` file (Home courses, 4 tiles, navigation, "not available" state), tell the owner in Gujarati. Follow the AGENTS.md phase end checklist; the P04 file stays short (log tail 6 only).

## Token rules (the owner hit the limit several times)
- NEVER read a file > 10 KB whole. Use `head` / `tail`. biometric.ts (18 KB), pin.ts (11 KB), session.ts (10 KB), biometric.test.ts (21 KB), PinCard.tsx (11 KB), en.json (11 KB) are big: read only the part you change. Phase file P04: task list = `head 75`, log = `tail 6`.
- Do NOT re-read files already reviewed in the log. Put NEW tests in NEW small files.
- One step per run; after each: tick box + ONE short log line + rewrite this file. Write files first, long thinking later.
