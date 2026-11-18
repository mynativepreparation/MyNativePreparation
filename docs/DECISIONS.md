# DECISIONS — questions, answers, choices

Status: `DECIDED` = owner confirmed (or delegated to Claude) · `OPEN` = waiting for owner.
Agents: act only on DECIDED items; ask the owner (in Gujarati) about OPEN ones.

## Owner decisions (answered 2026-11-18)
| ID  | Decision | Status |
|-----|----------|--------|
| Q1  | **Web app (PWA) first**, same code later wrapped as Android APK (Capacitor). One codebase for Android/iOS/PC. | DECIDED |
| Q2  | Backup = **encrypted backup file** that the user saves/shares themselves (Drive, WhatsApp, pen drive). No own server. Optional Google Drive later. | DECIDED |
| Q3  | Course content lives in a **public GitHub repo**, served by GitHub Pages. All content public. | DECIDED |
| Q4  | Developer/Admin login = **GitHub fine-grained token** (access to this one repo only), stored encrypted on the device; **separate Admin page** (`/admin/`), not inside user screens. 24-word key = optional hardening later. | DECIDED |
| Q5  | Test input method **delegated to Claude** → Admin "Test editor" with 3 ways: (a) paste from Word (HTML clipboard keeps bold → bold option = correct), (b) plain text with `**correct option**` marker, (c) simple form with a "correct" radio button. Format: `Q1. text` / `A) ..` `B) **..**` `C) ..` `D) ..` / optional `Explanation: ..`. Stored as JSON with a `correctIndex`. | DECIDED |
| Q6  | Test rules: no timer, no negative marking, options shuffled, optional per-question explanation shown after answering, stars by %: 90+=5, 75+=4, 60+=3, 40+=2, else 1. Number of questions per game set by developer. | DECIDED |
| Q7  | **UI language: English** (i18n-ready: `en` now, `gu` file later; the Gujarati "not available" message from SPEC C3 goes into `gu` later). Course content can be any language. | DECIDED |
| Q8  | Teacher features **delegated to Claude** → v1: teachers use the same app. Bridge without a server: students can share their PDF report (e.g. WhatsApp) with a teacher. A teacher who wants to publish own courses can be added as GitHub collaborator + use Admin page with own token. | DECIDED |
| Q9  | Report: optional name; per course: % content read, tests taken, scores, stars, dates. | DECIDED |
| Q10 | Environment: owner says nothing installed → run `scripts/check-env.ps1` first, install only what is missing (Node.js LTS, Git now; Java/Android SDK only at P13). Test device: web first, so a PC browser is enough for now. | DECIDED |
| Q11 | **Delegated to Claude**: License **MIT**; repo name `my-native-preparation`; app name "My Native Preparation" (short "NativePrep"); Android package id (needed only at P13, permanent once published) `io.github.<github-username>.mynativeprep`. GitHub username is needed when the repo is created (P11) — placeholder until then. | DECIDED |
| Q12 | Start **fresh** in this folder. | DECIDED |
| Q13 | Free CC0/open sounds + graphics and original animations are OK (no Candy Crush assets). | DECIDED |
| Q14 | Targets: Android 8+ / modern Chrome, 2 GB RAM, APK under ~25 MB; web first-load budget: JS ≤ 250 KB gzip for the user app. | DECIDED |
| Q15 | **Working method (fixed): Claude + Windows PowerShell/cmd ONLY.** No IDE, no other coding agent (no Kilo, no VSCodium). Claude creates/edits all files through its Filesystem tools. Claude cannot run commands, so the owner runs them with `.\run.cmd <script>` (output is saved to `logs\last-run.txt`) and Claude reads that log itself. Claude must give the owner copy-paste PowerShell lines, with quoted paths. | DECIDED |

Still to ask the owner later (not blocking): does the owner have an Android phone for testing the installed PWA and later the APK (and which Android version)?

## Tech stack (chosen by Claude after web research; agent must confirm versions at P01 start)
| Area | Choice | License | Why |
|------|--------|---------|-----|
| Language/build | TypeScript (strict) + Vite + React (19.x) | MIT | Most known by AI coders; fast |
| PWA/offline/update | `vite-plugin-pwa` with `registerType: 'prompt'` | MIT | Gives "update available → Update app" button (SPEC C7) instead of silent swaps |
| Routing | `react-router-dom` with **HashRouter** | MIT | Works on GitHub Pages without 404 rewrites |
| UI state | `zustand` | MIT | Tiny |
| Local DB | `dexie` (IndexedDB) | Apache-2.0 | Easy queries for progress/attempts |
| 12-word key | `@scure/bip39` + browser WebCrypto (HKDF → AES-256-GCM) | MIT | Audited, tiny, no custom crypto |
| Pinch zoom (later) | `@use-gesture/react` (text size), `react-zoom-pan-pinch` (images) | MIT | |
| Sound/cheer (later) | `howler`, `canvas-confetti`, CSS animations (Lottie only if small) | MIT/ISC | Light for low-end phones |
| Icons | `lucide-react` | ISC | |
| Tests/lint | Vitest, Testing Library, ESLint (+ module-boundary rule), Prettier | MIT | |
| GitHub publish (P10/P11) | `@octokit/core` (REST + Git Data API, CORS works from browser) | MIT | Admin page commits content to the repo |
| Gujarati PDF (P08) | **Spike first**: (a) HTML→image→PDF (browser does the Gujarati shaping, safest), (b) pdfmake with Noto Sans Gujarati, (c) print CSS. Pick whichever shows conjuncts correctly. | – | Correct Gujarati shaping needs a HarfBuzz-level engine; many JS PDF libs don't have one |

## Challenges (explained to owner in chat) and how they are handled
1. No server, yet content must reach everyone → static hosting on GitHub Pages (Q3).
2. Privacy wording must be true: "AES-256-GCM on device, key derived from the 12 words, no account, no server, no analytics; update check contacts GitHub". Do NOT write "military grade" / "0 leak".
3. Dev login security = GitHub write permission (token), not a password fingerprint in a public repo (Q4).
4. Bold in .txt impossible → Q5 solution.
5. Gujarati PDF → P08 spike.
6. Neumorphism low contrast → keep WCAG AA text/button contrast; add subtle borders/icons (P02).
7. Game effects vs low-end phones → 2D, performance budget (Q14).
8. Stable IDs for course/block/question; manifest with version/hash (P03).
9. Images: WebP, size limits, lazy-load, offline cache.
10. Keystore (P13) never lost, never committed.
11. Sideloaded APK always needs "Install unknown apps" once; PWA/Play Store avoid it.
12. Free AI coder + big spec → tiny tasks, acceptance checks, tests, resumable logs.
13. Correct answers are inside the downloaded test JSON, so a technical person could read them. Acceptable for exam-preparation practice.

## Verified facts (searched 2026-11-18)
- Google Play: personal developer accounts created after 2023-11-13 need a closed test with 12 testers for 14 continuous days before production; organization accounts exempt.
- Android developer verification: enforcement began 2026-09-30 in Brazil, Indonesia, Singapore, Thailand; global in 2027; no India date published as of 2026-11-07. APKs outside Play will need a verified developer once it reaches India → register package name early; PWA is unaffected.
- vite-plugin-pwa: `registerType: 'prompt'` is the mode that lets the app ask the user before swapping to a new version; confirm Vite/plugin version compatibility with `npm ls` at P01.
