# P09 — Settings: profile card, update button, About (theme, fingerprint, PIN, passphrase info already exist)   [ACTIVE]

Working method (DECISIONS Q15): Claude writes all files; the owner runs commands only via `.\run.cmd <script>.ps1` (scripts that never end, like the preview server, are started with `powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\<n>.ps1"`); Claude reads `logs\last-run.txt` (tail 40). Folder has spaces: quote paths.
Spec: SPEC C7 (Settings = 2nd main screen: profile card, passphrase information, "Update app" button that checks online and updates, About = app, license, data policy), A3 (open source, update in place), A4 (no server), B1-B4 (tokens, light/dark, no overlap). DECISIONS: Q2/Q3 (privacy wording must be technically true), Q22 (JS budget 800 KB gzip; last build 682.26 KB).

## What exists today (read before changing; the disk wins over this text)
- `src/modules/settings/`: `SettingsScreen.tsx` (1.6 KB) places Theme (system / light / dark), `FingerprintCard`, `PinCard`, `PassphraseCard` (read-only explanation of the 12 words + Log out with confirmation). Each card has its own css and tests. `index.tsx` registers the route.
- `core/storage/repo.ts`: `getProfile()` / `saveProfile(profile)` (encrypted, `Profile = {name?, email?, phone?}`, rejects with `LockedError` / `DecryptError`; `saveProfile` replaces the whole profile, fields left out are removed).
- `modules/onboarding/InfoScreen.tsx` holds a private light email check (`EMAIL_SHAPE`) and `buildProfile` (trim, drop empty fields). `app/UpdatePrompt.tsx` uses `useRegisterSW` (`virtual:pwa-register/react`, `registerType: 'prompt'` in `vite.config.ts`) and shows "update available" only when a new version is already waiting. `LICENSE` is MIT.
- Missing: the profile card, the Update app button, the About card.

## Goal
Settings shows, in this order: Profile card (prefilled, editable, all optional) · Theme · Fingerprint · PIN · Passphrase information (+ Log out) · Update app · About. Nothing else changes; the existing cards keep their tests.

## Design (decided here, do not re-discuss)
- A module imports only `core/*`, never another module. Strings only in `src/core/i18n/en.json`. No new dependency (the version and the update check need none). Tokens only in CSS (no hex colours, no raw durations); every new group of cards that must not overlap carries `data-np-check`.
- Profile card: loads `getProfile()` once; fields name, email, phone, all optional, same light email check as onboarding (shape only). To keep ONE copy of the rule, move `EMAIL_SHAPE` + `buildProfile` into a small `core/identity/profileInput.ts` with its own test and let `InfoScreen` import it (read InfoScreen head first; its tests must stay green). Save writes through `saveProfile`; an empty form saves an empty profile (fields removed). A saved / failed message in an `aria-live` area; the raw error is never shown (`LockedError`, `DecryptError` -> a friendly "cannot read your details" text with Try again). Email and phone are never logged. Long Gujarati names wrap (`overflow-wrap: anywhere`).
- Update app (SPEC C7): the button checks online and updates. Flow: offline (`navigator.onLine` false) -> "You are offline" and nothing else; otherwise busy text, then `registration.update()`; a new version found -> "New version ready" with an "Update now" button (`updateServiceWorker(true)`, the page reloads, local data stays); none found -> "You have the latest version"; the check fails or takes over 10 s -> "Could not check, try again". With no service worker (dev server) the card says updates are checked in the installed app. The logic lives in `core/update/` (framework-free, a fake registration in tests); the module has ONE registration (a single place calls `registerSW`); if that needs `UpdatePrompt` to read the same store, change it in the same task and keep its behaviour. T1 decides the exact shape after reading `main.tsx`, `UpdatePrompt.tsx`, `vite.config.ts` and the vite-plugin-pwa docs (web search) and records it in DECISIONS Q23.
- About card: app name, version (from `package.json`; T4 picks `define` in `vite.config.ts` or a JSON import after reading `tsconfig` head), "MIT licence, free and open source", the data policy in the SAME wording as the privacy screen (reuse its i18n keys, never a second wording; read `PrivacyScreen.tsx`), and one line naming the open-source parts (Noto Sans Gujarati OFL, pdf-lib, and the other runtime dependencies from `package.json`).
- Rendering never blocks: each card loads on its own (profile shows a small loading line).
- Tests: new tests in NEW small files; fake repo and fake registration; the real look is judged by the owner (PC and phone).

