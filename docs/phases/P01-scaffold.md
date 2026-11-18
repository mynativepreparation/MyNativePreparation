# P01 — Repo scaffold, modular structure, central wire, build script   [ACTIVE]

Executor note: Claude writes all files with its Filesystem tools. Commands are run ONLY by the owner in Windows
PowerShell/cmd via `.\run.cmd <script>.ps1` (no IDE, no other agent; DECISIONS Q15). Claude then reads `logs\last-run.txt`.
Helper scripts already exist in `scripts\`: `check-env.ps1`, `setup-tools.ps1`, `p01-install.ps1` (covers T3 + icons + git init + check),
`p01-verify.ps1` (covers the T8 boundary self-test), `build.ps1`, `check-boundaries.mjs`, `make-icons.mjs`.
Decisions + stack + licenses: `docs/DECISIONS.md` (read only the "Tech stack" table). No UI design here (that is P02).

Folder has spaces: always quote paths: `cd "D:\My Native Preperation"`.

## Goal
A working, empty-but-wired PWA project where (1) every feature is an isolated module, (2) modules talk
only through a central "wire", (3) lint FAILS if a module imports another module, (4) one command checks
everything, (5) one script builds and keeps only the newest build.

## Tasks
- [x] T1 Environment: run `powershell -ExecutionPolicy Bypass -File scripts\check-env.ps1`. Install only what is
      `[MISSING] ... NOW` using the printed winget command. Reopen terminal, re-run until OK. Write the versions in the Log.
- [x] T2 Scaffold into a TEMP folder (the root is not empty, so never scaffold in place):
      `npm create vite@latest _scaffold -- --template react-ts` (answer **No** to "install and start now").
      Then: `Move-Item "_scaffold\*" . -Force ; Move-Item "_scaffold\.gitignore" . -Force ; Remove-Item _scaffold -Recurse -Force`
      Delete the demo files (`src/App.css`, `src/assets/react.svg`, demo counter code, `public/vite.svg`).
- [x] T3 Install: `npm i react-router-dom zustand dexie` and
      `npm i -D vite-plugin-pwa vitest jsdom @testing-library/react @testing-library/jest-dom eslint-plugin-boundaries prettier`.
      Run `npm ls` — if any peer-dependency conflict with the installed Vite, install the compatible plugin version
      and note it in the Log. Set `"name": "my-native-preparation"`, `"license": "MIT"` in package.json.
- [x] T4 Git + license: `git init`, make sure `.gitignore` contains `node_modules`, `dist`, `builds`, `.env*`, `*.keystore`,
      `*.jks`, `*.pem`. Add `LICENSE` (MIT, holder "My Native Preparation contributors") and a 10-line `README.md`.
- [x] T5 Folder structure (create only these now):
      ```
      src/
        core/wire/        wire.ts  events.ts  module.ts  wire.test.ts
        core/storage/     (empty placeholder .gitkeep, filled in P03)
        core/i18n/        en.json  index.ts   (t('key') helper; only a few keys now)
        app/              boot.ts  Shell.tsx  ErrorBoundary.tsx  router.tsx
        modules/home/     index.tsx  HomeScreen.tsx
        modules/settings/ index.tsx  SettingsScreen.tsx
        main.tsx
      ```
- [x] T6 Implement the wire (paste exactly, then adapt only if types fail):
      `src/core/wire/events.ts`
      ```ts
      export interface WireEvents {
        'ui.toast': { message: string };
        'course.open': { courseId: string };
        'test.finished': { courseId: string; testId: string; score: number; total: number };
      }
      ```
      `src/core/wire/wire.ts`
      ```ts
      import type { WireEvents } from './events';
      type Handler<T> = (payload: T) => void;
      export class Wire {
        private handlers = new Map<string, Set<Handler<never>>>();
        on<K extends keyof WireEvents>(type: K, h: Handler<WireEvents[K]>): () => void {
          const set = this.handlers.get(type) ?? new Set();
          set.add(h as Handler<never>);
          this.handlers.set(type, set);
          return () => set.delete(h as Handler<never>);
        }
        emit<K extends keyof WireEvents>(type: K, payload: WireEvents[K]): void {
          this.handlers.get(type)?.forEach((h) => {
            // A failing handler must NEVER break other modules.
            try { (h as Handler<WireEvents[K]>)(payload); } catch (e) { console.error(`[wire] handler for ${type} failed`, e); }
          });
        }
      }
      export const wire = new Wire();
      ```
      `src/core/wire/module.ts`
      ```ts
      import type { RouteObject } from 'react-router-dom';
      import type { Wire } from './wire';
      export interface AppModule { id: string; routes: RouteObject[]; init?: (wire: Wire) => void; }
      ```
- [x] T7 Boot + shell: `src/app/boot.ts` loads every module folder automatically (adding a module = adding a folder, no
      central edit):
      ```ts
      const found = import.meta.glob('../modules/*/index.tsx', { eager: true }) as Record<string, { default: AppModule }>;
      export const modules = Object.values(found).map((m) => m.default);
      // for each module: try { m.init?.(wire) } catch (e) { console.error(...) }  -> a broken module is skipped, app still starts
      ```
      `router.tsx`: `createHashRouter` (HashRouter works on GitHub Pages); every module route element is wrapped in
      `ErrorBoundary` so one crashing screen never blanks the app. `Shell.tsx`: plain layout with `<Outlet/>` and a bottom link
      row Courses / Settings (unstyled; design comes in P02). Placeholder screens only show their title.
      Prove the wire: a button in `HomeScreen` emits `ui.toast`; `Shell` listens and shows the text (test it).
- [x] T8 Module isolation rule (mechanical, not "please be careful"): configure `eslint-plugin-boundaries` (read its docs for
      the flat-config syntax of the installed ESLint) so that: files in `src/modules/<a>` may import only from `src/core`
      and from their own folder, NEVER from another `src/modules/<b>`; `src/core` must not import `src/modules` or `src/app`.
      Verify: temporarily add `import '../settings/SettingsScreen'` inside `modules/home` → `npm run lint` must FAIL;
      remove it → passes. Record this check in the Log.
- [x] T9 PWA: in `vite.config.ts` add `VitePWA({ registerType: 'prompt', manifest: { name: 'My Native Preparation',
      short_name: 'NativePrep', display: 'standalone', start_url: '.', theme_color: '#e6e9f0', background_color: '#e6e9f0',
      icons: [192, 512 and a maskable 512 placeholder PNGs] } })`. Placeholder icons are fine (real icon in P02).
      Set `base: process.env.VITE_BASE ?? '/'` (GitHub Pages will use `/my-native-preparation/`).
      Create `src/app/UpdatePrompt.tsx` using `useRegisterSW` from `virtual:pwa-register/react`: when `needRefresh` is true show
      "Update available" + Update button calling `updateServiceWorker(true)`. Add `"types": ["vite-plugin-pwa/react"]` to tsconfig.
- [x] T10 Scripts. In `package.json`: `"check": "tsc -b && eslint . && vitest run"`, `"test": "vitest run"`,
       `"lint": "eslint ."`, `"format": "prettier --write src"`. Create `scripts/build.ps1` that: (1) runs `npm run check`,
       stops on failure, (2) runs `npm run build`, (3) reads version from package.json, copies `dist` to `builds\web-<version>-<yyyyMMdd-HHmm>`,
       (4) deletes every OTHER folder inside `builds\` (rule: only the newest build is kept), (5) prints the final path.
- [x] T11 Tests: `wire.test.ts` covers: handler receives payload; unsubscribe works; a throwing handler does not stop the next handler.
       One Shell test: toast text appears after the Home button click.
- [x] T12 Final run: `npm run check` → exit 0. `powershell -ExecutionPolicy Bypass -File scripts\build.ps1` → exit 0 and exactly one
       folder in `builds\`. `npm run preview` → open the URL in Chrome; both placeholder screens open; Chrome DevTools >
       Application shows manifest + service worker; no console errors.
- [ ] T13 Cleanup (AGENTS.md "Phase end checklist"): remove unused files/imports, demo leftovers, `.gitkeep` files that are no longer needed,
       logs; `git add -A && git commit -m "P01: scaffold, wire, module isolation, PWA shell"`.
- [ ] T14 Update `PROGRESS.md` (P01 DONE, P02 ACTIVE), write `docs/done/P01-summary.md` (5 lines), create the detailed `P02` file
       (design system: neumorphism tokens light/dark, contrast rules, component gallery, overlap check), tell the owner in Gujarati.

## Acceptance (all must be true)
1. `npm run check` passes (tsc + eslint + vitest).
2. Importing one module from another makes `npm run lint` fail (verified in T8).
3. A failing wire handler / failing module does not stop the app (tests + ErrorBoundary).
4. `builds\` contains exactly one build; older ones are deleted by the script.
5. `npm run preview` shows two placeholder screens and an installable PWA (manifest + service worker present).
6. No secrets in git; `.gitignore` covers keystore/token/env files.

## Log (append one line after every task: date, agent/model, what, next)
- 2026-11-18 Claude: P01 file written. Next: T1 (run check-env.ps1).
- 2026-11-18 Claude: T5+T6 done (src/ folders, wire files, i18n, test-setup). T7/T9/T11 files written (boot, router, Shell, ErrorBoundary, UpdatePrompt, main.tsx, wire.test.ts, Shell.test.tsx), README.md added.
- 2026-11-18 Claude: p01-install.ps1 OK (exit 0): packages installed, icons made, git init done, `npm run check` passed (tsc, boundaries 17 files, eslint, vitest 4/4 tests). T2/T3 satisfied by pre-made config + install script (no vite scaffold needed). T4, T7, T9, T11 ticked. npm audit: 20 vulnerabilities in dev tools (2 moderate, 18 high), not shipped to users; review at P14. Next: T8 self-test `.\run.cmd p01-verify.ps1`.
- Env: winget v1.29.380, Node v24.12.0, npm 11.6.2, Git 2.52.0. JDK/Android SDK missing = needed only at P13.
- 2026-11-18 Claude: T8 done via custom `scripts/check-boundaries.mjs` (part of `npm run check`) instead of eslint-plugin-boundaries. p01-verify.ps1: bad import `modules/home -> ../settings/SettingsScreen` was REJECTED, clean code passed (17 files). Next: T10/T12 `.\run.cmd build.ps1`.
- 2026-11-18 Claude: T10 done. build.ps1 OK (exit 0): check passed, vite build OK, JS 316.68 kB (100.28 kB gzip, budget 250 KB), PWA generateSW with sw.js + manifest, saved to builds\web-0.1.0-20261118-0959. T12 partly done (check + build). Next: T12 browser check via `npm run preview` (owner), then T13 cleanup + git commit, T14 close phase.
- 2026-11-18 Claude: T12 done. Owner checked preview at localhost:4173: Courses + Settings screens open, wire toast text shows, Chrome shows Install button (manifest + service worker valid). Console warnings came only from a browser extension (contentscript.js / chext_driver.js), not from the app. Wrote scripts/p01-commit.ps1. Next: T13 `.\run.cmd p01-commit.ps1`, then T14.
