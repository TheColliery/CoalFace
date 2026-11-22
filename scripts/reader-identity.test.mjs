// 29ny (CF-ID-1): a pinned project read compares the opened file with the identity the PIN took, never with an identity taken by a later
// resolution of the name. The containment pin (containedProjectFile / containedWriteTarget / pinProjectFile) admits a path; the reader then
// reads it. If the name is replaced between the two, the reader must refuse, and the identity it compares with must be the admitted file's.
//
// The seam (no privilege): just AFTER the pin's realpath of the config entry returns, the entry is replaced by a HARD LINK to another file (the
// INSIDE or OUTSIDE file of the fixture). The reader's own lstat and open then run on the real files; nothing is faked. The REAL-LINK leg swaps in a
// symlink instead, and is skipped VISIBLY where this account cannot make one (one skippable test per leg, so the POSIX CI legs run it).
//
// Readers, each run in the order its caller runs them: the conductor hook (loadCfg), admission (readThresholds), and configure (the CLI, end to end,
// with the seam loaded by --import). The test is written against the public entry points only, so it runs unchanged on the code before and after the fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, '..');
const CONFIGURE = path.join(ROOM, 'scripts', 'configure.mjs');
const HOOK = path.join(ROOM, 'hooks', 'coalface-conductor.js');
const ADMISSION = path.join(ROOM, 'skills', 'coalface', 'scripts', 'admission.mjs');
const TIMEOUT_MS = 60000;
const VAL = { control: 7, inside: 8, outside: 9 };
const body = (n) => JSON.stringify({ autoFanoutFloor: n, admitCpuBusyMaxPct: 10 + n }) + '\n';

// The seam, as a CHILD preload for configure: the first realpath of the entry is followed by the swap.
const PRELOAD_SRC = `import fs from 'node:fs';
import path from 'node:path';
const entry = process.env.CF_SWAP_ENTRY;
const next = process.env.CF_SWAP_NEXT;
const mode = process.env.CF_SWAP_MODE;
let swapped = false;
const realR = fs.realpathSync.native;
fs.realpathSync.native = function (q, ...r) {
  const out = realR.call(this, q, ...r);
  if (!swapped && entry && typeof q === 'string' && path.resolve(q) === path.resolve(entry)) {
    swapped = true;
    fs.unlinkSync(entry);
    if (mode === 'sym') fs.symlinkSync(next, entry); else fs.linkSync(next, entry);
  }
  return out;
};
`;

