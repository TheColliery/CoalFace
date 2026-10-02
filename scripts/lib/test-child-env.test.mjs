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

// The child spawn shape scripts/test.mjs uses (process.execPath --test <files>), run on fixture test files. The ambient
// GIT_DIR / GIT_INDEX_FILE are planted at a SANDBOX repo under os.tmpdir(), never at the real one.
function rig(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-h1-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const g = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], env: gitTestEnv(root) });
  const sandbox = path.join(root, 'sandbox');
  const elsewhere = path.join(root, 'elsewhere');
  fs.mkdirSync(sandbox);
  fs.mkdirSync(elsewhere);
  g(sandbox, ['init', '-q', '.']);
  assert.ok(fs.existsSync(path.join(sandbox, '.git')), 'the fixture own .git exists before the run');
  // NODE_TEST_CONTEXT marks THIS process as a test worker; inherited, it makes the inner `node --test` a silent no-op.
  const { NODE_TEST_CONTEXT, ...ambient } = process.env;
  const planted = {
    ...ambient,
    CF_OUT: path.join(root, 'keys.json'),
    CF_ELSEWHERE: elsewhere,
    NODE_OPTIONS: '--max-old-space-size=2048',
    GIT_DIR: path.join(sandbox, '.git'),
    GIT_INDEX_FILE: path.join(sandbox, '.git', 'index'),
  };
  const run = (fixture, env) => spawnSync(process.execPath, ['--test', '--test-concurrency=1', fixture], { cwd: root, env, encoding: 'utf8', timeout: 100000 });
  return { root, sandbox, elsewhere, planted, run, cfg: path.join(sandbox, '.git', 'config') };
}

// PLATFORM-INDEPENDENT class property: no GIT_* key is visible inside the suite child. The fixture records its own
// GIT_* env keys; a control run proves the fixture can see a planted key, so an empty list is a real reading.
test('H1: a planted GIT_DIR / GIT_INDEX_FILE is not visible inside the suite child (control: the unstripped child sees both)', (t) => {
  const { root, planted, run } = rig(t);
  const out = path.join(root, 'keys.json');
  const fx = path.join(root, 'keys.test.mjs');
  fs.writeFileSync(fx, [
    "import test from 'node:test';",
    "import fs from 'node:fs';",
    "test('record GIT_* keys', () => { fs.writeFileSync(process.env.CF_OUT, JSON.stringify(Object.keys(process.env).filter((k) => /^GIT_/i.test(k)).sort())); });",
    '',
  ].join('\n'));
  const keys = (env) => {
    const r = run(fx, env);
    assert.equal(r.status, 0, 'fixture child ran: ' + (r.stderr || r.stdout || '').slice(0, 200));
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  };
  // includes, not equals: an ambient GIT_* the box itself sets (GIT_EDITOR here) is also visible to the control child
  const seen = keys(planted);
  assert.ok(seen.includes('GIT_DIR') && seen.includes('GIT_INDEX_FILE'), 'control: the unstripped child sees the planted keys, got ' + seen);
  fs.rmSync(out);
  assert.deepEqual(keys(testChildEnv(planted)), [], 'the stripped child sees no GIT_* key');
});

// CAPABILITY-GATED leg (its own test, one skippable leg): whether an env-less `git init` under a planted absolute GIT_DIR
// writes `bare = true` is a property of THIS git, probed here by the control run, never assumed from the platform.
test('H1: where a planted GIT_DIR flips a sandbox repo bare, the stripped suite child leaves its config byte-identical', (t) => {
  const { root, sandbox, elsewhere, planted, run, cfg } = rig(t);
  const before = fs.readFileSync(cfg, 'utf8');
  assert.ok(!/bare\s*=\s*true/.test(before), 'precondition: not bare');
  const fx = path.join(root, 'fx.test.mjs');
  fs.writeFileSync(fx, [
    "import test from 'node:test';",
    "import { execFileSync } from 'node:child_process';",
    "test('env-less git init', () => { execFileSync(" + GIT + ", ['init', '-q'], { cwd: process.env.CF_ELSEWHERE, stdio: 'ignore' }); });",
    '',
  ].join('\n'));

  const ctl = run(fx, planted);
  assert.equal(ctl.status, 0, 'control child ran: ' + (ctl.stderr || ctl.stdout || '').slice(0, 200));
  if (!/bare\s*=\s*true/.test(fs.readFileSync(cfg, 'utf8'))) {
    t.skip('this git does not write bare = true on an env-less init under a planted GIT_DIR (the hazard does not reproduce here); the class property is asserted by the test above');
    return;
  }
  fs.writeFileSync(cfg, before); // restore, then the real run
  const r = run(fx, testChildEnv(planted));
  assert.equal(r.status, 0, 'child ran: ' + (r.stderr || r.stdout || '').slice(0, 200));
  assert.equal(fs.readFileSync(cfg, 'utf8'), before, 'sandbox .git/config unchanged');
  assert.ok(fs.existsSync(path.join(elsewhere, '.git')), 'the child init landed where it was aimed, not at the planted GIT_DIR');
  assert.ok(fs.existsSync(path.join(sandbox, '.git')));
});

test('scripts/test.mjs hands its node --test child testChildEnv(), never the bare ambient env', () => {
  const src = fs.readFileSync(path.join(here, '..', 'test.mjs'), 'utf8');
  assert.match(src, /testChildEnv\(\)/);
  assert.match(src, /env: testChildEnv\(\)/);
});
