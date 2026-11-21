# AGENTS.md — Boot protocol for ANY coding agent (read this first, it is short)

Project: "My native preparation" — exam-prep app for students and teachers.
Owner talks Gujarati. **Reply to the owner in Gujarati only.** Code, comments, docs: English.

## Working method (FIXED, see DECISIONS Q15)
Only Claude + Windows PowerShell/cmd. NO IDE, NO other agent (Kilo, VSCodium, etc.).
- Claude creates/edits files with its Filesystem tools. Claude cannot run commands.
- Owner runs commands: `cd "D:\My Native Preperation"` then `.\run.cmd <script>.ps1` (full output goes to `logs\last-run.txt`).
- After the owner says "done", Claude reads `logs\last-run.txt` itself. Never ask the owner to copy-paste output.
- If a step needs a raw command (npm/git), put it in a script under `scripts\` and run it via `run.cmd`.
- Always give the owner copy-paste PowerShell lines with quoted paths.

## How to resume (works for any agent / IDE / login / machine)
0. Read `NEXT.md` (about 20 lines: exact state and next step). TOKEN SAVING: never read a big file (>10 KB) whole; use head/tail; never re-read files the Log says were reviewed.
   RECOVERY: the owner uses several Claude accounts one after another (a new one starts when tokens run out); sessions NEVER run in parallel. A file newer than NEXT.md (see `get_file_info`) is unfinished work of the cut-off session: read its head, compare with the phase tasks, finish/verify it (a newer `logs\last-run.txt` with CHECK OK = verified), log it as "recovered". Never stop to ask about it. Before a task that touches 2+ files write `IN PROGRESS: <task> - files: ...` in NEXT.md; remove it when done. The ready-to-paste start prompt is `START-PROMPT.txt`.
1. Read `PROGRESS.md` (short index). Find the phase marked `ACTIVE`.
2. Read ONLY that phase file in `docs/phases/`. Do NOT read other phase files or the whole spec.
   Read a section of `docs/SPEC.md` only if the phase file points you to it (by REQ id).
3. Continue from the first unchecked `[ ]` task. Do one task at a time.
4. After EVERY task: tick the box, and append one line to the phase file's `## Log`
   (date, agent/model name, what changed, what is next). This is how the next agent resumes.
5. If you stop, crash, or are unsure: the log + checkboxes must already be up to date.

## Rules
- Modular: one folder per screen/feature; features talk only through the central wire
  (registry/event bus). Changing one module must not break another.
- Small phases. Never start a phase that is not `ACTIVE`. Never skip the acceptance checks.
- Never commit secrets (keystore, tokens, passwords, .env). Put them in `.gitignore`.
- Ask the owner (in Gujarati) when a decision is missing — record the answer in `docs/DECISIONS.md`.
- Search the web for similar open-source projects/libraries before choosing one; note the choice
  and license in `docs/DECISIONS.md`.

## Phase end checklist (every phase)
1. All acceptance checks in the phase file pass (tests/lint/typecheck).
2. Remove junk: unused files, dead code, debug logs, temp folders.
3. Run the build script (`scripts/build.*` once it exists); fix build errors; save the new build
   in `builds/` and delete the previous build file.
4. Move a 5-line summary of the phase to `docs/done/` and set the phase to `DONE` in `PROGRESS.md`.
5. Mark the next phase `ACTIVE`, create its detailed file (just-in-time planning), tell the owner in Gujarati.
