// suite-run.test.mjs -- the room's suite judge (scripts/lib/suite-run.mjs) and the TAP-names MUST of testing.md: "a gate judges a test run by the TAP test names it
// expects, never by exit code and pass count alone". The planted files are written to a scratch folder under os.tmpdir() and run for real through the canon wave runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS } from './wave-run.mjs';
import { expectProblems, judgeNames, applyFloor, runSuite, runPinned, cli } from './suite-run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const LIMITS = { heapMb: 512, fileTimeoutMs: 30000, deadlineMs: 120000, serial: true };

function scratch(t) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf09a-suite-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const plant = (dir, name, body) => fs.writeFileSync(path.join(dir, name), "import test from 'node:test';\n" + body);

const GOOD = "test('first', () => {});\ntest('second', () => {});\n";
const EXIT_BEFORE = "process.exit(0);\ntest('never registered', () => {});\n";
// Three planted files: a real pass of two tests, a file that exits 0 before any test registers, a file whose run is ended by an exit(0) while its third test is still running
// (the first two have reported, the last two never do: measured on Node 24.19, TAP "# tests 2 / # pass 2" and exit 0).
const EXIT_AFTER_TWO = "test('first', () => {});\ntest('second', () => { setTimeout(() => process.exit(0), 150); });\ntest('third', async () => { await new Promise((r) => setTimeout(r, 1000)); });\ntest('fourth', () => {});\n";

test('the manifest drifts loudly: a roster file with no entry, an entry for a file outside the roster, both lists for one file, a bad floor or an empty names list are each a problem', () => {
  const files = ['a.test.mjs', 'b.test.mjs'];
  assert.deepEqual(expectProblems({ floors: { 'a.test.mjs': 2 }, names: { 'b.test.mjs': ['x'] } }, files), []);
  assert.match(expectProblems({ floors: { 'a.test.mjs': 2 }, names: {} }, files).join('|'), /b\.test\.mjs has no entry/);
  assert.match(expectProblems({ floors: { 'a.test.mjs': 2, 'c.test.mjs': 1 }, names: { 'b.test.mjs': ['x'] } }, files).join('|'), /floors names c\.test\.mjs, which is not in the roster/);
  assert.match(expectProblems({ floors: { 'a.test.mjs': 2, 'b.test.mjs': 1 }, names: { 'b.test.mjs': ['x'] } }, files).join('|'), /listed in both/);
  assert.match(expectProblems({ floors: { 'a.test.mjs': 0 }, names: { 'b.test.mjs': ['x'] } }, files).join('|'), /floor of a\.test\.mjs/);
  assert.match(expectProblems({ floors: { 'a.test.mjs': 1 }, names: { 'b.test.mjs': [] } }, files).join('|'), /names of b\.test\.mjs/);
  assert.match(expectProblems(null, files).join('|'), /"floors" object and a "names" object/);
});

test('the real manifest (scripts/test-expect.json) covers exactly the roster of scripts/test.mjs, in both directions', () => {
  const src = fs.readFileSync(path.join(repo, 'scripts', 'test.mjs'), 'utf8');
  const roster = [...src.matchAll(/^ {2}'((?:scripts|hooks)\/[^']+\.test\.(?:mjs|js))',?$/gm)].map((m) => m[1]);
  assert.ok(roster.length >= 25, `the roster read from test.mjs has only ${roster.length} files`);
  const expect = JSON.parse(fs.readFileSync(path.join(repo, 'scripts', 'test-expect.json'), 'utf8'));
  assert.deepEqual(expectProblems(expect, roster), []);
});

test('judgeNames is a multiset difference: a missing name, a name listed twice and reported once, and an unlisted extra', () => {
  assert.deepEqual(judgeNames(['a', 'b'], ['b', 'a']), { missing: [], extra: [] });
  assert.deepEqual(judgeNames(['a', 'b'], ['a']), { missing: ['b'], extra: [] });
  assert.deepEqual(judgeNames(['a', 'a'], ['a']), { missing: ['a'], extra: [] });
  assert.deepEqual(judgeNames(['a'], ['a', 'z']), { missing: [], extra: ['z'] });
});

test('applyFloor judges only a file that otherwise passed: below the floor is FAIL naming both numbers, at or above it is untouched, a red file keeps its status', () => {
  const pass = { file: 'f', status: STATUS.PASS, counts: { tests: 3 } };
  assert.equal(applyFloor(pass, 3), pass);
  const low = applyFloor(pass, 4);
  assert.equal(low.status, STATUS.FAIL);
  assert.match(low.reason, /ran 3 test\(s\), below its floor of 4/);
  const vac = { file: 'f', status: STATUS.VACUOUS, counts: null };
  assert.equal(applyFloor(vac, 4), vac);
  assert.equal(applyFloor({ file: 'f', status: STATUS.PASS, counts: null }, 1).status, STATUS.FAIL);
});

