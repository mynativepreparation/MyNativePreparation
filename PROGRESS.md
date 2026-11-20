# PROGRESS — My native preparation

> Short index. Agents: read this + ONLY the ACTIVE phase file. Boot protocol is in `AGENTS.md`.

**Current ACTIVE phase:** P06 — `docs/phases/P06-reader.md` (P05 closed with commit ccbb2ba; P06 plan written, next: T1 library decision; see NEXT.md)
**Last updated:** 2026-11-20 by Claude

## Phases (web-first: PWA is the main product, Android APK is a later wrapper)
| ID  | Name                                              | Status   | File |
|-----|---------------------------------------------------|----------|------|
| P00 | Read spec, challenges, owner decisions            | DONE     | docs/done/P00-summary.md |
| P01 | Repo scaffold, modular structure, central wire, PWA shell, build script | DONE | docs/done/P01-summary.md |
| P02 | Design system: neumorphism tokens, light/dark, responsive, component gallery | DONE | docs/done/P02-summary.md |
| P03 | Content model: course/blocks/test schema, manifest, stable IDs, sample course, local DB | DONE | docs/done/P03-summary.md |
| P04 | Identity: 12-word key, register/login, onboarding screens, encrypted local store | DONE | docs/done/P04-summary.md |
| P05 | Home (courses) + 4 tiles + navigation + "not available" state | DONE | docs/done/P05-summary.md |
| P06 | E-book reader: blocks, font zoom, image pinch-zoom | ACTIVE | docs/phases/P06-reader.md |
| P07 | Test game: quiz engine, score, stars, animation, sound | TODO | — |
| P08 | Report PDF (Gujarati shaping spike first), save/share with rename | TODO | — |
| P09 | Settings: profile, passphrase info, update button, About | TODO | — |
| P10 | Admin page: GitHub-token login, course editor, test editor (Word paste / ** / form), edit/delete | TODO | — |
| P11 | Publish + sync via GitHub Pages, offline cache, update detection, deploy workflow | TODO | — |
| P12 | Encrypted backup/restore file | TODO | — |
| P13 | Android APK (Capacitor), signing, Play Store notes — needs JDK/SDK + phone | TODO (later) | — |
| P14 | QA, accessibility, performance, cleanup, release docs | TODO | — |

## Recent log (last 5 lines only; full logs live in phase files)
- 2026-11-18 Claude: P03 closed (commit 835ce6a, 207 tests, build JS 105 KB gzip). P04 detailed plan written after web search (bip39 + WebCrypto); Q16 open with a default. Next: P04 T1 (install @scure/bip39 via script).
- 2026-11-19 Claude: P04 T12c (PIN lock) and T12d (fingerprint + PIN together: a good fingerprint opens the app alone, otherwise the PIN screen) done; owner tested on his phone. 634 tests green.
- 2026-11-20 Claude: P04 T14-T16 done: docs/IDENTITY.md, build JS 163.4 KB gzip, cleanup, `npm audit` 0 vulnerabilities, 632 tests green.
- 2026-11-20 Claude: P05 T1-T8 done: Home + Course screens, 6 routes, layout guard, owner visual check "all good", 678 tests green, build JS 165.40 KB gzip. P06 detailed plan written (docs/phases/P06-reader.md, 9 tasks). P05 closed (commit ccbb2ba on master). Next: P06 T1 (library decision).
