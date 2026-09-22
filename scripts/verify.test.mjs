import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitTestEnv } from './lib/git-test-env.mjs';

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
  // r34b FOLD R1 -- verify.mjs's own git spawns (check-ignore et al.) inherited no ceiling; a
  // tmpdir sitting under a real repository let its NAMED-SKIP-vs-real-repo tests read the wrong
  // premise. Pinned here so the child process's own git calls carry the ceiling by inheritance.
  // r5 -- and never the ambient GIT_* family either (gitTestEnv, see that file's own header):
  // a linked-worktree hook exports an ABSOLUTE GIT_DIR/GIT_INDEX_FILE that overrides both cwd
  // and this ceiling, and this spawn's env is what verify.mjs's OWN child git spawns inherit.
  return spawnSync(process.execPath, [path.join(tmp, 'scripts', 'verify.mjs')], {
    encoding: 'utf8',
    env: gitTestEnv(path.dirname(tmp)),
  });
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
//
// r34 ITEM A — THE FIXTURE RAIL. CORRECTED r34b: this block first blamed a git FIXTURE for the
// umbrella's 2026-09-10 `core.bare` incident; that story was wrong (dispatch-transport.md's own
// sixth amendment, corrected in the umbrella's `2c31e54`, names it by name). The real write was
// a HEAD's own Bash call — a `node -e "…"` with backticks inside a DOUBLE-QUOTED bash string,
// run from `TheColliery/scratchpad` — which bash command-substituted and executed against the
// nearest repository the cwd could walk up to: the umbrella's. No fixture was involved.
//
// The rail below stands on its OWN evidence regardless of that incident: `git init` can fail
// (a path that cannot be created, a `git` binary that is missing or misbehaving), and this
// fixture used to proceed straight to `git config` on any outcome, scoped only by `cwd: tmp` —
// which is exactly what a broken init defeats, since git's own directory walk-up would then take
// every subsequent `config`/`add`/`commit` call to the nearest ANCESTOR repository instead of
// failing. Fixed: assert BOTH the spawn's own exit status AND `tmp/.git`'s existence immediately
// after `init`, and FAIL LOUD before any `config` call ever runs. `-C tmp` is now explicit on
// every call too (belt-and-suspenders alongside `cwd: tmp`, so intent reads at the call site,
// not only in the spawn options object).
//
// r34b BOUNCE 1 L1/L2 (CONFIRMED, fixed) — INSPECT proved the assertions above were correct but
// UNDEFENDED: a mutation matrix showed stripping the `.git`-exists check alone left all 5 tests
// green, because the only broken shape any test drove was init exiting non-zero, which the STATUS
// assertion already catches first. Worse, the ordering test's own regression detector shelled out
// to REAL git against a `.git`-less `tmp` the moment the guard regressed -- performing the exact
// walk-up hazard it exists to catch. `GIT_CEILING_DIRECTORIES` pinned to `tmp`'s own parent below
// makes gitInit()'s own calls structurally incapable of reaching an ancestor repository, whatever
// state any assertion is in -- belt-and-suspenders on top of the assertions, not a replacement
// for them (git still refuses cleanly; the assertions still name WHY to a human reading the test
// output).
//
// r34b FOLD R1 (CONFIRMED, fixed) — RE-INSPECT caught this comment overstating its own reach: the
// pin above covered gitInit() only, and two other fixture git spawns in this file carried none --
// the `core.bare` write below (a `.git`-less `tmp`, under the exists-assertion-stripped mutation,
// let that write reach a real ancestor repository, reproducing the exact 2026-09-10 incident value)
// and `runVerify()`'s own child spawn. Both are pinned now; every fixture git spawn in this file --
// enumerate them: gitInit()'s init/config/config/add/commit, the `core.bare` write below, and
// runVerify()'s child -- every one carries the ceiling, so "every fixture call" is now true rather
// than aspirational.
//
// `spawn` is DI'd (defaults to the real `spawnSync`) so a test can prove the ORDERING itself —
// that a failed init is never followed by a single `config`/`add`/`commit` spawn — without
// needing a genuinely broken git binary.
function gitInit(tmp, { spawn = spawnSync } = {}) {
  const opts = {
    cwd: tmp,
    encoding: 'utf8',
    // r34b bounce1 L2 — no fixture call can walk up past `tmp`'s own parent, structurally,
    // regardless of what `.git` does or does not exist inside `tmp` itself.
    // r5 -- AND no fixture call may inherit an ambient GIT_DIR/GIT_INDEX_FILE either: those
    // override BOTH cwd and the ceiling above, which is exactly how this repo's own `.git`
    // got flipped to `core.bare = true` on 2026-09-10 when a linked worktree's hook ran this
    // very function. gitTestEnv() strips the whole GIT_* family before re-adding the ceiling.
    env: gitTestEnv(path.dirname(tmp)),
  };
  const init = spawn('git', ['init', '-q', '.'], opts);
  assert.equal(init.status, 0, `fixture git init failed (exit ${init.status}): ${init.stderr || ''}`);
  assert.ok(fs.existsSync(path.join(tmp, '.git')),
    'fixture .git must exist before any git config runs against it -- a fixture whose init only ' +
    'LOOKS to have succeeded is one config write away from landing on the nearest real repository ' +
    'a directory walk-up finds (r34 ITEM A)');
  // Throwaway LOCAL identity — never touches the operator's own global git config.
  spawn('git', ['-C', tmp, 'config', 'user.email', 'ci@coalface.invalid'], opts);
  spawn('git', ['-C', tmp, 'config', 'user.name', 'coalface-verify-test'], opts);
  spawn('git', ['-C', tmp, 'add', '-A'], opts);
  spawn('git', ['-C', tmp, 'commit', '-q', '-m', 'fixture'], opts);
}

