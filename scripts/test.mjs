#!/usr/bin/env node
// CoalFace test runner — the canonical gate suite. Enumerates EVERY test file
// explicitly and FAILS LOUD on drift in BOTH directions (listed-but-missing,
// on-disk-but-unlisted). Mirrors CoalTipple/CoalHearth's scripts/test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testSpawnPlan } from './lib/test-spawn.mjs';

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
  // CWK-133 / CWK-136: the git-spawn census, wired into scripts/verify.mjs.
  'scripts/lib/git-env-census.test.mjs',
  // R14 b1 L1: gitEnv() keeps GIT_INDEX_FILE for the gate's two real-repo reads (partial-commit proof).
  'scripts/lib/git-env.test.mjs',
  // R14 b1 H1: the suite child never inherits a hook's GIT_* family (the pinned secret-scan.test.mjs runs git init env-less).
  'scripts/lib/test-child-env.test.mjs',
  // 08b CWK-199's class: the runner's heap cap, serial files and finite clock.
  'scripts/lib/test-spawn.test.mjs',
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

// CWK-071: process.exit() forces the process to exit before pending stdout writes flush
// (node/runtime.md §7) -- set process.exitCode and let the process exit naturally instead.
// Wrapped in main() so an early-exit path is a plain `return`, keeping this a flat script
// (no async needed: spawnSync below is already synchronous).
function main() {
  const missing = TESTS.filter((t) => !fs.existsSync(path.join(repo, t)));
  if (missing.length) {
    console.error(`test runner: ${missing.length} listed test file(s) MISSING — ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const onDisk = [];
  for (const dir of ['scripts', 'scripts/lib', 'hooks']) {
    for (const f of fs.readdirSync(path.join(repo, dir))) {
      if (f.endsWith('.test.mjs') || f.endsWith('.test.js')) onDisk.push(`${dir}/${f}`);
    }
  }
  const orphans = onDisk.filter((f) => !TESTS.includes(f));
  if (orphans.length) {
    console.error(`test runner: ${orphans.length} on-disk test(s) NOT in the suite — ${orphans.join(', ')}. Add to scripts/test.mjs.`);
    process.exitCode = 1;
    return;
  }

  // CWK-199's class: heap cap in the child ENV, files serial, a finite clock; the plan also strips the GIT_* family (testChildEnv).
  const plan = testSpawnPlan(TESTS, process.env);
  const r = spawnSync(process.execPath, plan.args, { cwd: repo, stdio: 'inherit', env: plan.env });
  process.exitCode = r.status ?? 1;
}

main();
