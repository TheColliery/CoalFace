// 29ch: the admission reading takes its two thresholds from the config itself. A cloned repo's project config reaches the
// agent's shell only as a plain integer, or not at all: the engine (skills/coalface/scripts/admission.mjs) reads the
// config, keeps an in-range integer, and runs the reader with an argv array. Hermetic spawn tests: sandbox HOME and TEMP,
// the GIT_* family and the plugin variables cleared, every spawn bounded.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_CONFIG_BYTES as REPO_BOUND } from './lib/repo-fs.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join(repo, 'skills', 'coalface', 'scripts');
const engine = path.join(skill, 'admission.mjs');
const reader = path.join(skill, 'machine-reading.mjs');
const conductor = path.join(repo, 'hooks', 'coalface-conductor.js');
const PAYLOAD = '80; echo pwned > marker.txt; echo';
const SPAWN_TIMEOUT_MS = 60000;
const DEFAULT = { cpuMaxPct: 80, memMinPct: 10 };

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-admission-')));
  t.after(() => {
    if (!root.startsWith(fs.realpathSync.native(os.tmpdir()) + path.sep)) throw new Error('refusing to delete outside the temp root');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  return { root, home, proj };
}

function envFor(home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_') || k === 'CLAUDE_PROJECT_DIR' || k === 'CLAUDE_PLUGIN_ROOT' || k === 'CLAUDE_PLUGIN_DATA') delete env[k];
  return env;
}

function writeProject(s, cfg, rel = path.join('.claude', 'coal', 'coalface.json')) {
  const file = path.join(s.proj, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg));
  return file;
}

function writeGlobal(s, cfg) {
  const file = path.join(s.home, '.claude', '.coalface.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg));
}

const runEngine = (s, args = ['--json']) => spawnSync(process.execPath, [engine, ...args], {
  cwd: s.proj, env: envFor(s.home), encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, windowsHide: true,
});

// The reader's --json names the thresholds it ran with. A missing engine prints nothing, so this fails loudly there too.
function assertThresholds(r, expect, label) {
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* no reading */ }
  assert.ok(j, `${label}: no JSON reading on stdout (exit ${r.status}): ${r.stderr}`);
  assert.ok(r.status === 0 || r.status === 1, `${label}: exit ${r.status}, expected 0 (BREATHE) or 1 (WAIT)`);
  assert.deepEqual(j.thresholds, expect, label);
}

test('a project value that is not a plain integer never reaches the shell, and the default stands', (t) => {
  const s = sandbox(t);
  writeProject(s, { admitCpuBusyMaxPct: PAYLOAD, admitMemFreeMinPct: 10 });
  const r = runEngine(s);
  assertThresholds(r, { cpuMaxPct: DEFAULT.cpuMaxPct, memMinPct: 10 }, 'payload value');
  assert.equal(fs.existsSync(path.join(s.proj, 'marker.txt')), false, 'the payload ran: a shell parsed the project value');
});

test('a project CPU maximum above the default cannot loosen admission', (t) => {
  const s = sandbox(t);
  writeProject(s, { admitCpuBusyMaxPct: 95 });
  assertThresholds(runEngine(s), { cpuMaxPct: 80, memMinPct: 10 }, 'project 95, no global');
});

test('a project CPU maximum below the default tightens it', (t) => {
  const s = sandbox(t);
  writeProject(s, { admitCpuBusyMaxPct: 50 });
  assertThresholds(runEngine(s), { cpuMaxPct: 50, memMinPct: 10 }, 'project 50, no global');
});

test('a project memory minimum cannot undercut the global one', (t) => {
  const s = sandbox(t);
  writeGlobal(s, { admitMemFreeMinPct: 20 });
  writeProject(s, { admitMemFreeMinPct: 0 });
  assertThresholds(runEngine(s), { cpuMaxPct: 80, memMinPct: 20 }, 'project 0, global 20');
});

test('a project memory minimum above the global one raises it', (t) => {
  const s = sandbox(t);
  writeGlobal(s, { admitMemFreeMinPct: 20 });
  writeProject(s, { admitMemFreeMinPct: 30 });
  assertThresholds(runEngine(s), { cpuMaxPct: 80, memMinPct: 30 }, 'project 30, global 20');
});

test('a planted link at the project config is not read: the default stands', (t) => {
  const s = sandbox(t);
  const victim = path.join(s.root, 'outside', 'victim.json');
  fs.mkdirSync(path.dirname(victim), { recursive: true });
  fs.writeFileSync(victim, JSON.stringify({ admitCpuBusyMaxPct: 5 }));
  const link = path.join(s.proj, '.claude', 'coal', 'coalface.json');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try { fs.symlinkSync(victim, link, 'file'); } catch { t.skip('a file link cannot be made here (capability probe)'); return; }
  assertThresholds(runEngine(s), { cpuMaxPct: DEFAULT.cpuMaxPct, memMinPct: DEFAULT.memMinPct }, 'file link');
});

test('a directory link at .claude pointing outside the project is not read: the default stands', (t) => {
  const s = sandbox(t);
  const outside = path.join(s.root, 'outside', 'coal');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'coalface.json'), JSON.stringify({ admitCpuBusyMaxPct: 5 }));
  try { fs.symlinkSync(path.dirname(outside), path.join(s.proj, '.claude'), 'junction'); } catch { t.skip('a directory link cannot be made here (capability probe)'); return; }
  assertThresholds(runEngine(s), { cpuMaxPct: DEFAULT.cpuMaxPct, memMinPct: DEFAULT.memMinPct }, 'directory link');
});

