// 29ng (T): a config reader checks a NAME, then opens it by name. A file swapped in between is read, unless the reader compares the opened handle with
// the file it checked (dev and ino). The seam is the reviewer's: a preload reassigns fs.openSync and, just before the real open of the checked path,
// renames a file from OUTSIDE the project folder over that name. Nothing is planted ahead, so the up-front check still passes.
//
// Three legs, one per reader: R1 the real scripts/configure.mjs (spawned, the seam loaded with --import), R2 the real SessionStart hook (spawned, the seam
// loaded with --import; its stdout is compared with an unswapped run), R3 admission.mjs readThresholds (called in-process, the seam on fs.openSync).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, '..');
const CONFIGURE = path.join(ROOM, 'scripts', 'configure.mjs');
const HOOK = path.join(ROOM, 'hooks', 'coalface-conductor.js');
const ADMISSION = path.join(ROOM, 'skills', 'coalface', 'scripts', 'admission.mjs');
const TIMEOUT_MS = 60000;
const INSIDE_AUTO = '{"coalfaceMode":"auto","bandwidth":30}\n';
const OUTSIDE_ON = '{"coalfaceMode":"on","bandwidth":99}\n';
// A project may only QUIETEN a clamped key (safer-value-wins): `off` is a quieting of the default `auto`, so an old reader would adopt it and print
// nothing where the default prints the discipline. `on` would be clamped back to `auto` and could not show the swap.
const OUTSIDE_OFF = '{"coalfaceMode":"off"}\n';

// The seam: on the first open of CF_SWAP_TARGET, rename CF_SWAP_OUTSIDE over it, then let the real open run.
const PRELOAD_SRC = `import fs from 'node:fs';
import path from 'node:path';
const target = process.env.CF_SWAP_TARGET;
const outside = process.env.CF_SWAP_OUTSIDE;
const norm = (p) => path.normalize(String(p)).toLowerCase();
let swapped = false;
const origOpen = fs.openSync;
fs.openSync = function patchedOpen(p, ...rest) {
  if (!swapped && target && norm(p) === norm(target)) {
    swapped = true;
    fs.renameSync(outside, target);
  }
  return origOpen.call(fs, p, ...rest);
};
`;

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-toctou-')));
  t.after(() => {
    // remove only the folder this file made, by name, after checking it resolves under the temp root
    const tmp = fs.realpathSync.native(os.tmpdir());
    const rel = path.relative(tmp, root);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(root).startsWith('cf-toctou-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  fs.mkdirSync(path.join(proj, '.claude', 'coal'), { recursive: true });
  const preload = path.join(root, 'swap-preload.mjs');
  fs.writeFileSync(preload, PRELOAD_SRC);
  return { root, home, proj, preload, inside: path.join(proj, '.claude', 'coal', 'coalface.json') };
}

function childEnv(home, extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_') || k.startsWith('CLAUDE_') || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  return { ...env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home, GIT_CEILING_DIRECTORIES: path.dirname(home), ...extra };
}

const show = (r) => `exit=${r.status} signal=${r.signal} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`;

test('R1 configure: a config swapped for an outside file between the check and the open is refused, never read (the write does not happen)', (t) => {
  const s = sandbox(t);
  fs.writeFileSync(s.inside, INSIDE_AUTO);
  const outside = path.join(s.root, 'outside.json');
  fs.writeFileSync(outside, OUTSIDE_ON);
  const r = spawnSync(process.execPath, ['--max-old-space-size=256', '--import', pathToFileURL(s.preload).href, CONFIGURE, '--autoFanoutFloor', '8'], {
    cwd: s.proj, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
    env: childEnv(s.home, { CF_SWAP_TARGET: s.inside, CF_SWAP_OUTSIDE: outside }),
  });
  assert.equal(fs.existsSync(outside), false, 'the swap did not happen (the seam is not in the run)');
  assert.equal(r.status, 1, show(r));
  assert.equal(r.stdout.includes('Successfully updated'), false, `the swapped-in file was read and written: ${show(r)}`);
  assert.match(r.stderr, /could not be read \(ECHANGED\)/, show(r));
});

test('R2 SessionStart hook: a config swapped for an outside file between the check and the open is not adopted (stdout equals an unswapped run)', (t) => {
  const payload = JSON.stringify({ hook_event_name: 'SessionStart', cwd: '', session_id: 't' });
  const runHook = (proj, home, extra) => {
    const input = JSON.parse(payload);
    input.cwd = proj;
    return spawnSync(process.execPath, ['--max-old-space-size=256', HOOK], {
      cwd: proj, encoding: 'utf8', timeout: TIMEOUT_MS, input: JSON.stringify(input),
      env: childEnv(home, extra),
    });
  };
  // baseline: the inside file, unswapped, in its own fresh home
  const base = sandbox(t);
  fs.writeFileSync(base.inside, INSIDE_AUTO);
  const s0 = runHook(base.proj, base.home, {});
  // swapped: the same inside file, replaced by the outside `on` file just before the open, in a fresh home
  const sw = sandbox(t);
  fs.writeFileSync(sw.inside, INSIDE_AUTO);
  const outside = path.join(sw.root, 'outside.json');
  fs.writeFileSync(outside, OUTSIDE_OFF);
  const s1 = spawnSync(process.execPath, ['--max-old-space-size=256', '--import', pathToFileURL(sw.preload).href, HOOK], {
    cwd: sw.proj, encoding: 'utf8', timeout: TIMEOUT_MS, input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: sw.proj, session_id: 't' }),
    env: childEnv(sw.home, { CF_SWAP_TARGET: sw.inside, CF_SWAP_OUTSIDE: outside }),
  });
  assert.equal(fs.existsSync(outside), false, 'the swap did not happen (the seam is not in the run)');
  assert.equal(s1.status, 0, show(s1));
  assert.equal(s1.stdout, s0.stdout, `the swapped-in config changed the hook's output: swapped=${JSON.stringify(s1.stdout)} unswapped=${JSON.stringify(s0.stdout)}`);
});