test('TAP-names MUST, layer 1 (measured): a file that calls process.exit(0) before its tests register exits 0 and the run is RED as VACUOUS', async (t) => {
  const dir = scratch(t);
  plant(dir, 'good.test.mjs', GOOD);
  plant(dir, 'early.test.mjs', EXIT_BEFORE);
  const files = ['good.test.mjs', 'early.test.mjs'];
  const run = await runSuite({ files, expect: { floors: { 'good.test.mjs': 2, 'early.test.mjs': 1 }, names: {} }, cwd: dir, ...LIMITS });
  assert.equal(run.exitCode, 1, 'the run must be red');
  const by = Object.fromEntries(run.results.map((r) => [r.file, r.status]));
  assert.deepEqual(by, { 'good.test.mjs': STATUS.PASS, 'early.test.mjs': STATUS.VACUOUS });
});

test('TAP-names MUST, layer 2 (the gap wave-run names open, closed here): a file that exits 0 in the middle of its run reads PASS to the runner and is FAIL against its floor', async (t) => {
  const dir = scratch(t);
  plant(dir, 'mid.test.mjs', EXIT_AFTER_TWO);
  const blind = await runSuite({ files: ['mid.test.mjs'], expect: { floors: { 'mid.test.mjs': 2 }, names: {} }, cwd: dir, ...LIMITS });
  assert.equal(blind.results[0].status, STATUS.PASS, 'control: with a floor of 2 the runner alone cannot see the test that never reported');
  assert.equal(blind.exitCode, 0);
  const judged = await runSuite({ files: ['mid.test.mjs'], expect: { floors: { 'mid.test.mjs': 4 }, names: {} }, cwd: dir, ...LIMITS });
  assert.equal(judged.exitCode, 1);
  assert.equal(judged.results[0].status, STATUS.FAIL);
  assert.match(judged.results[0].reason, /below its floor of 4/);
});

test('TAP-names MUST, layer 3: a file listed in the names manifest must report every listed top-level name; a missing one is FAIL, an unlisted one is reported and not a failure', async (t) => {
  const dir = scratch(t);
  plant(dir, 'named.test.mjs', GOOD);
  const ok = await runSuite({ files: ['named.test.mjs'], expect: { floors: {}, names: { 'named.test.mjs': ['first', 'second'] } }, cwd: dir, ...LIMITS });
  assert.equal(ok.exitCode, 0);
  assert.deepEqual(ok.extras, {});
  const missing = await runSuite({ files: ['named.test.mjs'], expect: { floors: {}, names: { 'named.test.mjs': ['first', 'second', 'third'] } }, cwd: dir, ...LIMITS });
  assert.equal(missing.exitCode, 1);
  assert.match(missing.results[0].reason, /expected test name\(s\) missing: third/);
  const extra = await runSuite({ files: ['named.test.mjs'], expect: { floors: {}, names: { 'named.test.mjs': ['first'] } }, cwd: dir, ...LIMITS });
  assert.equal(extra.exitCode, 0);
  assert.deepEqual(extra.extras, { 'named.test.mjs': ['second'] });
  plant(dir, 'mid.test.mjs', EXIT_AFTER_TWO);
  const gone = await runSuite({ files: ['mid.test.mjs'], expect: { floors: {}, names: { 'mid.test.mjs': ['first', 'second', 'third', 'fourth'] } }, cwd: dir, ...LIMITS });
  assert.equal(gone.exitCode, 1, 'a test that vanished mid-run is a missing name');
});

test('runPinned returns the top-level names of a passing file, which wave-run keeps only for a failing one', async (t) => {
  const dir = scratch(t);
  plant(dir, 'named.test.mjs', GOOD);
  const { result, names } = await runPinned({ file: 'named.test.mjs', cwd: dir, env: process.env, heapMb: 512, fileTimeoutMs: 30000, deadlineMs: 60000 });
  assert.equal(result.status, STATUS.PASS);
  assert.deepEqual(names, ['first', 'second']);
});

test('an invalid manifest stops the run before any child starts (exit 1, the problems named)', async (t) => {
  const dir = scratch(t);
  plant(dir, 'a.test.mjs', GOOD);
  const run = await runSuite({ files: ['a.test.mjs'], expect: { floors: {}, names: {} }, cwd: dir, ...LIMITS });
  assert.equal(run.exitCode, 1);
  assert.equal(run.results.length, 0);
  assert.match(run.problems.join('|'), /a\.test\.mjs has no entry/);
});