test('gitInit(): a failed init FAILs LOUD before any git config/add/commit spawn -- the ordering, not just the failure', () => {
  const tmp = mkTmpRepoCopy();
  try {
    // args[0] is 'init' for the first call, but '-C' for every call after (this fix's own
    // explicit `-C tmp` addition) -- verb() reads the real subcommand either shape.
    const verb = (args) => (args[0] === '-C' ? args[2] : args[0]);
    const calls = [];
    // r34b bounce1 L2 -- NEVER shells out to real git, for ANY verb: a regression detector
    // must not itself perform the hazard it exists to catch. Before this fix, a regressed
    // guard made this line run real `git -C <tmp> config …` against a `.git`-less `tmp`,
    // which is exactly the walk-up this whole rail exists to close.
    const brokenSpawn = (cmd, args) => {
      calls.push(verb(args)); // 'init' | 'config' | 'add' | 'commit'
      if (verb(args) === 'init') return { status: 1, stderr: 'synthetic init failure (red-first)' };
      return { status: 0 }; // fake success -- no child process, no real git, ever
    };
    assert.throws(() => gitInit(tmp, { spawn: brokenSpawn }), /fixture git init failed/,
      'a failed init must throw at the assertion, never proceed');
    assert.deepEqual(calls, ['init'],
      'zero config/add/commit spawns may run after a failed init -- proves the ORDER, not only that it eventually failed');
    assert.ok(!fs.existsSync(path.join(tmp, '.git')), 'no real .git was ever created by the intercepted init');

    // Green direction, same fixture, the REAL spawnSync: init succeeds, every step runs in order.
    calls.length = 0;
    const spy = (cmd, args, opts2) => { calls.push(verb(args)); return spawnSync(cmd, args, opts2); };
    gitInit(tmp, { spawn: spy });
    assert.deepEqual(calls, ['init', 'config', 'config', 'add', 'commit']);
    assert.ok(fs.existsSync(path.join(tmp, '.git')), 'a successful init leaves a real .git behind');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// r34b bounce1 L1 -- the case the original order named had NO test: init exits 0 (so the
// STATUS assertion is satisfied) but `.git` is never actually created (a pathological or
// misbehaving git binary). INSPECT's mutation matrix proved the exists-assertion was
// UNDEFENDED without this case: stripping it alone left every prior test green.
test('gitInit(): an init that exits 0 but creates NO .git still FAILs LOUD at the .git-exists assertion, zero further spawns', () => {
  const tmp = mkTmpRepoCopy();
  try {
    const verb = (args) => (args[0] === '-C' ? args[2] : args[0]);
    const calls = [];
    // Reports SUCCESS without ever running real git for any verb -- so `tmp/.git` never
    // materializes, driving exactly the branch the exists-assertion exists to catch.
    const fakeInit = (cmd, args) => { calls.push(verb(args)); return { status: 0 }; };
    assert.throws(() => gitInit(tmp, { spawn: fakeInit }),
      /fixture \.git must exist before any git config runs/,
      'a fake init reporting success with no real .git must still throw, at the EXISTS assertion');
    assert.deepEqual(calls, ['init'],
      'zero config/add/commit spawns may run when .git never materialized -- proves the ordering, not only the eventual failure');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

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
    // r34b FOLD R1 -- pinned like every other fixture spawn: `tmp` has no ancestor .git of its
    // own concern here, but a `.git`-less `tmp` (the exists-assertion-stripped mutation) would
    // otherwise let this specific write land on whatever real repository os.tmpdir() sits under.
    // r5 -- and stripped of the ambient GIT_* family too, for the same reason as gitInit()/
    // runVerify() above: this exact write (`config core.bare true`) is the literal value the
    // 2026-09-10 incident produced on THIS repo when an inherited GIT_DIR redirected it there.
    spawnSync('git', ['config', 'core.bare', 'true'], {
      cwd: tmp,
      encoding: 'utf8',
      env: gitTestEnv(path.dirname(tmp)),
    });

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

// r5 -- reproduces the REAL 2026-09-10 hazard safely, in a sandbox this test owns end to end.
// `S` plays the role of "the real repository a linked worktree's hook exports GIT_DIR/
// GIT_INDEX_FILE for" -- gitInit() must build fixture `F`'s own .git without ever touching S,
// whatever an ambient GIT_DIR points at. Full incident:
// TheColliery/scratchpad/dispatch/r5-coalface.return.md, "INCIDENT during leg (c0) set-up".
test('gitInit(): a planted ambient GIT_DIR/GIT_INDEX_FILE (the linked-worktree shape) never reaches the fixture spawn', () => {
  const sandboxParent = fs.mkdtempSync(path.join(os.tmpdir(), 'coalface-gitenv-sandbox-'));
  const f = fs.mkdtempSync(path.join(os.tmpdir(), 'coalface-gitenv-fixture-'));
  try {
    const s = path.join(sandboxParent, 'S');
    fs.mkdirSync(s);
    // A real, independent repo -- built under the CURRENT env, before anything is planted.
    gitInit(s);
    const sConfigBefore = fs.readFileSync(path.join(s, '.git', 'config'), 'utf8');
    assert.doesNotMatch(sConfigBefore, /bare\s*=\s*true/i, 'sandbox setup sanity: S must not start bare');

    const savedGitDir = process.env.GIT_DIR;
    const savedGitIndexFile = process.env.GIT_INDEX_FILE;
    let caught = null;
    try {
      // The absolute values a linked worktree's own pre-commit/pre-push hook exports (the r5
      // incident's real shape) -- planted ONLY here, scoped to S's own tmp tree, NEVER this
      // repo or anywhere outside this test's own tmp (r5's own rail).
      process.env.GIT_DIR = path.join(s, '.git');
      process.env.GIT_INDEX_FILE = path.join(s, '.git', 'index');
      try {
        gitInit(f);
      } catch (e) {
        // gitInit()'s OWN r34 .git-exists rail can fire first, when init silently targets S
        // instead of f -- itself a RED signal; caught here so the S-corruption assertions
        // below still run either way, never masked by an uncaught exception.
        caught = e;
      }
    } finally {
      if (savedGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = savedGitDir;
      if (savedGitIndexFile === undefined) delete process.env.GIT_INDEX_FILE; else process.env.GIT_INDEX_FILE = savedGitIndexFile;
    }

    const sConfigAfter = fs.readFileSync(path.join(s, '.git', 'config'), 'utf8');
    assert.equal(sConfigAfter, sConfigBefore,
      'S — the planted GIT_DIR target — must be byte-identical after building an unrelated fixture' +
      (caught ? ` (gitInit(f) also threw: ${caught.message})` : ''));
    assert.doesNotMatch(sConfigAfter, /bare\s*=\s*true/i,
      'S must never flip core.bare — the exact 2026-09-10 incident value, reproduced safely in a sandbox');
    assert.ok(fs.existsSync(path.join(f, '.git')),
      'the fixture must get its own independent .git regardless of what an ambient GIT_DIR points at');
  } finally {
    fs.rmSync(sandboxParent, { recursive: true, force: true });
    fs.rmSync(f, { recursive: true, force: true });
  }
});
