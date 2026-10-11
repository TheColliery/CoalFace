import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
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
  const none = decide({ ...held, cpuBusyPct: null, cpuSource: 'unmeasured', memFreePct: null });
  assert.equal(none.verdict, 'BREATHE');
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
  assert.ok(src.equals(runner), 'scripts/lib/machine-reading.mjs differs from the source: re-copy it, never edit it (an improvement goes to the canon through the chief)');
});
