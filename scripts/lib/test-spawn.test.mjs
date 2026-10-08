// The test runner's child spawn plan (CWK-199's class). See test-spawn.mjs for the reasons.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { testSpawnPlan, runPlan, HEAP_FLAG, TEST_TIMEOUT_MS, RUN_DEADLINE_MS } from './test-spawn.mjs';

const ROOM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('test-spawn: the argv runs the files serially under a finite per-test clock, after --test and before the file list', () => {
  const { args } = testSpawnPlan(['a.test.mjs', 'b.test.mjs'], {});
  assert.deepEqual(args, ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`, '--test-force-exit', 'a.test.mjs', 'b.test.mjs']);
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
  assert.match(src, /await runPlan\(plan, \{ cwd: repo \}\)/);
});

test('test-spawn: the whole-run deadline is finite and about 4x the suite wall (154 s, 2026-10-08)', () => {
  assert.ok(Number.isInteger(RUN_DEADLINE_MS) && RUN_DEADLINE_MS >= 2 * 154000 && RUN_DEADLINE_MS <= 1800000, String(RUN_DEADLINE_MS));
});

// 08b b1 (the reviewer's witness): a file holding a handle open outlives --test-timeout and the run never ends. The file is
// planted under os.tmpdir(); the run deadline is injected short, and runPlan itself kills the run
// at the deadline, so this test cannot hang the suite.
function plantedRun(mutate, timeoutMs = 2000) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hang-'));
  const file = path.join(dir, 'hang.test.mjs');
  fs.writeFileSync(file, "import test from 'node:test';\ntest('holds a handle', () => { setInterval(() => {}, 1000); });\n");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a run nested in node --test would inherit the outer runner's context
  const plan = testSpawnPlan([file], env, { timeoutMs });
  if (mutate) mutate(plan);
  const started = Date.now();
  return runPlan(plan, { cwd: dir, deadlineMs: 15000, stdio: 'ignore' }).then((status) => {
    fs.rmSync(dir, { recursive: true, force: true });
    return { status, ms: Date.now() - started };
  });
}

// With force-exit this holds on Node 22 and 24: a passing test whose file holds a handle ends the run at once (it proves the flag, not the clock).
test('test-spawn: a handle-holding test file ends the run before the deadline (force-exit) and a passing test reports success', async () => {
  const r = await plantedRun(null, 600000); // the per-test clock is injected far above the run deadline, so only --test-force-exit can end this run early
  assert.ok(r.ms < 14000, 'ended before the deadline: ' + r.ms);
  assert.equal(r.status, 0);
});

// The per-test clock is injected LONGER (600 s) than the 15 s run deadline, so the deadline must fire first whatever the timeout's scope
// (Node 22 applies --test-timeout per FILE and would end a 2 s clock early; Node 24 per test). Zone rule, ninth amendment.
test('test-spawn: WITHOUT --test-force-exit the same file hangs to the deadline, which kills the run and fails it (the deadline is real)', async () => {
  const r = await plantedRun((plan) => { plan.args = plan.args.filter((a) => a !== '--test-force-exit'); }, 600000);
  assert.ok(r.ms >= 14000, 'ran to the deadline: ' + r.ms);
  assert.equal(r.status, 1);
});
