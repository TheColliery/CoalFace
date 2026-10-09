#!/usr/bin/env node
// CoalFace test runner — the canonical gate suite. Enumerates EVERY test file explicitly and FAILS LOUD on drift in BOTH directions (listed-but-missing,
// on-disk-but-unlisted), and the same for scripts/test-expect.json against the roster. Mirrors CoalTipple/CoalHearth's scripts/test.mjs.
//
// 09a: the suite is judged by what the TAP says, never by an exit code alone (testing.md: a gate judges a run by the TAP test names it expects).
//   - Each file runs as its own `node --test --test-reporter=tap --test-force-exit` child through scripts/lib/wave-run.mjs (the canon, BB-87, adopted by blob id), the next file
//     admitted only while a fresh machine reading says BREATHE; a file that exits 0 before its tests registered is VACUOUS, not a pass. The children carry the heap cap in
//     NODE_OPTIONS, the stdout-sync preload, the clock per test, the wall clock per file and the whole-run deadline that kills the TREE of every running child.
//   - scripts/test-expect.json holds a count FLOOR for every file, or, for the room census pins, the NAMES the file must report (scripts/lib/suite-run.mjs).
//   `node scripts/test.mjs --names <file>` prints the top-level test names of one file; `--counts` prints every file's test count (to keep the floors).
//
// SIZING (this room's own variables, never the canon's; measured 2026-10-08, serial, heap-capped): the slowest file is scripts/verify.test.mjs at 82.1 s wall and the whole
// suite took 154 s. 240000 ms per test is just over twice the slowest file (on Node 22 that clock is per FILE); one file may take 300000 ms of wall clock (3.6x the slowest);
// the whole run ends at 600000 ms (about 4x the serial suite). A run that needs more is a defect to fix, not a number to raise.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TESTS = [
  'scripts/lib/config-schema.test.mjs',
  'scripts/machine-reading.test.mjs',
  'scripts/lib/jsonc.test.mjs',
  'scripts/lib/hooks.test.mjs',
  'scripts/lib/desc-cap.test.mjs',
  'scripts/lib/claude-ai-trim.test.mjs',
  'scripts/lib/config-keys.test.mjs',
  'scripts/lib/pointer-check.test.mjs',
  'scripts/lib/git-test-env.test.mjs',
  // CWK-133 / CWK-136 / 09a: the canon git-spawn census (adopted by blob id from .github), wired into scripts/verify.mjs.
  'scripts/lib/git-env-census.test.mjs',
  // 09a: this room's side of the canon census: its pins, measured, over the room's real sources (git-env-census.mjs and its test are the canon's).
  'scripts/git-env-census-room.test.mjs',
  // R14 b1 L1: gitEnv() keeps GIT_INDEX_FILE for the gate's two real-repo reads (partial-commit proof).
  'scripts/lib/git-env.test.mjs',
  // R14 b1 H1: the suite child never inherits a hook's GIT_* family (the pinned secret-scan.test.mjs runs git init env-less).
  'scripts/lib/test-child-env.test.mjs',
  // 09a: the canon wave runner (BB-87) and this room's suite judge: floors and names against the TAP, the TAP-names MUST.
  'scripts/lib/wave-run.test.mjs',
  'scripts/lib/suite-run.test.mjs',
  // CWK-174: the house secret scan, adopted byte-identical from .github's templates/published-code/.
  'scripts/secret-scan.test.mjs',
  'scripts/secret-gate.test.mjs',
  'scripts/build-plugin.test.mjs',
  'scripts/verify.test.mjs',
  'scripts/build-claude-ai-zips.test.mjs',
  'scripts/configure.test.mjs',
  'scripts/link-check.test.mjs',
  // CWK-124: the sole-creator release workflow, adopted byte-identical from
  // .github's templates/overlay-coal-skill/ (never a room-local variant).
  'scripts/decide-upload.test.mjs',
  'scripts/prune-release-zips.test.mjs',
  'scripts/release-notes.test.mjs',
  'scripts/verify-release-shape.test.mjs',
  'scripts/lib/asset-upload-mode.test.mjs',
  'scripts/lib/release-prune.test.mjs',
  'scripts/lib/release-shape.test.mjs',
];

const LIMITS = { heapMb: 2048, fileTimeoutMs: 240000, deadlineMs: 600000, fileClockMs: 300000 };

// CWK-071: process.exit() forces the process to exit before pending stdout writes flush (node/runtime.md §7) -- set process.exitCode and let the process exit naturally.
// The judge is imported inside main (node/runtime.md §1): a missing scripts/lib/suite-run.mjs is a clean message and a red exit, never a link-time stack.
async function main() {
  let suite;
  try {
    suite = await import('./lib/suite-run.mjs');
  } catch (e) {
    console.error(`test runner: cannot load scripts/lib/suite-run.mjs (${e && e.code ? e.code : e.message}). Restore it from git; the suite is not run without its judge.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = await suite.cli({ repo, tests: TESTS, dirs: ['scripts', 'scripts/lib', 'hooks'], expectFile: 'scripts/test-expect.json', argv: process.argv.slice(2), limits: LIMITS });
}

main().catch((e) => {
  console.error(`test runner: crashed (${e && e.message ? e.message : 'error'})`);
  process.exitCode = 1;
});
