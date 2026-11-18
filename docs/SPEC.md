# SPEC — My native preparation (organized from the owner's Gujarati prompt)

Read only the section you are pointed to by a REQ id. Owner's original wording is authoritative;
if this file and the owner's prompt disagree, ask the owner.

## A. Product
- A1: Exam-preparation app for the whole education world; mainly students and teachers.
- A2: Fully modular. Updating any one function/file must not break anything else. One folder
  (and sub-folders) per screen/menu. Everything joined by one universal central "wire" system.
- A3: Fully open source. Signed builds. Installing for testing must not hit permission/install
  problems. App must update in place (no uninstall/reinstall each time).
- A4: No own server / central system. User data is never read or copied by app or developer.

## B. Look & feel
- B1: One unique, best-in-class neumorphism theme: smooth curves, soft corners/edges, light pastel colors.
- B2: Light and Dark themes.
- B3: Every icon/card/element is consistent (constant design tokens). No overlap, no color mismatch;
  test this at every phase.
- B4: Auto-arranged, auto-aligned layout that fits every screen size.
- B5: Very smooth, sleek animations and transitions.
- B6: Home tiles: 1 and 2 are read-only (no special animation). 3 = Test = educational game.
  4 = Report.

## C. User app
- C1 Onboarding (only for NEW users, shown once): Welcome screen with Register and Login buttons.
  - Existing user: pastes their 12-word key.
  - New user: gets a new 12-word key; told to copy it and keep it forever; WARNING: if the key is
    lost the data cannot be recovered.
  - Basic info screen: name, email, phone — ALL optional (stated on screen: app works without them).
  - Privacy note screen with OK button (text below, owner wants it rephrased well):
    "The app does not read or copy any user data because it has no server or central system;
    all user data is backed up fully encrypted with military-grade security; the app never reads
    or backs up user data anywhere." (see DECISIONS Q2/Q3 — wording must be technically true)
  - Returning users only log in (12-word key), then go to Home.
- C2 Home = "Courses": beautiful cards/tiles, one per course (courses come from developer mode).
- C3 Opening a course shows 4 tiles: Course Preview (Overview), Content, Test, Report.
  Each shows exactly what the developer entered.
  If developer left any of the 3 data folders empty, show (Gujarati):
  "હાલ આ માહિતી ઉપલબ્ધ નથી, રાહ જુઓ. ટૂંક સમયમાં માહિતી ઉપલબ્ધ થશે"
- C4 Reader (Overview + Content): e-book style, NOT PDF style. Font size changes by pinch zoom while
  the reading area stays fixed (no sideways scrolling). Infographic images are zoomable
  (pinch zoom in/out) and are not bound to the fixed area. Blocks: title, subtitle, text, image —
  every part optional.
- C5 Test (game): question on screen, options below; user's choice recorded; matched with correct
  answer; scoreboard; final result after the developer-defined number of questions; star rating
  out of 5; cheer animations; messages like "Congratulations" / "Work harder"; sound.
  Visual inspiration: Candy Crush Saga / Cut the Rope (similar feel, NOT a copy; 2D only if size
  becomes a problem). Modern material-style game look.
- C6 Report: user generates a PDF report of courses read and tests taken. Saved locally in an app
  folder in device storage; ask file access only when needed; user can rename the file when saving.
  Colorful, eye-catching, minimal design.
- C7 Settings (2nd main screen): profile card (name, email, phone; all optional; prefilled if
  entered at onboarding) · passphrase information · "Update app" button (checks online and updates)
  · About (app, license, data policy).

## D. Developer mode (data entry ONLY — nothing else)
- D1 Login: either (a) ID + password file in the repo (owner puts it directly on GitHub), encrypted,
  fingerprint checked on login from any device, or (b) a 24-word login. Owner allows whichever
  method is easier/better. Separate login tab/window or separate app is allowed.
- D2 Data entry window: first create a folder = course name (auto-appears as a card on user Home).
  Inside it three sub-folders: Overview, Course Content, Test.
- D3 Overview/Content entry: each section optional. Top: optional Title and Subtitle boxes; below:
  text box; at the end of the text a "+" button that starts a new block (text block, then image
  block, then text again, ...). Saved block by block and shown to the user in the same order.
  Example: a course with 17 chapters, images inside chapters → paste text up to the image position,
  upload image, press "+", continue text.
- D4 Test entry: developer provides a text file; each question has 4 options; the correct answer is
  in BOLD in the file (only the app's brain uses this; the user sees all options in the same style).
  Optional test title and optional image.
- D5 Bottom of the window: "Save" and "Add another course" buttons.
- D6 Editing later: open the saved folder → Edit button → add, remove, replace a selected part.
- D7 Number of questions per test game is decided by the developer.

## E. Engineering / process requirements
- E1 Resumable work: any developer or machine can resume exactly where work stopped, even after
  crash, power-off, connection loss, agent/IDE/login change. (Implemented as AGENTS.md +
  PROGRESS.md + phase files — see AGENTS.md.)
- E2 After each phase: automatic local build; fix build errors; save the build locally; delete the
  previous build file when a new one is saved.
- E3 After each phase: remove junk files/code.
- E4 Prompts must be read very carefully; research similar projects/libraries on the web; produce
  detailed, exact implementation plans with examples/code/libraries/files; ask the owner if unclear.
