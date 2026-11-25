# PROGRESS — My native preparation

> Short index. Agents: read this + ONLY the ACTIVE phase file. Boot protocol is in `AGENTS.md`.

**Current ACTIVE phase:** P11 — `docs/phases/P11-publish-sync.md` (P10 closed with commits df6188c and d636564; see NEXT.md)
**Last updated:** 2026-11-23 by Claude

## Phases (web-first: PWA is the main product, Android APK is a later wrapper)
| ID  | Name                                              | Status   | File |
|-----|---------------------------------------------------|----------|------|
| P00 | Read spec, challenges, owner decisions            | DONE     | docs/done/P00-summary.md |
| P01 | Repo scaffold, modular structure, central wire, PWA shell, build script | DONE | docs/done/P01-summary.md |
| P02 | Design system: neumorphism tokens, light/dark, responsive, component gallery | DONE | docs/done/P02-summary.md |
| P03 | Content model: course/blocks/test schema, manifest, stable IDs, sample course, local DB | DONE | docs/done/P03-summary.md |
| P04 | Identity: 12-word key, register/login, onboarding screens, encrypted local store | DONE | docs/done/P04-summary.md |
| P05 | Home (courses) + 4 tiles + navigation + "not available" state | DONE | docs/done/P05-summary.md |
| P06 | E-book reader: blocks, font zoom, image pinch-zoom | DONE | docs/done/P06-summary.md |
| P07 | Test game: quiz engine, score, stars, animation, sound | DONE | docs/done/P07-summary.md |
| P08 | Report PDF (Gujarati shaping spike first), save/share with rename | DONE | docs/done/P08-summary.md |
| P09 | Settings: profile, passphrase info, update button, About | DONE | docs/done/P09-summary.md |
| P10 | Admin page: GitHub-token login, course editor, test editor (Word paste / ** / form), edit/delete | DONE | docs/done/P10-summary.md |
| P11 | Publish + sync via GitHub Pages, offline cache, update detection, deploy workflow | ACTIVE | docs/phases/P11-publish-sync.md |
| P12 | Encrypted backup/restore file | TODO | — |
| P13 | Android APK (Capacitor), signing, Play Store notes — needs JDK/SDK + phone | TODO (later) | — |
| P14 | QA, accessibility, performance, cleanup, release docs | TODO | — |

## Recent log (last 5 lines only; full logs live in phase files)
- 2026-11-20 Claude: P05 T1-T8 done: Home + Course screens, 6 routes, layout guard, owner visual check "all good", 678 tests green, build JS 165.40 KB gzip. P06 detailed plan written (docs/phases/P06-reader.md, 9 tasks). P05 closed (commit ccbb2ba on master). Next: P06 T1 (library decision).
- 2026-11-20 Claude: P06 closed (commit c030dc6, 762 tests, build JS 177.75 KB gzip, owner check OK on PC and phone). P07 is ACTIVE; its plan is being written.
- 2026-11-20 Claude: P07 closed (commit f18dbaa, 967 tests, build JS 183.61 KB gzip, owner check OK on PC and phone). P08 plan written after a web search (own canvas + JPEG + mini PDF writer; pdf-lib too big, pdfnative has no Gujarati). Next: P08 T1 (font).
- 2026-11-21 Claude: P09 closed (commit ec44afa, 1295 tests, build JS 684.27 KB gzip, budget 800 KB, owner check OK, `npm audit --omit=dev` = 0, no new dependency). Settings has Profile, Update app and About. P10 is ACTIVE; its plan is being written.
- 2026-11-23 Claude: P10 closed (commits df6188c and d636564; FULL check 173 files / 2863 tests at T12; build JS 722.51 KB gzip, budget 800 KB; `npm audit --omit=dev` = 0; no new runtime dependency). Admin editor with the new window (Q26), several tests per course (Q27) and the Colour theme (Q28). P11 is ACTIVE; its plan is written (13 tasks). Writing to GitHub (Publish / Unpublish) starts in P11.