test('R3 admission: a project config swapped for an outside file between the check and the open is not read (thresholds equal a run with no project config)', async (t) => {
  const { readThresholds } = await import(pathToFileURL(ADMISSION).href);
  const s = sandbox(t);
  // 29ng F1: the keys admission reads (admission.mjs KEY_RANGE). The project file may only TIGHTEN, so the inside file (30 / 50) and the outside
  // file (20 / 60) both move the result off the defaults (80 / 10): an old reader takes the outside values, a refusing one takes the defaults.
  fs.writeFileSync(s.inside, '{"admitCpuBusyMaxPct": 30, "admitMemFreeMinPct": 50}\n');
  const bare = sandbox(t); // no project config at all: the defaults the reader must fall back to
  const expected = readThresholds({ cwd: bare.proj, home: bare.home });
  const outside = path.join(s.root, 'outside.json');
  fs.writeFileSync(outside, '{"admitCpuBusyMaxPct": 20, "admitMemFreeMinPct": 60}\n');
  const origOpen = fs.openSync;
  let swapped = false;
  fs.openSync = function patchedOpen(p, ...rest) {
    if (!swapped && path.normalize(String(p)).toLowerCase() === path.normalize(s.inside).toLowerCase()) {
      swapped = true;
      fs.renameSync(outside, s.inside);
    }
    return origOpen.call(fs, p, ...rest);
  };
  let got;
  try {
    got = readThresholds({ cwd: s.proj, home: s.home });
  } finally {
    fs.openSync = origOpen;
  }
  assert.equal(swapped, true, 'the swap did not happen (the seam is not in the run)');
  // `file` is the provenance (where the walk found the config); the values are what the reader took. Equal to the defaults means neither
  // the outside values (20 / 60) nor the inside ones (30 / 50) were read.
  const gotValues = { cpuMaxPct: got.cpuMaxPct, memMinPct: got.memMinPct };
  const expectedValues = { cpuMaxPct: expected.cpuMaxPct, memMinPct: expected.memMinPct };
  assert.ok(got.file === s.inside || got.file === null, 'the provenance names an unexpected file');
  assert.deepEqual(gotValues, expectedValues, 'the thresholds differ from a run with no project config: the swapped-in file was read');
});
