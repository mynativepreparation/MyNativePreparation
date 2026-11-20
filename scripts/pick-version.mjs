// pick-version.mjs - prints the newest STABLE version of an npm package that was published at least N days ago.
// Why: a brand-new release can carry a supply-chain attack before anyone notices (see DECISIONS, Verified facts, bip39).
// Usage: node scripts/pick-version.mjs <package> <minAgeDays>
import { execSync } from "node:child_process";

const [pkg, daysArg] = process.argv.slice(2);
const minAgeDays = Number(daysArg ?? 14);
if (!pkg || !Number.isFinite(minAgeDays)) {
  console.error("Usage: node scripts/pick-version.mjs <package> <minAgeDays>");
  process.exit(2);
}

let times;
try {
  times = JSON.parse(execSync(`npm view ${pkg} time --json`, { encoding: "utf8" }));
} catch (err) {
  console.error("Could not read the version list from npm: " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
const stable = /^\d+\.\d+\.\d+$/;
const rows = Object.entries(times)
  .filter(([version]) => stable.test(version))
  .map(([version, iso]) => ({ version, at: Date.parse(iso), iso }))
  .sort((a, b) => b.at - a.at);

// Everything goes to stderr for the log; ONLY the chosen version goes to stdout.
console.error("Newest stable versions (newest first):");
for (const row of rows.slice(0, 5)) {
  console.error(`  ${row.version}  published ${row.iso}${row.at > cutoff ? "  (too new, skipped)" : ""}`);
}

const chosen = rows.find((row) => row.at <= cutoff);
if (!chosen) {
  console.error(`No stable version older than ${minAgeDays} days was found.`);
  process.exit(1);
}
console.error(`Chosen: ${chosen.version} (published ${chosen.iso})`);
process.stdout.write(chosen.version);