test('scripts/test.mjs is wired to the judge with the room numbers: finite heap, per-test clock, per-file clock and whole-run deadline, and the manifest path', () => {
  const src = fs.readFileSync(path.join(repo, 'scripts', 'test.mjs'), 'utf8');
  const m = /const LIMITS = \{ heapMb: (\d+), fileTimeoutMs: (\d+), deadlineMs: (\d+), fileClockMs: (\d+) \};/.exec(src);
  assert.ok(m, 'scripts/test.mjs carries its LIMITS line');
  const [heap, perTest, deadline, perFile] = m.slice(1).map(Number);
  assert.equal(heap, 2048);
  assert.ok(perTest >= 2 * 82100, 'the clock per test stays above twice the slowest file measured (verify.test.mjs, 82.1 s, 2026-10-08)');
  assert.ok(perFile > 82100 && perFile < deadline, 'a file clock above the slowest file and below the whole-run deadline');
  assert.ok(deadline >= 4 * 82100 && deadline <= 900000, 'the deadline is finite and about 4x the serial suite');
  assert.match(src, /expectFile: 'scripts\/test-expect\.json'/);
  assert.match(src, /import\('\.\/lib\/suite-run\.mjs'\)/);
});

// cli(): the entry point scripts/test.mjs calls. A temp "repo" stands in for the room.
function cliIn(dir, { tests, argv = [], env = process.env, expect = null } = {}) {
  if (expect) fs.writeFileSync(path.join(dir, 'test-expect.json'), JSON.stringify(expect));
  const lines = { out: [], err: [] };
  const io = { out: (s) => lines.out.push(String(s)), err: (s) => lines.err.push(String(s)) };
  return cli({ repo: dir, tests, dirs: ['.'], expectFile: 'test-expect.json', argv, limits: { heapMb: 512, fileTimeoutMs: 30000, deadlineMs: 120000, serial: true }, env, io }).then((code) => ({ code, ...lines }));
}

test('cli: the children get the GIT_* family stripped (any case) and the heap cap, whatever the caller env holds', async (t) => {
  const dir = scratch(t);
  plant(dir, 'env.test.mjs', "import assert from 'node:assert/strict';\ntest('child env', () => {\n  assert.equal(process.env.GIT_DIR, undefined);\n  assert.equal(process.env.git_index_file, undefined);\n  assert.match(process.env.NODE_OPTIONS, /--max-old-space-size=512/);\n});\n");
  const r = await cliIn(dir, { tests: ['env.test.mjs'], env: { ...process.env, NODE_OPTIONS: '', GIT_DIR: 'C:/planted', git_index_file: 'C:/planted/index' }, expect: { floors: { 'env.test.mjs': 1 }, names: {} } });
  assert.equal(r.code, 0, r.out.join('\n') + r.err.join('\n'));
});

test('cli: a listed file that is missing and a test file on disk that is not listed are each a red run before any child starts', async (t) => {
  const dir = scratch(t);
  plant(dir, 'a.test.mjs', GOOD);
  const missing = await cliIn(dir, { tests: ['a.test.mjs', 'gone.test.mjs'], expect: { floors: { 'a.test.mjs': 2, 'gone.test.mjs': 1 }, names: {} } });
  assert.equal(missing.code, 1);
  assert.match(missing.err.join('\n'), /1 listed test file\(s\) MISSING — gone\.test\.mjs/);
  plant(dir, 'orphan.test.mjs', GOOD);
  const orphan = await cliIn(dir, { tests: ['a.test.mjs'], expect: { floors: { 'a.test.mjs': 2 }, names: {} } });
  assert.equal(orphan.code, 1);
  assert.match(orphan.err.join('\n'), /1 on-disk test\(s\) NOT in the suite — \.\/orphan\.test\.mjs|NOT in the suite/);
});

test('cli: a green run prints the summary line and the per-test totals; an unknown argument is usage (64)', async (t) => {
  const dir = scratch(t);
  plant(dir, 'a.test.mjs', GOOD);
  const ok = await cliIn(dir, { tests: ['a.test.mjs'], expect: { floors: { 'a.test.mjs': 2 }, names: {} } });
  assert.equal(ok.code, 0);
  assert.match(ok.out.join('\n'), /wave-run: 1 file · pass 1 · fail 0/);
  assert.match(ok.out.join('\n'), /test runner: 2 test\(s\) · pass 2 · skipped 0/);
  const bad = await cliIn(dir, { tests: ['a.test.mjs'], argv: ['--bogus'], expect: { floors: { 'a.test.mjs': 2 }, names: {} } });
  assert.equal(bad.code, 64);
});
