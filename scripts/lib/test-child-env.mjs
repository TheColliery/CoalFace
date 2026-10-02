// R14 bounce 1 / H1 -- the env scripts/test.mjs hands its `node --test` child.
// A hook inside a LINKED worktree exports an absolute GIT_DIR (and GIT_INDEX_FILE). The suite includes the blob-pinned
// org carrier scripts/secret-scan.test.mjs, whose fixture runs `git init` with no env: of its own (the template side is
// the .github deputy's to fix), so a child that inherits those keys re-initialises the REAL repository as bare. Every
// GIT_* key is deleted here, case-insensitively (Windows env names are case-insensitive); everything else, NODE_OPTIONS
// included, passes through untouched.
export function testChildEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_/i.test(k)));
}
