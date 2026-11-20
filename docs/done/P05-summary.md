# P05 summary — DONE 2026-11-20

- Home = Courses: `useCourses` reads `manifest.json` and each `course.json` card, sorted by `order`; a course with a missing or broken card stays visible as a disabled card with the owner's Gujarati "not available" text; offline or broken manifest = calm message with Retry; loading = 2 skeleton cards.
- Course screen: exactly 4 tiles (Overview, Content, Test, Report); Overview, Content and Test open only when their data is `ready`, Report is always open; unknown course id = not-available state with Back.
- Routes inside the Shell: `/`, `/course/:id`, `/course/:id/overview|content|test|report` (placeholders "Coming in a later update" until P06 reader, P07 test, P08 report; the paths stay); the Courses nav item stays highlighted on course screens.
- Layout guard: `data-np-check` on both grids and `layout.test.tsx` (360 / 768 / 1366 px; jsdom has no layout, so real pixels were judged by the owner in the browser: light/dark and narrow window "all good"); CSS stays tokens only.
- `npm run check` = 678 tests green (49 files); build JS 165.40 KB gzip (limit 250), one folder in `builds\`; unused keys `home.toastButton` and `toast.hello` removed; no new dependency.
