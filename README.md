# My Native Preparation

Exam-preparation app for students and teachers: read, practice, test. Local-first PWA (Android APK later).

- Stack: TypeScript, Vite, React, vite-plugin-pwa, Dexie, Zustand.
- Every feature is an isolated module in `src/modules/<name>/`; modules talk only through the wire in `src/core/wire/`.
- Check everything: `npm run check` (types, module boundaries, lint, tests).
- Build: `powershell -ExecutionPolicy Bypass -File scripts\build.ps1` (keeps only the newest build in `builds\`).
- Project plan and decisions: `PROGRESS.md`, `AGENTS.md`, `docs/`.
- License: Apache-2.0.