test('the engine runs from a folder whose path has a space, reading its reader beside itself', (t) => {
  const s = sandbox(t);
  const spaced = path.join(s.root, 'a b');
  fs.mkdirSync(spaced);
  fs.copyFileSync(engine, path.join(spaced, 'admission.mjs'));
  fs.copyFileSync(reader, path.join(spaced, 'machine-reading.mjs'));
  const r = spawnSync(process.execPath, [path.join(spaced, 'admission.mjs'), '--json'], {
    cwd: s.proj, env: envFor(s.home), encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, windowsHide: true,
  });
  assertThresholds(r, DEFAULT, 'spaced folder');
});

test('a value outside the range is ignored, not clamped to the range edge', (t) => {
  const s = sandbox(t);
  writeProject(s, { admitCpuBusyMaxPct: 0, admitMemFreeMinPct: 150 });
  assertThresholds(runEngine(s), DEFAULT, 'out of range');
});

test('a value that starts with a plain integer and carries text is ignored, not read as its leading digits', (t) => {
  const s = sandbox(t);
  writeProject(s, { admitCpuBusyMaxPct: '50; echo pwned > marker.txt', admitMemFreeMinPct: 10 });
  assertThresholds(runEngine(s), DEFAULT, 'integer with a tail');
});

test('the thresholds come from the config, so a caller that passes them gets a usage error', (t) => {
  const s = sandbox(t);
  const r = runEngine(s, ['--cpu-max', '99', '--json']);
  assert.equal(r.status, 64, `exit ${r.status}, expected the usage error 64: ${r.stderr}`);
  assert.equal(r.stdout, '', 'a reading was printed for a refused call');
});

test('the engine runs through a linked install and prints a reading', (t) => {
  const s = sandbox(t);
  const real = path.join(s.root, 'real');
  fs.mkdirSync(real);
  fs.copyFileSync(engine, path.join(real, 'admission.mjs'));
  fs.copyFileSync(reader, path.join(real, 'machine-reading.mjs'));
  const link = path.join(s.root, 'link');
  try { fs.symlinkSync(real, link, 'junction'); } catch { t.skip('a directory link cannot be made here (capability probe)'); return; }
  const r = spawnSync(process.execPath, [path.join(link, 'admission.mjs'), '--json'], {
    cwd: s.proj, env: envFor(s.home), encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, windowsHide: true,
  });
  assertThresholds(r, DEFAULT, 'linked install');
});

test('a config that opens with a byte-order mark is read', (t) => {
  const s = sandbox(t);
  writeGlobal(s, {});
  fs.writeFileSync(path.join(s.home, '.claude', '.coalface.json'), String.fromCharCode(0xfeff) + JSON.stringify({ admitCpuBusyMaxPct: 50 }));
  assertThresholds(runEngine(s), { cpuMaxPct: 50, memMinPct: 10 }, 'BOM global');
});

test('the engine holds the repository size bound and spawns with no shell', async () => {
  const m = await import(pathToFileURL(engine).href);
  assert.equal(m.MAX_CONFIG_BYTES, REPO_BOUND, 'the forked bound drifted');
  assert.equal(/\bshell\s*:/.test(fs.readFileSync(engine, 'utf8')), false, 'the reader must be spawned with no shell option');
});

// PARITY (one fixture table, both walks): the engine's walk picks the same config file the hook's walk picks, at the same level.
// The hook is the reference. Each layout is built once and both sides read it from the same cwd and home.
const LAYOUTS = [
  ['canonical at the project', (s) => writeProject(s, {})],
  ['nested legacy only', (s) => writeProject(s, {}, path.join('.claude', '.coalface.json'))],
  ['root legacy only', (s) => writeProject(s, {}, '.coalface.json')],
  ['agents dir', (s) => writeProject(s, {}, path.join('.agents', 'coal', 'coalface.json'))],
  ['canonical beats legacy at one level', (s) => { writeProject(s, {}); writeProject(s, {}, '.coalface.json'); }],
  ['nothing at all', () => {}],
  // Above home is not this project: the walk stops at home, and home's config is the global one.
  ['above home, not read', (s) => { const f = path.join(s.root, '.claude', 'coal', 'coalface.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{}'); }],
];

for (const [label, build] of LAYOUTS) {
  test(`walk parity with the hook, ${label}`, (t) => {
    const s = sandbox(t);
    build(s);
    const sub = path.join(s.proj, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    const hook = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require(process.argv[1]).findProjectHit("claude")))', conductor], {
      cwd: sub, env: envFor(s.home), encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, windowsHide: true,
    });
    assert.equal(hook.status, 0, `hook walk exit ${hook.status}: ${hook.stderr}`);
    const hookFile = JSON.parse(hook.stdout).file;
    const eng = spawnSync(process.execPath, ['-e', 'import(process.argv[1]).then((m) => process.stdout.write(JSON.stringify(m.readThresholds())))', pathToFileURL(engine).href], {
      cwd: sub, env: envFor(s.home), encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, windowsHide: true,
    });
    assert.equal(eng.status, 0, `engine walk exit ${eng.status}: ${eng.stderr}`);
    assert.equal(JSON.parse(eng.stdout).file, hookFile, 'the two walks pick different config files');
  });
}
