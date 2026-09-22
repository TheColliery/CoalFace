// r5 -- a fixture or read-only git spawn in THIS repo's own test suite must never inherit an
// ambient GIT_* override. A LINKED WORKTREE's own pre-commit/pre-push hook exports an ABSOLUTE
// GIT_DIR (the worktree's admin dir) and an ABSOLUTE GIT_INDEX_FILE -- both override `cwd` AND
// any GIT_CEILING_DIRECTORIES a test tries to impose. Measured: `GIT_DIR=<abs> git init -q .` in
// an EMPTY fixture dir creates NO fixture `.git` and flips the REAL enclosing repository's
// `core.bare` to `true` -- it happened to this repo itself on 2026-09-10 (repaired by hand).
// Full incident: TheColliery/scratchpad/dispatch/r5-coalface.return.md, "INCIDENT during leg
// (c0) set-up".
//
// Deleting the WHOLE `GIT_*` family, not a hand-maintained list, is the point -- a list rots;
// the family is what git actually reads (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE,
// GIT_COMMON_DIR, GIT_OBJECT_DIRECTORY, and anything else a future git version adds under the
// same prefix).
//
// `ceilingDir` is the one directory a fixture spawn is never allowed to walk up past (its own
// parent) -- belt-and-suspenders on top of the GIT_* strip, matching the pattern every call
// site in this repo already used before this fix (r34b FOLD R1).
export function gitTestEnv(ceilingDir) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  env.GIT_CEILING_DIRECTORIES = ceilingDir;
  return env;
}