## Tasks
- [x] T1 Update logic: `core/update/` (types, `checkForUpdate`, the single registration + store, hook) + tests with a fake registration and fake timers (offline, found, none, error, 10 s timeout, no service worker); DECISIONS Q23; keep `UpdatePrompt` working (small edit only if needed).
- [x] T2 `UpdateCard.tsx` + css + test in `modules/settings` (button, `aria-live` status, Update now; keyboard; disabled while busy).
- [x] T3 `core/identity/profileInput.ts` + test, `InfoScreen` switched to it, then `ProfileCard.tsx` + css + test (prefill, save, empty form, bad email, `LockedError` / `DecryptError`, long Gujarati name).
- [x] T4 `AboutCard.tsx` + css + test (version shown, licence, data policy from the privacy keys, libraries line).
- [x] T5 `SettingsScreen.tsx`: the final order; update `SettingsScreen.test.tsx` (order, every card present); existing card tests untouched.
- [x] T6 `SettingsScreen.layout.test.tsx` at 360 / 768 / 1366 px (`runLayoutCheck` = [], long Gujarati name, all cards, update states), keyboard Tab order, reduced-motion / stylesheet rules like `ReportScreen.layout.test.tsx`. Fix only what fails.
- [x] T7 Owner visual check: `scripts/p09-preview.ps1` (like p08-preview): edit the profile and see it kept after a reload and after Log out + login; offline check with DevTools > Network > Offline; "latest version" message; light / dark; 360 px; phone (`p04-phone.ps1`). Claude records the result and fixes only what is reported.
- [x] T8 Cleanup + commit: `scripts/p09-commit.ps1` (copy of p08-commit WITHOUT the PDF allowance: blocks ANY new runtime dependency, spike step removed), `.\run.cmd build.ps1` (JS <= 800 KB), `npm audit --omit=dev` = 0, commit `P09: settings`.
- [x] T9 Phase end: PROGRESS.md (P09 DONE, P10 ACTIVE), `docs/done/P09-summary.md` (5 lines, with the JS number: run `js-size.ps1` before the commit script overwrites the log), the detailed `P10` file (Admin page: GitHub-token login, course editor, test editor; read SPEC D1-D7 head/tail only), rewrite NEXT.md, tell the owner in Gujarati.

## Acceptance (all must be true)
- Settings shows the cards in the order above; the profile is prefilled, saved encrypted, and survives reload and log out + login; email check by shape only; an empty form is allowed.
- Update app: offline, latest, new-version and error states all work and are announced to screen readers; "Update now" keeps local data; one service-worker registration; no new dependency.
- About shows the real version, MIT licence and the same data-policy wording as the privacy screen.
- All tests, lint, typecheck, boundary and layout checks green; no hex colours or raw durations in CSS; JS total <= 800 KB gzip; `npm audit --omit=dev` = 0.

## Log
- 2026-11-21 Claude: P09 plan written from SPEC C7 and the files on disk (SettingsScreen already has Theme, Fingerprint, PIN, Passphrase; profile, update and About are new). Next: T1.
- 2026-11-21 Claude: T1 done (`core/update/`: checkForUpdate, updateStore, useUpdateState, UpdateRegistrar; UpdatePrompt reads the store; DECISIONS Q23); check.ps1 CHECK OK, 88 files, 1186 tests. Next: T2 UpdateCard.
- 2026-11-21 Claude: T2 done (`modules/settings/UpdateCard.tsx/.css/.test.tsx`, 12 `update.*` i18n keys; card NOT yet placed in SettingsScreen = T5); check.ps1 CHECK OK, 89 files, 1201 tests. Next: T3 part 1 (profileInput).
- 2026-11-21 Claude: T3 part 1 done (`core/identity/profileInput.ts` + test hold `EMAIL_SHAPE` + `buildProfile`; `InfoScreen` imports them, its tests untouched); check.ps1 CHECK OK, 90 files, 1220 tests. T3 stays `[ ]` until ProfileCard. Next: T3 part 2 (ProfileCard).
- 2026-11-21 Claude: T3 done (`modules/settings/ProfileCard.tsx/.css/.test.tsx`, 9 `profile.*` i18n keys; card NOT yet in SettingsScreen = T5); check.ps1 CHECK OK, 91 files, 1236 tests. Next: T4 AboutCard.
- 2026-11-21 Claude: T4 done (`modules/settings/AboutCard.tsx/.css/.test.tsx`, 6 `about.*` i18n keys, version via `define` in `vite.config.ts` + `src/app-env.d.ts`; card NOT yet in SettingsScreen = T5); check.ps1 CHECK OK, 92 files, 1244 tests. Next: T5 SettingsScreen.
- 2026-11-21 Claude: T5 done (`SettingsScreen.tsx` now shows ProfileCard, Theme, Fingerprint, PIN, Passphrase + Log out, UpdateCard, AboutCard; new `SettingsScreen.order.test.tsx`: order, Log out placement, cards load on their own; old tests untouched); check.ps1 CHECK OK, 93 files, 1248 tests. Next: T6 layout test.
- 2026-11-21 Claude: T6 done (`SettingsScreen.layout.test.tsx` and `data-np-check` on the stack `div` in `SettingsScreen.tsx` were written by the previous session at 17:14 without a Log line; the test head was reviewed here); check.ps1 CHECK OK, 94 files, 1289 tests. Next: T7 `scripts/p09-preview.ps1` (owner visual check).
- 2026-11-21 Claude: recovered: audit close-out verified (0 problems, added `core/content/hash.test.ts`); check.ps1 CHECK OK, 95 files, 1295 tests; cleanup items (unused `fingerprint.*` / `toast.dismiss` keys, woff vs woff2) stay in NEXT for T8/P14. Next: T7 `scripts/p09-preview.ps1`.
- 2026-11-21 Claude: T7 done (`scripts/p09-preview.ps1` written, 11-step checklist; owner walked it on PC/phone: "all good", no fixes). Next: T8 cleanup + `scripts/p09-commit.ps1`.
- 2026-11-21 Claude: T8 done (`scripts/p09-commit.ps1` ran OK: deps unchanged, audit --omit=dev OK, `p09-quick.ps1` removed, commit ec44afa `P09: settings`; build.ps1 JS total 684.27 KB gzip, budget 800). Unused `fingerprint.*` / `toast.dismiss` keys NOT removed (optional, left for later). Next: T9 phase end.
- 2026-11-21 Claude: T9 done, P09 CLOSED (`docs/done/P09-summary.md`, PROGRESS.md P09 DONE / P10 ACTIVE, `docs/phases/P10-admin.md` written). Phase DONE.
