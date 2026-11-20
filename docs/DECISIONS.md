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
| Q16 | **Login rule (owner, 2026-11-18):** the 12 words are needed only once at Register, on a new device (or cleared browser), and after an explicit **Log out**. A normal app open never asks for them: if the optional **fingerprint lock** (offered after Register, WebAuthn) is on, the app asks for the fingerprint; if it is off, the app opens directly. Log out (Settings, with a confirmation) deletes the saved key and the fingerprint credential but keeps the encrypted data on the device. The 12 words always remain the fallback. | DECIDED |

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
- @scure/bip39 (MIT, audited, tree-shakeable, signed releases): npm `latest` was 2.2.0 on socket.dev, while jsr.io showed 2.3.0 as published within hours (searched 2026-11-18, sources disagree) -> P04 T1 must run `npm view @scure/bip39 time --json` and install the newest version that is at least 14 days old, pinned exactly. API: `generateMnemonic(wordlist, 128)` = 12 words, `validateMnemonic`, `mnemonicToEntropy`; use the English wordlist only (non-English lists are officially discouraged by BIP39). Import from `@scure/bip39/wordlists/english.js`.
- WebCrypto guidance (Chrome "Encrypt data client-side with WebCrypto", searched 2026-11-18): AES-GCM with a fresh random 12-byte IV for EVERY encryption and never reuse an (iv, key) pair; use `additionalData` (AAD) to bind metadata so tampering is rejected; HKDF (`deriveKey`) with salt/info for domain separation; keep keys `extractable: false`; non-extractable CryptoKeys can be stored in IndexedDB by structured clone without exporting the bytes.
- Fingerprint on the web (searched 2026-11-18): WebAuthn with a platform authenticator gives fingerprint/face/screen-lock verification without exposing biometric data. Its `prf` extension can derive a secret from the authenticator, but support is uneven: Android with Google Password Manager is stable, desktop Chrome only with passkeys saved to Google Password Manager, Windows Hello historically has no hmac-secret (newer Windows 11 25H2 with Windows Password Manager is reported to work), iOS 18.0-18.3 had a data-loss bug. A PRF-derived key changes if the authenticator or site address changes, so it must only WRAP a copy of the key, never replace the 12 words. Needs HTTPS or localhost.
- WebAuthn `prf` usage (searched 2026-11-18 for P04 T12a; sources: W3C web-platform-tests `createcredential-prf`, Yubico "Developer's Guide to PRF", a dev.to passkey article): (1) at enrol time call `navigator.credentials.create` with `extensions: { prf: {} }` and read `credential.getClientExtensionResults().prf?.enabled`; `true` = this authenticator can do PRF, missing/false = gate level. (2) To get the secret call `navigator.credentials.get` with `userVerification: 'required'` and `extensions: { prf: { eval: { first: SALT } } }`, then read `getClientExtensionResults().prf?.results?.first` (a 32-byte ArrayBuffer in the browser). (3) Evaluating at creation time (`prf.eval` in `create`) is defined by WebAuthn but CTAP2 security keys cannot do it (hmac-secret), so some providers return `results` on create and some do not: never depend on it, do a `get` after `create` (one more prompt). (4) Same site address (RP ID) + same credential + same salt = same 32 bytes, so a changed address or a new credential gives a different key, which is why PRF only wraps a copy and the 12 words stay the fallback. (5) Use the 32 bytes as an HKDF input (`importKey('raw', bytes, 'HKDF', false, ['deriveKey'])`), never directly as the AES key. Our own fixed salt for this app: `np/prf/v1`.
- WebAuthn `prf` update (re-checked 2026-11-18 at the start of P04 T12a; sources: Corbado PRF support pages updated Aug-Oct 2026, a Feb 2026 article on PRF risks, W3C WebAuthn PRF examples): the API shape above is unchanged and still correct. Support has improved but stays uneven, so the two levels (PRF / gate) and the runtime check `prf.enabled` stay mandatory. Android: PRF works with Google Password Manager passkeys, but not with every third-party provider (e.g. Samsung Pass gave no PRF on create in Corbado's Aug 2026 tests). Windows: Windows Hello returns PRF only after the Feb 2026 Windows 11 update (24H2 / 25H2) and with Chrome 147+ or Firefox 148+; older builds give no PRF, so they get the gate level. iOS/iPadOS 18.0-18.3 had a PRF data-loss bug (fixed in 18.4+). The same site address, credential and salt give the same bytes, but a lost or reset passkey gives different bytes: that is the known risk of PRF-derived keys, and why our PRF output only WRAPS a copy of the store key and the 12 words stay the fallback. The code also tries `PublicKeyCredential.getClientCapabilities()` (key `extension:prf`) as an optional early hint; this was NOT re-verified by this search, so `supportsPrf()` is only a hint and `enroll()` reporting `prf.enabled` is the truth. Decision for T12a: keep the design as written; no change needed.
- Dexie: npm `dexie` is on the 4.4.x line (4.4.7 seen 2026-11-18), Apache-2.0, supports PWAs and Capacitor. Tests will use `fake-indexeddb` (MIT, dev only). (P03)

## Decisions made by Claude during phases
- P02: success color (light) changed `#1b7a43` -> `#17693a` because the original gave only 4.39:1 (needs 4.5:1).
- P03: theme choice stays in `localStorage` (`np.theme`), NOT Dexie, because it must be read synchronously before first paint (no flash). All other local data goes to Dexie.
- P03: content validators are hand-written (no schema library) to keep the bundle small. IDs: `crs-/blk-/qst-/tst-` + 8 chars. Content files live in `public/content/` with a hashed `manifest.json`.
- P04 (planned): 12 words = BIP39 English, 128-bit entropy. Keys come from `mnemonicToEntropy` -> HKDF-SHA-256 (fixed app salt, one `info` string per purpose: store, backup) -> AES-256-GCM, non-extractable. The 12 words themselves are NEVER stored anywhere (not in Dexie, localStorage, logs or URLs); only a key-check blob (an encrypted constant) is stored so a wrong key is detected. HKDF (not a slow password KDF) is correct here because the secret is 128 random bits, not a human-chosen password.
- P04 (planned): encrypted local store = every row's VALUE is an AES-GCM envelope; primary keys and index fields (course/block/test ids, timestamps) stay plain so Dexie can query them. The privacy text must say this honestly. Dexie schema v2 replaces v1; v1 rows are dropped in the upgrade because nothing has been released yet (deploy is P11).
- P04 (planned): fingerprint lock is optional and has two honest levels: PRF level (store key wrapped with a PRF-derived key, real protection) and gate level (fingerprint only guards opening the app; the UI says so). The 12 words always unlock. Tasks T12a/T12b in `docs/phases/P04-identity.md`.
- P04 (planned): honest limit to state in docs and privacy text: with "stay unlocked" (Q16) the key sits in the same browser profile as the data, so the encryption protects the backup file and stored files, not against someone who can open the unlocked app on this device.
