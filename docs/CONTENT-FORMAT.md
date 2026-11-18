# Content format (schema version 1)

Courses are plain JSON files served as static files (GitHub Pages later). No server is needed.
The rules below are enforced by `src/core/content/validate.ts`; `src/core/content/sampleContent.test.ts` checks the sample courses against them.

## Folder layout

```
public/content/
  manifest.json                     list of courses + SHA-256 of every file (made by a script)
  courses/<courseId>/
    course.json                     required: the card shown on Home
    overview.json                   optional: blocks
    content.json                    optional: blocks
    test.json                       optional: the test
    images/<name>.svg|webp|...      any images used by blocks, cover or test
```

- The folder name must equal the course id.
- A missing or empty optional file means "not available" in the app. It is never an error.
- A file with broken JSON or a broken rule is reported as invalid and not shown; the rest of the app keeps working.

## IDs

- Format: `<prefix>-<8 characters of a-z and 0-9>`. Prefixes: `crs-` course, `blk-` block, `qst-` question, `tst-` test. Example: `crs-k3j9x0qa`.
- IDs are stable: renaming, editing or reordering never changes an ID, and an ID is never reused. Progress and results are stored by ID.
- Create them with `newId(prefix)` in `src/core/content/ids.ts`. By hand, any unused 8 characters work.
- Block IDs are unique across `overview.json` and `content.json` of one course. Question IDs are unique inside one test.

## Paths

Paths in blocks, `cover` and test `image` are relative to the COURSE folder, for example `images/a.svg`.
They must not start with `/`, and must not contain `..`, `\`, `:` or empty parts (`a//b`).

## course.json

```json
{ "id": "crs-sci00001", "title": "Sample: General Science", "description": "optional text", "cover": "images/water-cycle.svg", "order": 1 }
```

`id` and `title` (non-empty) and `order` (a number, lower is shown first) are required. `description` and `cover` are optional.

## overview.json and content.json

```json
{ "blocks": [
  { "id": "blk-ov000001", "type": "title", "text": "Sample: General Science" },
  { "id": "blk-ov000002", "type": "subtitle", "text": "A short course" },
  { "id": "blk-ov000003", "type": "text", "text": "Some reading text." },
  { "id": "blk-ov000004", "type": "image", "src": "images/water-cycle.svg", "alt": "Water cycle drawing" }
] }
```

- `type` is `title`, `subtitle`, `text` or `image`. The order of the array is the display order.
- `title`, `subtitle`, `text` need a non-empty `text`.
- `image` needs `src` (a safe path, see above) and `alt` (a string, may be empty).
- `{ "blocks": [] }` is valid and means "not available".

## test.json

```json
{ "id": "tst-sci00001", "title": "Water cycle quiz", "questionsPerGame": 5,
  "questions": [
    { "id": "qst-q0000001", "text": "What turns liquid water into vapour?",
      "options": ["Condensation", "Evaporation", "Precipitation", "Collection"],
      "correctIndex": 1, "explanation": "optional text shown after the answer" }
] }
```

- `id`, `questionsPerGame` (whole number, 1 or more) and `questions` are required. `title` and `image` (a path) are optional.
- Every question has exactly 4 non-empty `options`, a `correctIndex` of 0 to 3, and a non-empty `text`. `explanation` is optional.
- Write the options in a fixed order; the app shuffles them when a game is played.
- `questionsPerGame` may be larger than the number of questions. A game asks `min(questionsPerGame, number of questions)`.
- A test with no questions means "not available".
- Stars (DECISIONS Q6) from percent = round(correct / asked x 100): 90+ = 5, 75+ = 4, 60+ = 3, 40+ = 2, otherwise 1.

## manifest.json

```json
{ "schemaVersion": 1, "generatedAt": "2026-11-18T08:36:43.751Z",
  "courses": [ { "id": "crs-sci00001", "title": "Sample: General Science", "version": 1,
                 "files": { "courses/crs-sci00001/course.json": "<64 hex characters>" } } ] }
```

- One entry per course folder. `files` lists EVERY file of that folder, as a path relative to `public/content/` (forward slashes), with the SHA-256 (lowercase hex) of the exact file bytes.
- `version` goes up by 1 only when a file or the title of that course changed. A new course starts at 1.
- `generatedAt` changes only when something changed, so running the script twice gives the same file.
- Never edit it by hand. After ANY content change run `.\run.cmd p03-manifest.ps1` (runs `scripts/make-manifest.mjs`).
  The publish flow in P10/P11 builds on the same script. The app uses the hashes to download only what changed.
- `.gitattributes` marks `public/content/**` as `-text`, so Git never changes line endings (that would change the hashes).

## Checking your content

Run `.\run.cmd check.ps1`. The test `sampleContent.test.ts` fails when a file is invalid, an image is missing, an ID is duplicated, or the manifest does not match the files.

## Where this lives in code

`src/core/content/`: `types.ts` (shapes), `validate.ts` (rules, path-based error messages), `ids.ts`, `hash.ts`, `scoring.ts`, `loader.ts` (fetch + validate, never throws).
