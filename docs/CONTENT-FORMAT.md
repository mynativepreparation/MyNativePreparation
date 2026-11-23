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
    test.json                       optional, the OLD single test (still read; the editor no longer writes it)
    tests/<tst-id>.json             optional: one file per test, any number (P10 T11r)
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
- `title`, `subtitle` and `text` blocks may have an optional `font`: `sans` (the default when missing), `serif`, `humanist` or one of the 13 more fonts of P10 T11p (the full list of 16 ids with their families is in the table "Font ids" below). Any other value is an error; an `image` block must not have a `font`. Old courses without `font` stay valid and look the same.
- `image` needs `src` (a safe path, see above) and `alt` (a string, may be empty).
- `image` may also have `align` (`left`, `center` or `right`), `width` (a whole number, percent of the text column, 10 to 100) and `height` (a whole number, percent of the picture's natural height at that width, 10 to 300). All three are optional; a missing one means "as before" (centred, natural size, proportions kept). With `left` or `right` the next text flows beside the picture. A wrong value is an error with a path (for example `blocks[0].width`). Text blocks must not have these fields. Old courses stay valid and look the same.
- `{ "blocks": [] }` is valid and means "not available".
- A chapter has no field of its own: it is a `title` block plus the blocks after it, up to the next `title` block. The editor groups and joins them again without changing any ID.

### Inline marks inside `text` (parsed by `src/core/content/inline.ts`)

The `text` string stays plain text; these marks are read by the app when it shows the block:

| You write | You get |
|---|---|
| `**bold**` | bold |
| `*italic*` | italic |
| `__underline__` | underlined |
| `==highlight==` | highlighted |
| a line starting with `- ` | a bullet (lines in a row make one list) |
| `\*` `\_` `\=` `\-` `\{` `\}` `\|` `\\` | that character shown as plain text |

- Marks can be combined and nested (`***both***`, `**bold with *italic* inside**`).
- A mark opens only when the next character is not a space and closes only when the previous character is not a space, so `2 * 3 * 4` stays plain.
- A mark that is never closed, an empty pair (`****`), a single `_` or a single `=` stays plain text. A mark never reaches into the next line.
- Every non-empty line is its own paragraph; empty lines only separate. Both `\n` and `\r\n` work.
- Nothing here changes the validation: a text with marks is just a non-empty string.

### Styles: colour, font, size, boxes (format v1.1, DECISIONS Q26)

Still plain text inside `text`; the ids come from ONE catalog, `src/core/content/richStyles.ts`.

**A span** changes the look of the text inside it: `{c=red;f=serif;x=l-circle-dark;s=l|your text}`. Write the keys you need, in any order, separated by `;`, then `|`, the text, and `}`.

| Key | Meaning | Ids |
|---|---|---|
| `c` | text colour (every colour has a light and a dark value in the app) | `red` `orange` `brown` `green` `teal` `blue` `purple` `pink` |
| `f` | font for these words (beats the `font` of the block) | the 16 ids of "Font ids" below, for example `sans` `serif` `humanist` `inter` `kalam` |
| `s` | text size (no `s` = normal) | `s` `l` `xl` `xxl` |
| `x` | a box. Letter boxes draw a box around EACH letter, word boxes draw ONE box around the whole marked text | letter: `l-circle-light` `l-circle-dark` `l-square-light` `l-square-dark` `l-diamond-light` `l-diamond-dark` `l-round-light` `l-round-dark`; word: `w-box-light` `w-box-dark` `w-pill-light` `w-pill-dark` `w-dashed` `w-double` `w-underline` |

**Font ids** (the same 16 ids work for the `font` of a block and for `f=` in a span; the list lives in `FONT_IDS` of `richStyles.ts` and `FONT_KINDS` of `types.ts`, `fontKinds.test.ts` keeps them equal). The font files are self-hosted woff2 files in `public/fonts/` and are downloaded only when a text uses them.

| Language | Ids and families |
|---|---|
| Gujarati | `sans` Noto Sans Gujarati, `serif` Noto Serif Gujarati, `humanist` Hind Vadodara, `baloo-bhai` Baloo Bhai 2, `mukta-vaani` Mukta Vaani, `rasa` Rasa, `kumar-one` Kumar One (a display font, best for titles) |
| Hindi and Sanskrit (Devanagari) | `noto-sans-devanagari` Noto Sans Devanagari, `noto-serif-devanagari` Noto Serif Devanagari, `martel` Martel, `kalam` Kalam |
| English | `inter` Inter, `merriweather` Merriweather, `lexend` Lexend, `atkinson` Atkinson Hyperlegible, `caveat` Caveat |

Every font is drawn together with Noto Sans Gujarati, so Gujarati letters still show when a text mixes scripts.

**A paragraph box** is a prefix at the very start of a line: `{{x=p-dashed}}the whole line is in a box`. Ids: `p-box-light` `p-box-dark` `p-round` `p-dashed` `p-double` `p-leftbar` `p-shadow`. In front of a bullet (`{{x=p-round}}- item`) it starts a NEW list with that box; the `- ` lines after it without a prefix belong to that list.

- Spans can be nested; for a key set twice the inner span wins (`{c=red|a {c=blue|b} c}`: only `b` is blue). They combine freely with the marks above, even when they overlap without nesting.
- A span counts only when every key and id is in the catalog, no key is repeated, and a closing `}` follows. Otherwise EVERY character of it stays plain text, nothing is lost or hidden. The same holds for an empty span (`{c=red|}`), a lone `}`, an unknown paragraph-box id, and a prefix that is not at the very start of the line. A paragraph-box id is not allowed inside a span.
- Neighbouring text with the same word box id is drawn as one box.
- A prefix with nothing after it is dropped like an empty line.
- New escapes: `\{`, `\}` and `\|` show the character as plain text. (Before v1.1 a backslash in front of these stayed visible; no existing course uses it.)
- The validator does not look inside `text`, so an old app reading a v1.1 text would simply show the braces: the format only grows, it never changes the meaning of old files.

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

## tests/<tst-id>.json (several tests per course, DECISIONS Q27)

A course may have any number of tests. Each test is ONE file, `tests/<tst-id>.json` inside the course folder, with exactly the shape of `test.json` above. The file name must be the test id (`tests/tst-sci00001.json` holds the test with `"id": "tst-sci00001"`); a mismatch, or the same test id twice in one course, is an error.

- The editor writes only `tests/<id>.json` (a test without questions is not written) and no longer writes `test.json`. Old courses that still have `test.json` stay valid: it counts as one test and is read before the files in `tests/`.
- The manifest `files` lists `courses/<id>/tests/<tst-id>.json` like every other file. `testFiles.ts` has the helpers (`testFilePath`, `testIdFromPath`, `testFilesOf`) and `loader.ts` `loadCourseTests(courseId, manifestKeys)` reads all tests of a course. `loadCourse().test` still gives only the old `test.json`; the user app moves to the list in T11t.
- Pictures of a test (`image`) are relative to the course folder, like everywhere else.

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

`src/core/content/`: `types.ts` (shapes), `validate.ts` (rules, path-based error messages), `ids.ts`, `hash.ts`, `scoring.ts`, `inline.ts` (the text marks, spans and paragraph boxes), `richStyles.ts` (the catalog of style ids), `testFiles.ts` (where the test files of a course live), `loader.ts` (fetch + validate, never throws; `loadCourseTests` reads all tests of a course).