// Runs fn with the seam in this process: after the first realpath of the entry returns, the entry is replaced by a link to `seam.next`.
function withSeam(entry, seam, run) {
  if (!seam) return { value: run(), swapped: false };
  const realR = fs.realpathSync.native;
  let swapped = false;
  fs.realpathSync.native = function (q, ...r) {
    const out = realR.call(this, q, ...r);
    if (!swapped && typeof q === 'string' && path.resolve(q) === path.resolve(entry)) {
      swapped = true;
      fs.unlinkSync(entry);
      if (seam.mode === 'sym') fs.symlinkSync(seam.next, entry); else fs.linkSync(seam.next, entry);
    }
    return out;
  };
  try {
    return { value: run(), swapped };
  } finally {
    fs.realpathSync.native = realR;
  }
}

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-29ny-')));
  t.after(() => {
    // remove only the folder this file made, by name, after checking it resolves under the temp root
    const tmp = fs.realpathSync.native(os.tmpdir());
    const rel = path.relative(tmp, root);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(root).startsWith('cf-29ny-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  const coal = path.join(proj, '.claude', 'coal');
  const outDir = path.join(root, 'outside');
  fs.mkdirSync(coal, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const entry = path.join(coal, 'coalface.json');
  const inside = path.join(proj, 'inside.json');
  const outside = path.join(outDir, 'secret.json');
  fs.writeFileSync(entry, body(VAL.control));
  fs.writeFileSync(inside, body(VAL.inside));
  fs.writeFileSync(outside, body(VAL.outside));
  return { root, home, proj, entry, inside, outside };
}

// The swapped-in file for a leg: the INSIDE or OUTSIDE file, reached by a hard link (or a symlink for the REAL-LINK leg).
function seamFor(s, leg, mode) {
  if (leg === 'control') return null;
  return { next: leg === 'inside' ? s.inside : s.outside, mode };
}

const hookModule = () => createRequire(import.meta.url)(HOOK);

function readHook(s, seam) {
  const hook = hookModule();
  const env = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const cwd = process.cwd();
  try {
    return withSeam(s.entry, seam, () => {
      process.chdir(s.proj);
      process.env.USERPROFILE = s.home;
      process.env.HOME = s.home;
      return hook.loadCfg('claude', false).cfg.autoFanoutFloor;
    });
  } finally {
    process.chdir(cwd);
    for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  }
}

async function readAdmission(s, seam) {
  const adm = await import(pathToFileURL(ADMISSION).href);
  return withSeam(s.entry, seam, () => adm.readThresholds({ cwd: s.proj, home: s.home }).cpuMaxPct);
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

// configure, end to end: the CLI with the seam preloaded. Returns the spawn result and whether the seam fired.
function runConfigure(s, seam) {
  const preload = path.join(s.root, 'swap-preload.mjs');
  fs.writeFileSync(preload, PRELOAD_SRC);
  const env = childEnv(s.home, seam ? { CF_SWAP_ENTRY: s.entry, CF_SWAP_NEXT: seam.next, CF_SWAP_MODE: seam.mode } : {});
  const args = ['--max-old-space-size=256'];
  if (seam) args.push('--import', pathToFileURL(preload).href);
  args.push(CONFIGURE, '--autoFanoutFloor', '8');
  return spawnSync(process.execPath, args, { cwd: s.proj, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL', env });
}

// Probe whether this account can make a file symlink. Returns null when it can, else the error code.
function symlinkRefusal(root) {
  const target = path.join(root, 'link-probe-target');
  const link = path.join(root, 'link-probe-link');
  fs.writeFileSync(target, 'x');
  try {
    fs.symlinkSync(target, link);
    return null;
  } catch (e) {
    return e.code || e.message;
  } finally {
    fs.rmSync(link, { force: true });
  }
}

// ---- control: no swap, every reader reads the config the name holds ----

test('control: the conductor hook reads the project config when nothing is swapped', (t) => {
  const s = sandbox(t);
  const r = readHook(s, null);
  assert.equal(r.value, VAL.control, `the hook read ${r.value}, not the admitted file's ${VAL.control}`);
});

test('control: admission reads the project config when nothing is swapped', async (t) => {
  const s = sandbox(t);
  const r = await readAdmission(s, null);
  assert.equal(r.value, 10 + VAL.control, `admission read ${r.value}, not the admitted file's ${10 + VAL.control}`);
});

test('control: configure writes the project config when nothing is swapped', (t) => {
  const s = sandbox(t);
  const r = runConfigure(s, null);
  assert.equal(r.status, 0, show(r));
  assert.match(r.stdout, /Successfully updated/, show(r));
});

// ---- INSIDE: a hard link to the inside file is swapped in after the pin. The inside file's value must not be read. ----

test('INSIDE: the conductor hook does not read a file swapped in after the pin', (t) => {
  const s = sandbox(t);
  const r = readHook(s, seamFor(s, 'inside', 'hard'));
  assert.equal(r.swapped, true, 'the seam did not fire: the test proves nothing');
  assert.notEqual(r.value, VAL.inside, `the hook read the swapped-in file (${r.value}): the identity was taken after the name was resolved again`);
});

test('INSIDE: admission does not read a file swapped in after the pin', async (t) => {
  const s = sandbox(t);
  const r = await readAdmission(s, seamFor(s, 'inside', 'hard'));
  assert.equal(r.swapped, true, 'the seam did not fire: the test proves nothing');
  assert.notEqual(r.value, 10 + VAL.inside, `admission read the swapped-in file (cpuMaxPct ${r.value})`);
});

test('INSIDE: configure refuses a file swapped in after the pin and writes nothing', (t) => {
  const s = sandbox(t);
  const seam = seamFor(s, 'inside', 'hard');
  const before = fs.readFileSync(s.inside, 'utf8');
  const r = runConfigure(s, seam);
  assert.equal(fs.readFileSync(s.inside, 'utf8'), before, 'the inside file was changed by the run');
  assert.equal(r.status, 1, `configure read the swapped-in file and did not refuse: ${show(r)}`);
  assert.doesNotMatch(r.stdout, /Successfully updated/, show(r));
  assert.match(r.stderr, /could not be read \(ECHANGED\); nothing was written/, show(r));
  assert.equal(fs.readFileSync(s.entry, 'utf8'), before, 'the name was written through');
});

// ---- OUTSIDE: the same, with a file outside the project. The outside value must not be read, and the file must not be touched. ----

test('OUTSIDE: the conductor hook does not read a file swapped in after the pin', (t) => {
  const s = sandbox(t);
  const r = readHook(s, seamFor(s, 'outside', 'hard'));
  assert.equal(r.swapped, true, 'the seam did not fire: the test proves nothing');
  assert.notEqual(r.value, VAL.outside, `the hook read the OUTSIDE file (${r.value})`);
});

test('OUTSIDE: admission does not read a file swapped in after the pin', async (t) => {
  const s = sandbox(t);
  const r = await readAdmission(s, seamFor(s, 'outside', 'hard'));
  assert.equal(r.swapped, true, 'the seam did not fire: the test proves nothing');
  assert.notEqual(r.value, 10 + VAL.outside, `admission read the OUTSIDE file (cpuMaxPct ${r.value})`);
});

test('OUTSIDE: configure refuses a file swapped in after the pin, and the outside file is not changed', (t) => {
  const s = sandbox(t);
  const seam = seamFor(s, 'outside', 'hard');
  const before = fs.readFileSync(s.outside, 'utf8');
  const r = runConfigure(s, seam);
  assert.equal(fs.readFileSync(s.outside, 'utf8'), before, 'the OUTSIDE file was changed by the run');
  assert.equal(r.status, 1, `configure read the OUTSIDE file and did not refuse: ${show(r)}`);
  assert.doesNotMatch(r.stdout, /Successfully updated/, show(r));
  assert.match(r.stderr, /could not be read \(ECHANGED\); nothing was written/, show(r));
  assert.equal(fs.readFileSync(s.entry, 'utf8'), before, 'the name was written through');
});

// ---- REAL-LINK: a SYMLINK swapped in after the pin. Skipped visibly where this account cannot make a file symlink. ----
// Each reader gets its own fixture: the seam leaves the entry as a link, so one fixture cannot serve three readers.

test('REAL-LINK: the conductor hook does not follow a symlink swapped in after the pin (skipped where no symlink can be made)', (t) => {
  const probe = sandbox(t);
  const refusal = symlinkRefusal(probe.root);
  if (refusal) {
    t.skip(`this account cannot make a file symlink (${refusal}); the POSIX CI legs run this leg`);
    return;
  }
  const s = sandbox(t);
  const r = readHook(s, seamFor(s, 'outside', 'sym'));
  assert.equal(r.swapped, true, 'the seam did not fire: the test proves nothing');
  assert.notEqual(r.value, VAL.outside, `the hook followed the symlink to the OUTSIDE file (${r.value})`);
});

test('REAL-LINK: admission does not follow a symlink swapped in after the pin (skipped where no symlink can be made)', async (t) => {
  const probe = sandbox(t);
  const refusal = symlinkRefusal(probe.root);
  if (refusal) {
    t.skip(`this account cannot make a file symlink (${refusal}); the POSIX CI legs run this leg`);
    return;
  }
  const s = sandbox(t);
  const r = await readAdmission(s, seamFor(s, 'outside', 'sym'));
  assert.equal(r.swapped, true, 'the seam did not fire: the test proves nothing');
  assert.notEqual(r.value, 10 + VAL.outside, `admission followed the symlink to the OUTSIDE file (cpuMaxPct ${r.value})`);
});

test('REAL-LINK: configure refuses a symlink swapped in after the pin, and the outside file is not changed (skipped where no symlink can be made)', (t) => {
  const probe = sandbox(t);
  const refusal = symlinkRefusal(probe.root);
  if (refusal) {
    t.skip(`this account cannot make a file symlink (${refusal}); the POSIX CI legs run this leg`);
    return;
  }
  const s = sandbox(t);
  const before = fs.readFileSync(s.outside, 'utf8');
  const r = runConfigure(s, seamFor(s, 'outside', 'sym'));
  assert.equal(fs.readFileSync(s.outside, 'utf8'), before, 'configure wrote through the symlink to the OUTSIDE file');
  assert.equal(r.status, 1, `configure followed the symlink and did not refuse: ${show(r)}`);
  // Either refusal is correct: the write-pin's realpath runs AFTER the identity pin and sees the symlink first ("resolves outside its folder"); a read that
  // reaches the reader refuses with ECHANGED. Neither writes.
  assert.match(r.stderr, /(could not be read \(ECHANGED\)|resolves outside its folder \(a link at the file or at a folder above it\)); nothing was written/, show(r));
});
