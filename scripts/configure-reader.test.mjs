// 29mm (CF-RD-1): a config that EXISTS and cannot be read is left untouched and the run says so. Only "does not exist" (ENOENT) means an empty config;
// any other read failure refuses the run before anything is written, because the bytes were never seen and an empty fallback would replace them.
//
// Legs run the REAL scripts/configure.mjs from a temp project this file makes. On Windows the read is denied with icacls on the file itself; the grant is
// restored in finally, and a probe skips a leg VISIBLY when the deny does not bind this process (an elevated token reads through it). On POSIX the leg is mode
// 000 as a non-root user, read by the ubuntu and macos gate legs (root ignores the mode bits, so the leg skips visibly there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, '..');
const CONFIGURE = path.join(ROOM, 'scripts', 'configure.mjs');
const TIMEOUT_MS = 60000;
const IS_WIN = process.platform === 'win32';
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const ORIGINAL = JSON.stringify({ bandwidth: 30, autoFanoutFloor: 8, coalfaceMode: 'auto' }) + '\n';

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-reader-')));
  t.after(() => {
    // remove only the folder this file made, by name, after checking it resolves under the temp root
    const tmp = fs.realpathSync.native(os.tmpdir());
    const rel = path.relative(tmp, root);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(root).startsWith('cf-reader-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  return { root, home, proj };
}

function childEnv(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_') || k.startsWith('CLAUDE_') || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  return { ...env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home, GIT_CEILING_DIRECTORIES: path.dirname(home) };
}

function runConfigure({ home, proj }, args) {
  return spawnSync(process.execPath, ['--max-old-space-size=256', CONFIGURE, ...args], {
    cwd: proj, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL', env: childEnv(home),
  });
}

const show = (r) => `exit=${r.status} signal=${r.signal} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`;

function canRead(file) {
  try { fs.readFileSync(file); return true; } catch { return false; }
}

// Windows only: deny this user's read on FILE for the body, then restore the grant. Returns false (and the caller skips) when the deny does not bind.
function withReadDenied(file, body) {
  const user = os.userInfo().username;
  execFileSync('icacls', [file, '/deny', `${user}:(RD)`], { stdio: 'ignore' });
  try {
    if (canRead(file)) return false; // the deny does not bind this process: skip visibly
    body();
    return true;
  } finally {
    execFileSync('icacls', [file, '/remove:d', user], { stdio: 'ignore' }); // a failed restore is a loud error, never swallowed
  }
}

// Every file the run could have created or changed in the folder, by listing: nothing new, no temp left behind.
const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

test('a project config that exists but cannot be read is left untouched: the run names the file and the code, writes nothing and exits 1 (Windows, read denied)', (t) => {
  if (!IS_WIN) { t.skip('the read deny is a Windows ACL; the POSIX leg is the mode 000 one below'); return; }
  const s = sandbox(t);
  const dir = path.join(s.proj, '.claude', 'coal');
  const cfg = path.join(dir, 'coalface.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cfg, ORIGINAL);
  let r = null;
  const ran = withReadDenied(cfg, () => { r = runConfigure(s, ['--bandwidth', '50']); });
  if (!ran) { t.skip('the read deny does not bind this process (an elevated token reads through it), so the leg cannot show the refusal here'); return; }
  assert.equal(r.status, 1, show(r));
  assert.match(r.stderr, /could not be read \((EPERM|EACCES|EBUSY)\); nothing was written/, show(r));
  assert.equal(r.stdout.includes('Successfully updated'), false, show(r));
  assert.equal(fs.readFileSync(cfg, 'utf8'), ORIGINAL, 'the unreadable config was replaced');
  assert.deepEqual(listDir(dir), ['coalface.json'], 'a file was created or left behind next to the config');
});

test('the global config that exists but cannot be read is left untouched by --global: the run names the file, writes nothing and exits 1 (Windows, read denied)', (t) => {
  if (!IS_WIN) { t.skip('the read deny is a Windows ACL; the POSIX leg is the mode 000 one below'); return; }
  const s = sandbox(t);
  const dir = path.join(s.home, '.claude');
  const glob = path.join(dir, '.coalface.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(glob, ORIGINAL);
  let r = null;
  const ran = withReadDenied(glob, () => { r = runConfigure(s, ['--global', '--bandwidth', '50']); });
  if (!ran) { t.skip('the read deny does not bind this process (an elevated token reads through it), so the leg cannot show the refusal here'); return; }
  assert.equal(r.status, 1, show(r));
  assert.match(r.stderr, /could not be read \((EPERM|EACCES|EBUSY)\); nothing was written/, show(r));
  assert.equal(fs.readFileSync(glob, 'utf8'), ORIGINAL, 'the unreadable global config was replaced');
  assert.deepEqual(listDir(dir), ['.coalface.json'], 'a file was created or left behind next to the global config');
});

test('a legacy root config that exists but cannot be read is left untouched: the run writes no new home and no backup and exits 1 (Windows, read denied)', (t) => {
  if (!IS_WIN) { t.skip('the read deny is a Windows ACL; the POSIX leg is the mode 000 one below'); return; }
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  fs.writeFileSync(legacy, ORIGINAL);
  let r = null;
  const ran = withReadDenied(legacy, () => { r = runConfigure(s, ['--bandwidth', '50']); });
  if (!ran) { t.skip('the read deny does not bind this process (an elevated token reads through it), so the leg cannot show the refusal here'); return; }
  assert.equal(r.status, 1, show(r));
  assert.match(r.stderr, /could not be read \((EPERM|EACCES|EBUSY)\); nothing was written/, show(r));
  assert.equal(fs.readFileSync(legacy, 'utf8'), ORIGINAL, 'the unreadable legacy config changed');
  assert.equal(fs.existsSync(path.join(s.proj, '.claude', 'coal', 'coalface.json')), false, 'a new home was written although the legacy config could not be read');
  assert.equal(fs.existsSync(legacy + '.bak'), false, 'a backup was made although the legacy config could not be read');
});

test('a project config with mode 000 that a non-root run cannot read is left untouched: the run names the file, writes nothing and exits 1 (POSIX)', (t) => {
  if (IS_WIN) { t.skip('mode bits are a POSIX read wall; the Windows legs above cover the read deny'); return; }
  if (IS_ROOT) { t.skip('root reads a mode 000 file, so the mode is not a wall for this user; the ubuntu and macos legs run as a non-root user'); return; }
  const s = sandbox(t);
  const dir = path.join(s.proj, '.claude', 'coal');
  const cfg = path.join(dir, 'coalface.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cfg, ORIGINAL);
  fs.chmodSync(cfg, 0o000);
  let r;
  try {
    r = runConfigure(s, ['--bandwidth', '50']);
  } finally {
    fs.chmodSync(cfg, 0o600); // restore the bits so the file can be read back below
  }
  assert.equal(r.status, 1, show(r));
  assert.match(r.stderr, /could not be read \(EACCES\); nothing was written/, show(r));
  assert.equal(r.stdout.includes('Successfully updated'), false, show(r));
  assert.equal(fs.readFileSync(cfg, 'utf8'), ORIGINAL, 'the unreadable config was replaced');
  assert.deepEqual(listDir(dir), ['coalface.json'], 'a file was created or left behind next to the config');
});

test('a directory at the project config path is still refused by name, never replaced (every platform)', (t) => {
  const s = sandbox(t);
  const dir = path.join(s.proj, '.claude', 'coal');
  const cfg = path.join(dir, 'coalface.json');
  fs.mkdirSync(cfg, { recursive: true });
  const r = runConfigure(s, ['--bandwidth', '50']);
  assert.equal(r.status, 1, show(r));
  assert.ok(r.stderr.includes('it is a folder, not a config file'), show(r));
  assert.equal(fs.statSync(cfg).isDirectory(), true, 'the folder at the config path was replaced');
});
