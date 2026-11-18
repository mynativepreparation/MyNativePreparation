// make-manifest.mjs - builds public/content/manifest.json from the files in public/content/courses/.
// Run:  .\run.cmd p03-manifest.ps1   (or: node scripts/make-manifest.mjs)
//
// - One entry per course folder, with a SHA-256 for every file in it (same rule as src/core/content/hash.ts).
// - `version` grows by 1 for a course only when one of its files changed (or when the course is new).
// - `generatedAt` changes only when something changed, so running the script twice gives the same file.
// This is also the base of the later publish flow (P10/P11).

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const contentRoot = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'content');
const coursesDir = join(contentRoot, 'courses');
const manifestPath = join(contentRoot, 'manifest.json');

function fail(message) {
  console.error('FAILED: ' + message);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const toPosix = (p) => p.split(sep).join('/');

if (!existsSync(coursesDir)) fail('folder not found: ' + coursesDir);

let previous = null;
if (existsSync(manifestPath)) {
  try {
    previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    console.warn('Old manifest.json is not valid JSON; building a new one from scratch.');
  }
}
const previousById = new Map((previous?.courses ?? []).map((c) => [c.id, c]));

const entries = [];
let changed = false;

for (const dirent of readdirSync(coursesDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const courseDir = join(coursesDir, dirent.name);
  const cardPath = join(courseDir, 'course.json');
  if (!existsSync(cardPath)) fail('missing course.json in ' + courseDir);

  let card;
  try {
    card = JSON.parse(readFileSync(cardPath, 'utf8'));
  } catch (e) {
    fail('course.json is not valid JSON in ' + courseDir + ' (' + e.message + ')');
  }
  if (typeof card.id !== 'string' || typeof card.title !== 'string') fail('course.json needs "id" and "title": ' + cardPath);
  if (card.id !== dirent.name) fail('folder name "' + dirent.name + '" must equal the course id "' + card.id + '"');

  const files = {};
  for (const file of walk(courseDir).sort()) {
    files[toPosix(relative(contentRoot, file))] = sha256(readFileSync(file));
  }

  const old = previousById.get(card.id);
  let version = 1;
  if (old) {
    const same = JSON.stringify(old.files) === JSON.stringify(files) && old.title === card.title;
    version = same ? old.version : old.version + 1;
    if (!same) changed = true;
  } else {
    changed = true;
  }
  entries.push({ id: card.id, title: card.title, version, files, order: Number(card.order) || 0 });
}

entries.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
const courses = entries.map((e) => ({ id: e.id, title: e.title, version: e.version, files: e.files }));

if (previous && courses.length !== (previous.courses ?? []).length) changed = true;

const manifest = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: changed || !previous?.generatedAt ? new Date().toISOString() : previous.generatedAt,
  courses,
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('manifest.json written: ' + courses.length + ' course(s), ' + (changed ? 'content changed' : 'no change'));
for (const c of courses) console.log('  ' + c.id + '  v' + c.version + '  ' + Object.keys(c.files).length + ' file(s)');
