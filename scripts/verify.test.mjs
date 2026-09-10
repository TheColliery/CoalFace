import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mkTmpRepoCopy() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coalface-verify-test-'));
  for (const name of fs.readdirSync(repo)) {
    if (name === '.git') continue;
    // board #40: dist-claude-ai/ is a gitignored, CI-generated build artifact that
    // build-claude-ai-zips.test.mjs writes + removes at the repo root while node:test
    // runs test FILES in parallel by default -- copying it here raced that other
    // test's own rmSync, an intermittent ENOENT with no relation to this gate at all.
    // Excluded the same way .git already is: it is never part of what verify.mjs checks.
    if (name === 'dist-claude-ai') continue;
    fs.cpSync(path.join(repo, name), path.join(tmp, name), { recursive: true });
  }
  return tmp;
}

function runVerify(tmp) {
  return spawnSync(process.execPath, [path.join(tmp, 'scripts', 'verify.mjs')], { encoding: 'utf8' });
}

// board #64: verify.mjs's DESC_CAP gate walked skill/command frontmatter only —
// .claude-plugin/plugin.json's own description field was unchecked. This pins
// the fix: a real over-cap value must FAIL the gate, a clean one must PASS.
test('verify.mjs negative path: an over-cap .claude-plugin/plugin.json description FAILs the gate', () => {
  const tmp = mkTmpRepoCopy();
  try {
    const clean = runVerify(tmp);
    assert.equal(clean.status, 0, `pristine copy must PASS, got:\n${clean.stdout}${clean.stderr}`);

    const pjPath = path.join(tmp, '.claude-plugin', 'plugin.json');
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    pj.description = 'x'.repeat(1025);
    fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n', 'utf8');

    const over = runVerify(tmp);
    assert.equal(over.status, 1, 'a plugin.json description over 1024 chars must FAIL with exit 1');
    assert.match(over.stdout, /\.claude-plugin\/plugin\.json: description 1025 chars exceeds the 1024-char cap/,
      'the FAIL line names the file, the exact length, and the cap');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// CW-015(a) — NO TEST ABOVE EVER RAN verify.mjs INSIDE A GIT REPO: mkTmpRepoCopy() builds a
// plain file/dir copy with no `.git`, so the `pointer drift:` block's whole wiring (CWK-079's
// ignoredRoots probe, CWK-090's fail-open close, the DEFAULT_SURFACE_PLAN walk) took its NAMED
// SKIP in every spawned-verify test above and nothing exercised it — every line in that block
// was deletable with the suite staying green (proven below, RED-FIRST).
function gitInit(tmp) {
  const opts = { cwd: tmp, encoding: 'utf8' };
  spawnSync('git', ['init', '-q', '.'], opts);
  // Throwaway LOCAL identity — never touches the operator's own global git config.
  spawnSync('git', ['config', 'user.email', 'ci@coalface.invalid'], opts);
  spawnSync('git', ['config', 'user.name', 'coalface-verify-test'], opts);
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', 'fixture'], opts);
}

test('verify.mjs pointer-drift block RUNS under a real git repo (no NAMED SKIP)', () => {
  const tmp = mkTmpRepoCopy();
  try {
    gitInit(tmp);
    const r = runVerify(tmp);
    assert.equal(r.status, 0, `a pristine committed fixture must PASS, got:\n${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stdout, /pointer drift NOT CHECKED/,
      'a real git repo must not take the no-.git NAMED SKIP');
    assert.match(r.stdout,
      /ok {3}every path this room points at resolves to a TRACKED file/,
      `the pointer-drift ok line must print once the block actually ran, got:\n${r.stdout}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('verify.mjs pointer-drift block FAILs LOUD when git check-ignore cannot run, never a silent pass', () => {
  const tmp = mkTmpRepoCopy();
  try {
    gitInit(tmp);
    // core.bare=true AFTER the commit: `git ls-files` keeps answering from the already-built
    // index (the tracked list stays correct — this is not the untracked-noise shape), while
    // `git check-ignore --stdin` refuses outright — "fatal: this operation must be run in a
    // work tree", exit 128. Real, portable git behaviour, no PATH shim needed (a bare
    // spawnSync with no shell:true resolves the real git.exe regardless of PATH order, so a
    // shim git on PATH would never be reached anyway — measured, not re-derived here).
    spawnSync('git', ['config', 'core.bare', 'true'], { cwd: tmp, encoding: 'utf8' });

    const r = runVerify(tmp);
    assert.equal(r.status, 1,
      `a check-ignore spawn that cannot run must FAIL the whole gate, got exit ${r.status}:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /VERIFY: FAIL/);
    assert.doesNotMatch(r.stdout, /VERIFY: PASS/,
      'the gate must never report a clean pass when the check-ignore probe could not run at all');
    assert.match(r.stdout,
      /FAIL git check-ignore --stdin exited 128 -- fatal: this operation must be run in a work tree -- cannot tell which cited roots are gitignored/,
      "the classifier's own message must reach stdout, naming the exit status and the reason — not a swallowed failure");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('verify.mjs pointer-drift block NAMED SKIPs (never FAILs) when the tree has no .git', () => {
  // Deliberately NO gitInit() here — mkTmpRepoCopy() already excludes .git, so this is the
  // git-less path the two tests above no longer leave uncovered.
  const tmp = mkTmpRepoCopy();
  try {
    const r = runVerify(tmp);
    assert.equal(r.status, 0, `a git-less pristine copy must still PASS overall, got:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /pointer drift NOT CHECKED: this directory is not a git repository/,
      'without .git the pointer-drift block must print a NAMED SKIP, never silently skip and never FAIL');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
