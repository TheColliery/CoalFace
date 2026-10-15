import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(repo, 'skills', 'coalface', 'scripts', 'machine-reading.mjs');
const { decide, cpuBusyFromTimes, cgroupCpu, parseArgs, formatLine, DEFAULTS } = await import(pathToFileURL(SCRIPT).href);

const idle = { cpuBusyPct: 5, cpuSource: 'host', memFreePct: 60 };
// running: 1 = the caller already holds a unit, so the reading alone decides (running 0 always admits one)
const held = { ...idle, running: 1 };

test('defaults are the declared ones: WAIT at cpu 80, below mem 10', () => {
  assert.deepEqual(DEFAULTS, { cpuMaxPct: 80, memMinPct: 10 });
});

test('idle machine reads BREATHE', () => {
  const r = decide({ ...idle });
  assert.equal(r.verdict, 'BREATHE');
  assert.equal(r.admittedBy, 'reading');
});

test('busy CPU at the threshold reads WAIT (at or above)', () => {
  assert.equal(decide({ ...held, cpuBusyPct: 80 }).verdict, 'WAIT');
  assert.equal(decide({ ...held, cpuBusyPct: 79.9 }).verdict, 'BREATHE');
});

test('memory below the minimum reads WAIT; at the minimum reads BREATHE', () => {
  assert.equal(decide({ ...held, memFreePct: 9.9 }).verdict, 'WAIT');
  assert.equal(decide({ ...held, memFreePct: 10 }).verdict, 'BREATHE');
});

test('an unmeasured CPU (null) never blocks on its own; neither does unmeasured memory', () => {
  // running: 1 (held): with 0 the first unit is always admitted, so these calls could never fail
  assert.equal(decide({ ...held, cpuBusyPct: null, cpuSource: 'unmeasured', memFreePct: 50 }).verdict, 'BREATHE');
  assert.equal(decide({ ...held, cpuBusyPct: 5, cpuSource: 'host', memFreePct: null }).verdict, 'BREATHE');
  // 15b item 4 (owner, 2026-10-15): with EVERY axis unmeasured a held box releases one unit at a time, so this case is no longer BREATHE: it is WAIT (named, with its own test below)
  const none = decide({ ...held, cpuBusyPct: null, cpuSource: 'unmeasured', memFreePct: null });
  assert.equal(none.verdict, 'WAIT');
});

test('running === 0 admits one unit whatever the reading says, and names the rule', () => {
  const r = decide({ cpuBusyPct: 100, cpuSource: 'host', memFreePct: 1, running: 0 });
  assert.equal(r.verdict, 'BREATHE');
  assert.equal(r.admittedBy, 'running-zero');
  const second = decide({ cpuBusyPct: 100, cpuSource: 'host', memFreePct: 1, running: 1 });
  assert.equal(second.verdict, 'WAIT');
  assert.equal(second.admittedBy, null);
});

test('user thresholds override the defaults', () => {
  assert.equal(decide({ ...held, cpuBusyPct: 60, cpuMaxPct: 50 }).verdict, 'WAIT');
  assert.equal(decide({ ...held, memFreePct: 30, memMinPct: 40 }).verdict, 'WAIT');
});

test('cpuBusyFromTimes: busy share of the delta; an empty list or zero delta is unmeasured (null)', () => {
  const a = [{ times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } }];
  const b = [{ times: { user: 200, nice: 0, sys: 200, idle: 1600, irq: 0 } }];
  assert.equal(cpuBusyFromTimes(a, b), 20);
  assert.equal(cpuBusyFromTimes([], []), null);
  assert.equal(cpuBusyFromTimes(a, a), null);
  assert.equal(cpuBusyFromTimes(a, []), null);
});

test('cgroup source is chosen when a quota is present: busy = usage over quota cores', () => {
  // quota 200000us per 100000us period = 2 cores; 1s sample = 2,000,000us of quota; used 500,000us = 25%
  const r = cgroupCpu({ cpuMax: '200000 100000\n', statA: 'usage_usec 1000000\n', statB: 'usage_usec 1500000\n', elapsedMs: 1000 });
  assert.equal(r.source, 'cgroup');
  assert.equal(r.busyPct, 25);
});

test('cgroup: no quota ("max"), missing or garbage content falls back to the host reading', () => {
  assert.equal(cgroupCpu({ cpuMax: 'max 100000\n', statA: 'usage_usec 1\n', statB: 'usage_usec 2\n', elapsedMs: 1000 }), null);
  assert.equal(cgroupCpu({ cpuMax: null, statA: null, statB: null, elapsedMs: 1000 }), null);
  assert.equal(cgroupCpu({ cpuMax: '200000 100000', statA: 'x', statB: 'y', elapsedMs: 1000 }), null);
  assert.equal(cgroupCpu({ cpuMax: '200000 100000', statA: 'usage_usec 5', statB: 'usage_usec 5', elapsedMs: 0 }), null);
});

