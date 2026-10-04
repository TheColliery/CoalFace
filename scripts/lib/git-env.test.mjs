import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitEnv } from './git-env.mjs';
import { gitTestEnv } from './git-test-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GIT = "'git'";

test('gitEnv: drops every GIT_* key except GIT_INDEX_FILE, case-insensitively, and pins the locale', () => {
  const env = gitEnv({ GIT_DIR: 'a', git_work_tree: 'b', GIT_PREFIX: 'c', GIT_INDEX_FILE: 'i', PATH: 'p', GIT_CEILING_DIRECTORIES: 'x' });
  assert.deepEqual(Object.keys(env).sort(), ['GIT_INDEX_FILE', 'LC_ALL', 'LANGUAGE', 'PATH'].sort());
  assert.equal(env.GIT_INDEX_FILE, 'i');
  assert.equal(env.LC_ALL, 'C');
});

// R14 bounce 1 / L1 -- a PARTIAL commit (`git commit -- doc.md` while new.md is staged) hands the pre-commit hook
// GIT_INDEX_FILE = the temporary index of THAT commit. A read that strips it sees new.md too. The hook below runs the
// SAME ls-files read verify.mjs makes, once through gitEnv() and once through gitTestEnv(), and records both.
test('L1: inside a partial commit a gitEnv() read sees only the commit (doc.md), a fully stripped read also sees the staged new.md', (t) => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-l1-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'sandbox');
  fs.mkdirSync(repo);
  const g = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], env: gitTestEnv(root) });
  g(['init', '-q', '.']);
  assert.ok(fs.existsSync(path.join(repo, '.git')), 'the fixture own .git exists before any config');
  g(['config', 'user.email', 'l1@coalface.invalid']);
  g(['config', 'user.name', 'l1']);
  fs.writeFileSync(path.join(repo, 'doc.md'), 'v1\n');
  fs.writeFileSync(path.join(repo, 'base.md'), 'base\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  fs.writeFileSync(path.join(repo, 'new.md'), 'new\n');
  g(['add', 'new.md']);
  fs.writeFileSync(path.join(repo, 'doc.md'), 'v2 cites new.md\n');

  // STATIC probe source: nothing is spliced into it. Its inputs (lib URLs, repo, out file, root) are DATA in args.json
  // beside it, read at run time. Both files live inside the sandbox .git, which no commit tracks.
  const out = path.join(root, 'seen.json');
  const gitDir = path.join(repo, '.git');
  const libUrl = (f) => pathToFileURL(path.join(here, f)).href;
  fs.writeFileSync(path.join(gitDir, 'args.json'), JSON.stringify({ envLib: libUrl('git-env.mjs'), testEnvLib: libUrl('git-test-env.mjs'), repo, out, root }));
  fs.writeFileSync(path.join(gitDir, 'probe.mjs'), [
    "import fs from 'node:fs';",
    "import { execFileSync } from 'node:child_process';",
    "const a = JSON.parse(fs.readFileSync(new URL('./args.json', import.meta.url), 'utf8'));",
    "const { gitEnv } = await import(a.envLib);",
    "const { gitTestEnv } = await import(a.testEnvLib);",
    "const ls = (env) => execFileSync(" + GIT + ", ['ls-files'], { cwd: a.repo, encoding: 'utf8', env }).trim().split('\\n').sort();",
    "fs.writeFileSync(a.out, JSON.stringify({ idx: process.env.GIT_INDEX_FILE || null, kept: ls(gitEnv()), stripped: ls(gitTestEnv(a.root)) }));",
    '',
  ].join('\n'));
  const hook = path.join(gitDir, 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nnode "$(dirname "$0")/../probe.mjs" || exit 1\n');
  fs.chmodSync(hook, 0o755);

  g(['commit', '-q', '-m', 'partial', '--', 'doc.md']);
  const seen = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(seen.idx, 'liveness: git handed the hook a GIT_INDEX_FILE');
  assert.deepEqual(seen.stripped, ['base.md', 'doc.md', 'new.md'], 'control: a fully stripped read sees the staged new.md (the hazard is real)');
  assert.deepEqual(seen.kept, ['base.md', 'doc.md'], 'gitEnv() keeps GIT_INDEX_FILE, so the read sees only the commit being made');
  assert.equal(g(['show', '--name-only', '--format=', 'HEAD']).trim(), 'doc.md', 'the commit made holds only doc.md');
});

test('verify.mjs takes its four real-repo git reads through gitEnv(), never gitTestEnv() (the L1 ruling; 05a L-2 added the tag-file read)', () => {
  const src = fs.readFileSync(path.join(here, '..', 'verify.mjs'), 'utf8');
  assert.match(src, /git-env\.mjs/);
  assert.equal((src.match(/env: gitEnv\(\)/g) || []).length, 4, 'all reads');
  assert.ok(!/env: gitTestEnv\(/.test(src), 'no fixture helper on a gate read');
});
