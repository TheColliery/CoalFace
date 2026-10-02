// R14 bounce 1 / L1 -- the env a REAL-REPO git read takes (scripts/verify.mjs's two reads), unlike gitTestEnv()
// which is for FIXTURES. A hook runs with GIT_DIR, GIT_WORK_TREE, GIT_PREFIX and others that aim git at the repository
// the hook was started for; every git call drops them (the gate runs from the repository root and finds its repository
// from there), EXCEPT GIT_INDEX_FILE, which names the index a commit is made from: inside `git commit -- <path>` that
// is the temporary index of THIS commit, and stripping it makes ls-files read the real index, which also holds paths
// staged but not in the commit. The same shape as scripts/secret-gate.mjs's own gitEnv (a byte-pinned template file,
// so it cannot be imported: that module runs its gate at load).
export function gitEnv(env = process.env) {
  return {
    ...Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_/i.test(k) || k.toUpperCase() === 'GIT_INDEX_FILE')),
    LC_ALL: 'C',
    LANGUAGE: 'C',
  };
}