test('parseArgs: flags parsed with range checks; an unknown flag or bad value is refused', () => {
  assert.deepEqual(parseArgs(['--cpu-max', '70', '--mem-min', '15', '--running', '2', '--json']), { cpuMaxPct: 70, memMinPct: 15, running: 2, json: true, help: false });
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  for (const bad of [['--nope'], ['--cpu-max', '0'], ['--cpu-max', '101'], ['--cpu-max'], ['--mem-min', '100'], ['--mem-min', 'x'], ['--running', '-1'], ['extra']]) {
    assert.ok(parseArgs(bad).error, `refused: ${bad.join(' ')}`);
  }
});

test('formatLine: the human line names verdict, cpu source, memory and GPU N/A', () => {
  const line = formatLine(decide({ ...idle }));
  assert.match(line, /^BREATHE — cpu 5% \(host\) · mem free 60% · gpu N\/A$/);
  assert.match(formatLine(decide({ cpuBusyPct: null, cpuSource: 'unmeasured', memFreePct: null })), /cpu unmeasured · mem unmeasured/);
  assert.match(formatLine(decide({ cpuBusyPct: 99, cpuSource: 'host', memFreePct: 1, running: 0 })), /admitted: running 0/);
});

// One spawn test of the CLI: shape only, never a live verdict.
test('CLI: --json prints the structured reading; exit code is 0 or 1; --help 0; unknown flag 64 with usage on stderr', () => {
  const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' };
  const j = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8', timeout: 60000, env });
  assert.ok([0, 1].includes(j.status), `exit ${j.status}: ${j.stderr}`);
  const o = JSON.parse(j.stdout);
  assert.ok(['BREATHE', 'WAIT'].includes(o.verdict));
  for (const k of ['cpuBusyPct', 'cpuSource', 'memFreePct', 'gpu', 'thresholds', 'running', 'admittedBy']) assert.ok(k in o, `key ${k}`);
  assert.equal(o.gpu, 'N/A');
  const h = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8', timeout: 60000, env });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /machine-reading/);
  const u = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8', timeout: 60000, env });
  assert.equal(u.status, 64);
  assert.match(u.stderr, /usage/i);
  assert.equal(u.stdout, '');
});

