import fs from 'node:fs';
// r5 -- a fixture or read-only git spawn in THIS repo's own test suite must never inherit an
// ambient GIT_* override. A LINKED WORKTREE's own pre-commit/pre-push hook exports an ABSOLUTE
// GIT_DIR (the worktree's admin dir) and an ABSOLUTE GIT_INDEX_FILE -- both override `cwd` AND
// any GIT_CEILING_DIRECTORIES a test tries to impose. Measured: `GIT_DIR=<abs> git init -q .` in
// an EMPTY fixture dir creates NO fixture `.git` and flips the REAL enclosing repository's
// `core.bare` to `true` -- it happened to THIS repo (CoalFace) at 2026-09-23 00:17:49 +07
// (repaired by hand). NOT the umbrella's separate 2026-09-10 `core.bare` incident (a
// different mechanism entirely -- a backtick in a double-quoted `node -e`; see
// verify.test.mjs's own r34b comment for that one). In short: a pre-commit hook inside a linked
// worktree exports an absolute GIT_DIR, and a fixture that spread process.env into git flipped this
// repository to core.bare=true.
//
// Deleting the WHOLE `GIT_*` family, not a hand-maintained list, is the point -- a list rots;
// the family is what git actually reads (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE,
// GIT_COMMON_DIR, GIT_OBJECT_DIRECTORY, and anything else a future git version adds under the
// same prefix).
//
// `ceilingDir` is the one directory a fixture spawn is never allowed to walk up past (its own
// parent) -- belt-and-suspenders on top of the GIT_* strip, matching the pattern every call
// site in this repo already used before this fix (r34b FOLD R1).
//
// 05a: a fixture git must also never WAIT on a human. With a signing global config a bare `git tag`
// becomes an annotated tag and git opens the system editor (Notepad on this box) on the owner's
// screen; the spawn blocks until it is closed. GIT_EDITOR=false makes any git that wants an editor
// fail at once, and GIT_TERMINAL_PROMPT=0 does the same for a credential prompt.
export function gitTestEnv(ceilingDir) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^GIT_/i.test(key)) delete env[key];
  }
  env.GIT_CEILING_DIRECTORIES = ceilingDir;
  env.GIT_EDITOR = 'false';
  env.GIT_TERMINAL_PROMPT = '0';
  // 05a F2: and never SIGN. The operator's global config can demand commit.gpgsign / tag.gpgsign; a fixture commit would
  // then wait on a signer and use the operator's live key. The env-config form (git 2.31+) overrides the global for every
  // call that inherits this env, so no call site has to remember `-c commit.gpgsign=false`.
  env.GIT_CONFIG_COUNT = '2';
  env.GIT_CONFIG_KEY_0 = 'commit.gpgsign';
  env.GIT_CONFIG_VALUE_0 = 'false';
  env.GIT_CONFIG_KEY_1 = 'tag.gpgsign';
  env.GIT_CONFIG_VALUE_1 = 'false';
  return env;
}

// 16e item 2 (CWK-041, the EBUSY class; the cure is CoalWash's removeTree, v1.12.4 scripts/lib/test-plan.mjs, ported here under the same name and the same numbers).
// A fixture project a git child ran in is removed by this, never by a bare rmSync: Windows refuses to remove a directory a live process holds as its cwd, and when
// spawnSync kills Git for Windows' launcher (cmd/git.exe) at its clock or on ENOBUFS, the real git.exe it started (and a gpg.program under it) lives on inside the project for
// seconds and spawnSync cannot wait for a grandchild. Measured here (git-test-env.test.mjs header): 9.3-9.4 s until fresh calls clear it, 3 of 3. Node's own
// rmSync { maxRetries } is not the instrument: on Node 24.19 / Windows it waits for one holding shape and raised EPERM at once for another (CoalWash, e63-rmprobe.out). So:
// fresh rmSync calls, retried on EBUSY/EPERM/ENOTEMPTY every pollMs until budgetMs, then the hold error is thrown (a real leak stays loud); any other code throws at once.
// The budget is about 4x the longest linger CoalWash measured (7,639 ms) and 2.5x this room's longest possible hold (the f2 test's 20 s signer minus its 8 s clock).
export const TEARDOWN_BUDGET_MS = 30000;
export const TEARDOWN_POLL_MS = 100;
const HELD = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);
export function removeTree(dir, { budgetMs = TEARDOWN_BUDGET_MS, pollMs = TEARDOWN_POLL_MS } = {}) {
  const until = Date.now() + budgetMs;
  for (;;) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch (e) {
      if (!(e && HELD.has(e.code)) || Date.now() >= until) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs); // a synchronous wait: teardowns run in finally blocks and t.after alike
    }
  }
}
