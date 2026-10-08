// The test runner's child spawn plan (CWK-199's class). See test-spawn.mjs for the reasons.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testSpawnPlan, HEAP_FLAG, TEST_TIMEOUT_MS } from './test-spawn.mjs';

const ROOM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('test-spawn: the argv runs the files serially under a finite per-test clock, after --test and before the file list', () => {
  const { args } = testSpawnPlan(['a.test.mjs', 'b.test.mjs'], {});
  assert.deepEqual(args, ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`, 'a.test.mjs', 'b.test.mjs']);
});

test('test-spawn: the deadline is finite and above twice the slowest measured file (82.1 s, 2026-10-08)', () => {
  assert.ok(Number.isInteger(TEST_TIMEOUT_MS) && TEST_TIMEOUT_MS >= 2 * 82123 && TEST_TIMEOUT_MS <= 600000, String(TEST_TIMEOUT_MS));
});

test('test-spawn: the env carries the heap cap for every descendant', () => {
  const { env } = testSpawnPlan(['a.test.mjs'], { PATH: '/bin' });
  assert.equal(env.NODE_OPTIONS, HEAP_FLAG);
  assert.equal(HEAP_FLAG, '--max-old-space-size=2048');
  assert.equal(env.PATH, '/bin');
});

test('test-spawn: a caller NODE_OPTIONS without a heap flag is kept and the cap appended', () => {
  assert.equal(testSpawnPlan(['a'], { NODE_OPTIONS: '--no-warnings' }).env.NODE_OPTIONS, '--no-warnings ' + HEAP_FLAG);
});

test('test-spawn: a caller heap flag stays as set, in either spelling, never doubled', () => {
  for (const caller of ['--max-old-space-size=1024 --no-warnings', '--max_old_space_size=1024', '--no-warnings --max-old_space-size=1024']) {
    assert.equal(testSpawnPlan(['a'], { NODE_OPTIONS: caller }).env.NODE_OPTIONS, caller);
  }
});

test('test-spawn: the GIT_* family is stripped (testChildEnv) and the base env is not mutated', () => {
  const base = { GIT_DIR: '/x', git_index_file: '/y', NODE_OPTIONS: '--no-warnings' };
  const { env } = testSpawnPlan(['a'], base);
  assert.deepEqual(Object.keys(env).filter((k) => /^GIT_/i.test(k)), []);
  assert.deepEqual(base, { GIT_DIR: '/x', git_index_file: '/y', NODE_OPTIONS: '--no-warnings' });
});

test('test-spawn: concurrency never rides NODE_OPTIONS (Node 24.19 refuses it there)', () => {
  assert.ok(!/concurrency/.test(testSpawnPlan(['a'], {}).env.NODE_OPTIONS));
});

test('test-spawn: scripts/test.mjs spawns its child with the plan argv and env (the wiring, not just the builder)', () => {
  const src = fs.readFileSync(path.join(ROOM, 'scripts', 'test.mjs'), 'utf8');
  assert.match(src, /testSpawnPlan\(TESTS, process\.env\)/);
  assert.match(src, /spawnSync\(process\.execPath, plan\.args, \{[^}]*env: plan\.env/);
});