// 09a: the canon wave runner (scripts/lib/wave-run.mjs, adopted by blob id) calls the reading as a sibling file, scripts/lib/machine-reading.mjs, and its own test holds that copy to
// blob 1c550b66. This room therefore keeps THREE copies of one file (skills/coalface/scripts/ the source, its plugin/ twin, scripts/lib/ for the runner): a NAMED duplication, the
// canon's rule being that the file is never edited in a room, so the copies change together or this test goes red.
test('the three copies of machine-reading.mjs are byte for byte one file (the source, its plugin/ twin, and the copy the canon wave runner reads)', async () => {
  const fs = await import('node:fs');
  const copies = [SCRIPT, path.join(repo, 'plugin', 'skills', 'coalface', 'scripts', 'machine-reading.mjs'), path.join(repo, 'scripts', 'lib', 'machine-reading.mjs')];
  const [src, twin, runner] = copies.map((p) => fs.readFileSync(p));
  assert.ok(src.length > 0);
  assert.ok(src.equals(twin), 'the plugin/ twin differs from the source');
  // 15b: the source moved ahead of the canon pin (CWK2-023/025 phase 1). scripts/lib/machine-reading.mjs stays at the blob the canon wave runner's own test pins until the
  // canon re-adopts the new file by blob id (the chief's order, BB-87); it is never edited here. So it must be the source OR that one pinned blob, and nothing else.
  const blobId = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
  const CANON_PINNED = '1c550b6605125aebda5a2552294eaeb9a5d488ba';
  const runnerLf = Buffer.from(runner.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  assert.ok(src.equals(runner) || blobId(runnerLf) === CANON_PINNED, 'scripts/lib/machine-reading.mjs is neither the source nor the canon-pinned blob: re-copy it, never edit it (an improvement goes to the canon through the chief)');
});

// ---------------------------------------------------------------------------
// 15b unit 2 (CWK2-023 phase 1, CWK2-025 finding 2): the reading's four fixes, each red first.
// ---------------------------------------------------------------------------
const MR = await import(pathToFileURL(SCRIPT).href);
const UINT64_MAX = 18446744073709551615; // what libuv hands back when a cgroup holds no memory limit (as a JS number it is 2**64)

test('memory sentinel: a constrainedMemory of UINT64_MAX is NO limit, free memory is read over the machine total', () => {
  assert.equal(MR.memFreePct({ avail: 4e9, constrained: UINT64_MAX, total: 8e9 }), 50);
});

test('memory sentinel: each of the three no-limit conditions holds on its own (0 · at or above 2**63 · above the machine total)', () => {
  assert.equal(MR.memFreePct({ avail: 4e9, constrained: 0, total: 8e9 }), 50, 'zero = no limit');
  assert.equal(MR.memFreePct({ avail: 2 ** 62, constrained: 2 ** 63, total: 2 ** 64 }), 25, '2**63 is no limit even when it is below the total');
  assert.equal(MR.memFreePct({ avail: 4e9, constrained: 16e9, total: 8e9 }), 50, 'a limit above the machine total is no limit');
});

test('memory sentinel control: a real limit below the total is the denominator', () => {
  assert.equal(MR.memFreePct({ avail: 1e9, constrained: 2e9, total: 8e9 }), 50);
  assert.equal(MR.memFreePct({ avail: 9e9, constrained: 2e9, total: 8e9 }), 100, 'capped at 100');
});

test('memory axis is UNMEASURED (null), never os.freemem(), when availableMemory is absent or unusable', () => {
  assert.equal(MR.memFreePct({ avail: null, constrained: 0, total: 8e9 }), null);
  assert.equal(MR.memFreePct({ avail: NaN, constrained: 0, total: 8e9 }), null);
  assert.equal(MR.memFreePct({ avail: 4e9, constrained: 0, total: 0 }), null);
});

test('live values on this runner (diagnostic only: read them from the CI log)', (t) => {
  const live = { constrainedMemory: process.constrainedMemory(), availableMemory: process.availableMemory(), totalmem: os.totalmem() };
  for (const [k, v] of Object.entries(live)) assert.equal(typeof v, 'number', k);
  t.diagnostic(`process.constrainedMemory()=${live.constrainedMemory} process.availableMemory()=${live.availableMemory} os.totalmem()=${live.totalmem} os.availableParallelism()=${os.availableParallelism()} os.cpus().length=${os.cpus().length}`);
});

// 16 logical CPUs, the first `hot` saturated for the whole window, the rest idle. The e7 witness shape: 8 threads pinned to 2 CPUs read BREATHE at 20.6%.
const cpuSet = (n, hot) => {
  const mk = (busyShare) => ({ times: { user: 1000 * busyShare, nice: 0, sys: 0, idle: 1000 * (1 - busyShare), irq: 0 } });
  const before = Array.from({ length: n }, () => ({ times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }));
  const after = Array.from({ length: n }, (_, i) => mk(i < hot ? 1 : 0));
  return { before, after };
};

test('usable cores: 2 of 16 CPUs saturated and 2 usable reads 100% busy (the e7 witness); the old whole-machine mean read 12.5%', () => {
  const { before, after } = cpuSet(16, 2);
  assert.equal(cpuBusyFromTimes(before, after), 12.5, 'no usable count: the whole-machine mean, as before');
  assert.equal(cpuBusyFromTimes(before, after, 2), 100);
});

test('usable cores: the k busiest CPUs are averaged, not the first k', () => {
  const { before, after } = cpuSet(16, 0);
  after[9] = { times: { user: 1000, nice: 0, sys: 0, idle: 0, irq: 0 } };
  after[14] = { times: { user: 500, nice: 0, sys: 0, idle: 500, irq: 0 } };
  assert.equal(cpuBusyFromTimes(before, after, 2), 75);
  assert.equal(cpuBusyFromTimes(before, after, 1), 100);
});

test('usable cores: an UNconfined box (usable = all CPUs, or more, or absent) reads exactly the whole-machine mean as before', () => {
  const { before, after } = cpuSet(16, 5);
  const whole = cpuBusyFromTimes(before, after);
  assert.equal(cpuBusyFromTimes(before, after, 16), whole);
  assert.equal(cpuBusyFromTimes(before, after, 64), whole);
  assert.equal(cpuBusyFromTimes(before, after, undefined), whole);
  assert.equal(cpuBusyFromTimes(before, after, 0), whole, 'a nonsense usable count falls back to the whole machine');
});

test('a WAIT line names each axis that held and the threshold it crossed; the BREATHE line keeps its shape', () => {
  assert.equal(formatLine(decide({ ...held, cpuBusyPct: 92, memFreePct: 5 })), 'WAIT — cpu 92% (host) · mem free 5% · gpu N/A · held: cpu 92% at or above 80%; mem free 5% below 10%');
  assert.equal(formatLine(decide({ ...held, cpuBusyPct: 92, memFreePct: 50, cpuMaxPct: 70 })), 'WAIT — cpu 92% (host) · mem free 50% · gpu N/A · held: cpu 92% at or above 70%');
  assert.equal(formatLine(decide({ ...held, memFreePct: 6, memMinPct: 20 })), 'WAIT — cpu 5% (host) · mem free 6% · gpu N/A · held: mem free 6% below 20%');
  assert.equal(formatLine(decide({ ...idle })), 'BREATHE — cpu 5% (host) · mem free 60% · gpu N/A');
});

test('every axis unmeasured: BREATHE only with --running 0 (one unit at a time); a second unit WAITs and says why', () => {
  const none = { cpuBusyPct: null, cpuSource: 'unmeasured', memFreePct: null };
  const first = decide({ ...none, running: 0 });
  assert.equal(first.verdict, 'BREATHE');
  assert.equal(first.admittedBy, 'running-zero');
  const second = decide({ ...none, running: 1 });
  assert.equal(second.verdict, 'WAIT');
  assert.deepEqual(second.reasons, ['every axis unmeasured']);
  assert.match(formatLine(second), /^WAIT — cpu unmeasured · mem unmeasured · gpu N\/A · held: every axis unmeasured$/);
  assert.match(formatLine(first), /admitted: running 0$/);
});

test('one axis measured and fine, the other unmeasured: BREATHE as before (only ALL unmeasured holds)', () => {
  assert.equal(decide({ cpuBusyPct: 5, cpuSource: 'host', memFreePct: null, running: 3 }).verdict, 'BREATHE');
  assert.equal(decide({ cpuBusyPct: null, cpuSource: 'unmeasured', memFreePct: 50, running: 3 }).verdict, 'BREATHE');
});

// An unconfined box is the whole-machine WEIGHTED mean even when the CPUs' time deltas differ (the confined branch averages shares equally, so it would read this differently).
test('usable cores: a box where usable equals the CPU count keeps the WEIGHTED whole-machine mean (unequal time deltas tell it from the equal-share mean)', () => {
  const { before, after } = cpuSet(16, 0);
  after[0] = { times: { user: 3000, nice: 0, sys: 0, idle: 0, irq: 0 } };
  for (let i = 1; i < 16; i++) after[i] = { times: { user: 0, nice: 0, sys: 0, idle: 1000, irq: 0 } };
  assert.equal(cpuBusyFromTimes(before, after), 16.7);
  assert.equal(cpuBusyFromTimes(before, after, 16), 16.7);
});

// The live path with no process.availableMemory (a runtime before Node 22.0.0, simulated by a preload that deletes it): the memory axis is UNMEASURED, never os.freemem().
test('CLI: with process.availableMemory absent the memory axis prints UNMEASURED (null), never an os.freemem() figure', () => {
  const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' };
  const r = spawnSync(process.execPath, ['--import', 'data:text/javascript,delete process.availableMemory;', SCRIPT, '--json', '--running', '1'], { encoding: 'utf8', timeout: 60000, env });
  assert.ok([0, 1].includes(r.status), `exit ${r.status}: ${r.stderr}`);
  assert.equal(JSON.parse(r.stdout).memFreePct, null);
});

// The live wiring of the usable count: a preload stubs os.cpus() (16 CPUs, 2 saturated between the two snapshots) and os.availableParallelism() (2), then the real script runs.
// A script that forgot to pass the usable count to the CPU reading would print the whole-machine mean (12.5), not the busiest two (100).
test('CLI live path: the usable count (os.availableParallelism) reaches the CPU reading -- 2 of 16 CPUs saturated and 2 usable prints cpuBusyPct 100', async (t) => {
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mr-preload-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const preload = path.join(dir, 'stub.mjs');
  fs.writeFileSync(preload, [
    "import os from 'node:os';",
    'let calls = 0;',
    'const snap = (hot) => Array.from({ length: 16 }, (_, i) => ({ times: { user: hot && i < 2 ? 1000 : 0, nice: 0, sys: 0, idle: hot && i < 2 ? 0 : (hot ? 1000 : 0), irq: 0 } }));',
    'os.cpus = () => snap(calls++ > 0);',
    'os.availableParallelism = () => 2;',
  ].join('\n'));
  const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' };
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, SCRIPT, '--json', '--running', '1'], { encoding: 'utf8', timeout: 60000, env });
  assert.ok([0, 1].includes(r.status), `exit ${r.status}: ${r.stderr}`);
  const o = JSON.parse(r.stdout);
  if (o.cpuSource !== 'host') { t.skip(`this runner reads the CPU from ${o.cpuSource}, not the host times (capability probe)`); return; }
  assert.equal(o.cpuBusyPct, 100);
});
