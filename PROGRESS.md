# PROGRESS — My native preparation

> Short index. Agents: read this + ONLY the ACTIVE phase file. Boot protocol is in `AGENTS.md`.

**Current ACTIVE phase:** P04 — `docs/phases/P04-identity.md` (T1-T12a done and verified, 491 tests green; T12b fixes in status.ts/session.ts written, waiting for check.ps1; then fingerprint screen + Settings toggle; see NEXT.md)
**Last updated:** 2026-11-18 by Claude

## Phases (web-first: PWA is the main product, Android APK is a later wrapper)
| ID  | Name                                              | Status   | File |
|-----|---------------------------------------------------|----------|------|
| P00 | Read spec, challenges, owner decisions            | DONE     | docs/done/P00-summary.md |
| P01 | Repo scaffold, modular structure, central wire, PWA shell, build script | DONE | docs/done/P01-summary.md |
| P02 | Design system: neumorphism tokens, light/dark, responsive, component gallery | DONE | docs/done/P02-summary.md |
| P03 | Content model: course/blocks/test schema, manifest, stable IDs, sample course, local DB | DONE | docs/done/P03-summary.md |
| P04 | Identity: 12-word key, register/login, onboarding screens, encrypted local store | ACTIVE | docs/phases/P04-identity.md |
| P05 | Home (courses) + 4 tiles + navigation + "not available" state | TODO | — |
| P06 | E-book reader: blocks, font zoom, image pinch-zoom | TODO | — |
| P07 | Test game: quiz engine, score, stars, animation, sound | TODO | — |
| P08 | Report PDF (Gujarati shaping spike first), save/share with rename | TODO | — |
| P09 | Settings: profile, passphrase info, update button, About | TODO | — |
| P10 | Admin page: GitHub-token login, course editor, test editor (Word paste / ** / form), edit/delete | TODO | — |
| P11 | Publish + sync via GitHub Pages, offline cache, update detection, deploy workflow | TODO | — |
| P12 | Encrypted backup/restore file | TODO | — |
| P13 | Android APK (Capacitor), signing, Play Store notes — needs JDK/SDK + phone | TODO (later) | — |
| P14 | QA, accessibility, performance, cleanup, release docs | TODO | — |

## Recent log (last 5 lines only; full logs live in phase files)
- 2026-11-18 Claude: P02 T1-T10 done and verified (52 tests). T11 owner visual check started (scripts/p02-preview.ps1).
- 2026-11-18 Claude: P02 closed (commit 714719d, build JS 105 KB gzip). P03 detailed plan written. Next: P03 T1 (install dexie via script).
- 2026-11-18 Claude: P03 closed (commit 835ce6a, 207 tests, build JS 105 KB gzip). P04 detailed plan written after web search (bip39 + WebCrypto); Q16 open with a default. Next: P04 T1 (install @scure/bip39 via script).
- 2026-11-18 Claude: T11 verified (431 tests, 29 files). T12 files (PassphraseCard, Log out, Settings placement) written, not yet run. Next: owner runs `.\run.cmd check.ps1`; if green, tick T12 and start T12a (fingerprint logic).
- 2026-11-18 Claude: T12 verified (440 tests, 30 files). T12a files (core/identity/biometric.ts + biometric.test.ts) found on disk and reviewed; WebAuthn `prf` web search noted in DECISIONS. Not yet run. Next: owner runs `.\run.cmd check.ps1`; if green, tick T12a and start T12b (two known gaps are written into the T12b task).
