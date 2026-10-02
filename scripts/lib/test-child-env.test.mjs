import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testChildEnv } from './test-child-env.mjs';
import { gitTestEnv } from './git-test-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GIT = "'git'";

test('testChildEnv: deletes every GIT_* key case-insensitively, keeps NODE_OPTIONS and everything else', () => {
  const env = testChildEnv({ GIT_DIR: 'a', git_index_file: 'b', Git_Work_Tree: 'c', GIT_CEILING_DIRECTORIES: 'd', NODE_OPTIONS: '--max-old-space-size=2048', PATH: 'p', GITHUB_TOKEN: 'keep', NOT_GIT: 'x' });
  assert.deepEqual(Object.keys(env).sort(), ['GITHUB_TOKEN', 'NODE_OPTIONS', 'NOT_GIT', 'PATH']);
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=2048');
});

// The child spawn shape scripts/test.mjs uses (process.execPath --test <files>, env from testChildEnv), run on a fixture
// test file whose only act is an env-less `git init` -- the exact thing the pinned secret-scan.test.mjs does. The
// ambient GIT_DIR / GIT_INDEX_FILE are planted at a SANDBOX repo, never at the real one.
test('H1: a planted absolute GIT_DIR never reaches the suite child, so a sandbox repo is not flipped bare (control: unstripped env flips it)', (t) => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-h1-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const g = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], env: gitTestEnv(root) });
  const sandbox = path.join(root, 'sandbox');
  const elsewhere = path.join(root, 'elsewhere');
  fs.mkdirSync(sandbox);
  fs.mkdirSync(elsewhere);
  g(sandbox, ['init', '-q', '.']);
  assert.ok(fs.existsSync(path.join(sandbox, '.git')), 'the fixture own .git exists before the run');
  const cfg = path.join(sandbox, '.git', 'config');
  const before = fs.readFileSync(cfg, 'utf8');
  assert.ok(!/bare\s*=\s*true/.test(before), 'precondition: not bare');

  const fx = path.join(root, 'fx.test.mjs');
  fs.writeFileSync(fx, [
    "import test from 'node:test';",
    "import { execFileSync } from 'node:child_process';",
    `test('env-less git init', () => { execFileSync(${GIT}, ['init', '-q'], { cwd: ${JSON.stringify(elsewhere)}, stdio: 'ignore' }); });`,
    '',
  ].join('\n'));

  // NODE_TEST_CONTEXT marks THIS process as a test worker; inherited, it makes the inner `node --test` a silent no-op.
  const { NODE_TEST_CONTEXT, ...ambient } = process.env;
  const planted = {
    ...ambient,
    NODE_OPTIONS: '--max-old-space-size=2048',
    GIT_DIR: path.join(sandbox, '.git'),
    GIT_INDEX_FILE: path.join(sandbox, '.git', 'index'),
  };
  const run = (env) => spawnSync(process.execPath, ['--test', '--test-concurrency=1', fx], { cwd: root, env, encoding: 'utf8', timeout: 100000 });

  // control first: the hazard is real on this git, or the main assertion proves nothing
  const ctl = run(planted);
  assert.equal(ctl.status, 0, 'control child ran: ' + (ctl.stderr || '').slice(0, 200));
  assert.match(fs.readFileSync(cfg, 'utf8'), /bare\s*=\s*true/, 'control: an unstripped env flips the sandbox repo to bare');

  fs.writeFileSync(cfg, before); // restore, then the real run
  const r = run(testChildEnv(planted));
  assert.equal(r.status, 0, 'child ran: ' + (r.stderr || '').slice(0, 200));
  assert.equal(fs.readFileSync(cfg, 'utf8'), before, 'sandbox .git/config unchanged');
  assert.ok(fs.existsSync(path.join(elsewhere, '.git')), 'the child init landed where it was aimed');
});

test('scripts/test.mjs hands its node --test child testChildEnv(), never the bare ambient env', () => {
  const src = fs.readFileSync(path.join(here, '..', 'test.mjs'), 'utf8');
  assert.match(src, /testChildEnv\(\)/);
  assert.match(src, /env: testChildEnv\(\)/);
});
