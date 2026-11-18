// check-boundaries.mjs - fails (exit 1) when module isolation rules are broken.
// Rules (relative imports only; packages are ignored):
//   1. A file in src/modules/<a>/ may import only from its own folder and from src/core/.
//      It must NOT import another src/modules/<b>/ or src/app/.
//   2. A file in src/core/ must NOT import src/modules/ or src/app/.
//   3. src/app/ (the composition root) and src/main.tsx may import anything.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';

const root = resolve(process.cwd(), 'src');
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) files.push(p);
  }
}
walk(root);

function layerOf(absPath) {
  const rel = relative(root, absPath).split(sep);
  if (rel[0] === 'modules' && rel.length > 1) return { kind: 'module', name: rel[1] };
  if (rel[0] === 'core') return { kind: 'core' };
  if (rel[0] === 'app') return { kind: 'app' };
  return { kind: 'other' };
}

const patterns = [
  /\bfrom\s+['"]([^'"]+)['"]/, // import x from '..'  /  export * from '..'  /  } from '..'
  /^\s*import\s+['"]([^'"]+)['"]/, // import '..'
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/, // import('..')
];

const problems = [];
for (const file of files) {
  const from = layerOf(file);
  if (from.kind !== 'module' && from.kind !== 'core') continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const re of patterns) {
      const m = re.exec(line);
      if (!m || !m[1].startsWith('.')) continue;
      const target = layerOf(resolve(dirname(file), m[1]));
      const bad =
        (from.kind === 'module' &&
          ((target.kind === 'module' && target.name !== from.name) || target.kind === 'app')) ||
        (from.kind === 'core' && (target.kind === 'module' || target.kind === 'app'));
      if (bad) {
        problems.push(`${relative(process.cwd(), file)}:${i + 1}  imports  ${m[1]}  (not allowed)`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error('MODULE BOUNDARY VIOLATIONS:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`Boundary check passed (${files.length} files scanned).`);
