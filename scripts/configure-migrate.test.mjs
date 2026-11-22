// The legacy-config migration of scripts/configure.mjs under card BB-533 (signed 2026-11-21, option 5): the old file is MOVED, never removed.
// One rename of the legacy file to <legacy>.bak beside it, after the new home is written; the backup is compared with what was migrated;
// a rename that fails is reported and the legacy file stays. Ported from the 29ko witness (CoalFace code-reviewer, 24a0bdf3) and the 29lg study.
//
// A child is the REAL scripts/configure.mjs run from a temp project. The preload (--import) patches the fs calls the migration makes, so the
// change, the refusal or the unreadable backup lands at the exact step each test names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitEnv } from './lib/git-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, '..');
const CONFIGURE = path.join(ROOM, 'scripts', 'configure.mjs');
const TIMEOUT_MS = 60000;
const LEGACY_BODY = '{"coalfaceMode":"auto","bandwidth":30}\n';

// Modes: append | same (a change right after the new home is written, before the move); w-c1 (bytes appended at the latest moment before the
// migration's destroying step: the last lstat of the legacy file on the old code, the move on the new one); ebusy (the move is refused);
// w-b1 (a writer keeps writing the old file after the move); bak-unreadable (the backup cannot be read back); moved-away (another writer moves the legacy file just before the rename).
const PRELOAD_SRC = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  'const legacy = process.env.CF_W_LEGACY;',
  'const mode = process.env.CF_W_MODE;',
  "const newHome = path.join('coal', 'coalface.json');",
  'let newHomeWritten = false;',
  'let renamed = false;',
  'let lstatDenied = false;',
  'let done = false;',
  'const origRename = fs.renameSync;',
  'const origLstat = fs.lstatSync;',
  'const origOpen = fs.openSync;',
  'fs.lstatSync = function patchedLstat(p) {',
  "  if (legacy && mode === 'lstat-denied' && lstatDenied && String(p) === legacy) {",
  "    const e = new Error('EACCES: permission denied, lstat'); e.code = 'EACCES'; throw e;",
  '  }',
  '  const r = origLstat.apply(this, arguments);',
  "  if (legacy && mode === 'w-c1' && newHomeWritten && !done && String(p) === legacy) {",
  '    done = true;',
  "    fs.appendFileSync(legacy, 'WRITTEN-IN-WINDOW\\n');",
  '  }',
  '  return r;',
  '};',
  'fs.openSync = function patchedOpen(p) {',
  "  if (legacy && mode === 'bak-unreadable' && renamed && String(p) === legacy + '.bak') {",
  "    const e = new Error('EACCES: permission denied, open'); e.code = 'EACCES'; throw e;",
  '  }',
  '  return origOpen.apply(this, arguments);',
  '};',
  'fs.renameSync = function patchedRename(from, to) {',
  '  const f = String(from);',
  '  const t = String(to);',
  "  if (legacy && mode === 'lstat-denied' && f === legacy) {",
  '    lstatDenied = true;',
  "    const e = new Error('EBUSY: resource busy or locked, rename'); e.code = 'EBUSY'; throw e;",
  '  }',
  "  if (legacy && mode === 'ebusy' && f === legacy) {",
  "    const e = new Error('EBUSY: resource busy or locked, rename'); e.code = 'EBUSY'; throw e;",
  '  }',
  "  if (legacy && mode === 'w-c1' && newHomeWritten && !done && f === legacy) {",
  '    done = true;',
  "    fs.appendFileSync(legacy, 'WRITTEN-IN-WINDOW\\n');",
  '  }',
  "  if (legacy && mode === 'moved-away' && f === legacy && !done) {",
  '    done = true;',
  "    origRename.call(fs, legacy, legacy + '.elsewhere');",
  '  }',
  '  const r = origRename.apply(this, arguments);',
  '  if (legacy && f === legacy) renamed = true;',
  "  if (legacy && mode === 'w-b1' && f === legacy && !done) {",
  '    done = true;',
  "    fs.appendFileSync(t, 'WRITTEN-AFTER-RENAME\\n');",
  '  }',
  "  if (legacy && (mode === 'append' || mode === 'same') && !done && t.includes(newHome)) {",
  '    done = true;',
  "    const before = fs.readFileSync(legacy, 'utf8');",
  "    if (mode === 'append') fs.writeFileSync(legacy, before.replace(/}\\s*$/, ',\"updateMode\":\"off\"}\\n'));",
  "    else fs.writeFileSync(legacy, before.replace('30', '70'));",
  "    fs.writeFileSync(legacy + '.witness-touched', mode);",
  '  }',
  '  if (t.includes(newHome)) newHomeWritten = true;',
  '  return r;',
  '};',
  '',
].join('\n');

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-migrate-')));
  t.after(() => {
    // remove only the folder this test made, by name, after checking it resolves under the temp root
    const tmp = fs.realpathSync.native(os.tmpdir());
    const rel = path.relative(tmp, root);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(root).startsWith('cf-migrate-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  const preload = path.join(root, 'preload.mjs');
  fs.writeFileSync(preload, PRELOAD_SRC);
  return { root, home, proj, preload };
}

function childEnv(home, extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_') || k.startsWith('CLAUDE_') || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  return { ...env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home, GIT_CEILING_DIRECTORIES: path.dirname(home), ...extra };
}

function runConfigure({ home, proj, preload }, legacy, mode) {
  const args = ['--max-old-space-size=256'];
  if (mode) args.push('--import', pathToFileURL(preload).href);
  args.push(CONFIGURE, '--bandwidth', '50');
  return spawnSync(process.execPath, args, {
    cwd: proj, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
    env: childEnv(home, mode ? { CF_W_LEGACY: legacy, CF_W_MODE: mode } : {}),
  });
}

const show = (r) => `exit=${r.status} signal=${r.signal} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`;
const SHAPES = [['root .coalface.json', '.coalface.json'], ['nested .claude/.coalface.json', path.join('.claude', '.coalface.json')]];

// Legs A: a change inside the window (after the new home is written, before the move) is moved WITH the file, into the backup, and the run
// says so and exits non-zero. The new config does not hold the change, so both files are named.
for (const [shape, rel] of SHAPES) {
  for (const mode of ['append', 'same']) {
    test(`leg A (${shape}, ${mode} inside the window): the changed legacy config moves whole to its backup, and the run names both files and exits non-zero`, (t) => {
      const s = sandbox(t);
      const legacy = path.join(s.proj, rel);
      const bak = legacy + '.bak';
      fs.mkdirSync(path.dirname(legacy), { recursive: true });
      fs.writeFileSync(legacy, LEGACY_BODY);
      const r = runConfigure(s, legacy, mode);
      assert.ok(fs.existsSync(legacy + '.witness-touched'), `the preload never reached the window: ${show(r)}`);
      assert.equal(fs.existsSync(legacy), false, `the legacy config is still at its name after the move: ${show(r)}`);
      assert.ok(fs.existsSync(bak), `the backup was not written: ${show(r)}`);
      assert.notEqual(fs.readFileSync(bak, 'utf8'), LEGACY_BODY, 'the backup holds the change the migration read');
      assert.notEqual(r.status, 0, `the run exited 0 although the backup holds a change the new config lacks: ${show(r)}`);
      assert.ok(r.stderr.includes(bak) && r.stderr.includes(path.join('coal', 'coalface.json')), `stderr does not name both files: ${show(r)}`);
    });
  }
}

test('leg B (root .coalface.json, no change): the migration moves the legacy config aside, writes the new home, says so in one line and exits 0', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, null);
  const home = path.join(s.proj, '.claude', 'coal', 'coalface.json');
  assert.equal(r.status, 0, show(r));
  assert.ok(fs.existsSync(home), `the new home was not written: ${show(r)}`);
  assert.equal(JSON.parse(fs.readFileSync(home, 'utf8')).bandwidth, 50, show(r));
  assert.equal(fs.existsSync(legacy), false, `the legacy config is still at its name: ${show(r)}`);
  assert.equal(fs.readFileSync(bak, 'utf8'), LEGACY_BODY, 'the backup does not hold the legacy bytes');
  assert.ok(r.stdout.includes('Migrated the project config') && r.stdout.includes(bak) && r.stdout.includes('no earlier backup'), `the migration line does not name the backup: ${show(r)}`);
  assert.equal(r.stdout.includes('tracked by git'), false, 'an untracked legacy file is not described as tracked');
});

test('W-c1: bytes appended to the legacy config inside the migration window are kept, and named when the new config lacks them', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, 'w-c1');
  const holder = [legacy, bak].find((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('WRITTEN-IN-WINDOW'));
  assert.ok(holder, `the bytes appended in the window were lost with the file: ${show(r)}`);
  const newText = fs.existsSync(path.join(s.proj, '.claude', 'coal', 'coalface.json')) ? fs.readFileSync(path.join(s.proj, '.claude', 'coal', 'coalface.json'), 'utf8') : '';
  if (!newText.includes('WRITTEN-IN-WINDOW')) {
    assert.notEqual(r.status, 0, `the appended bytes are not in the new config and the run exited 0: ${show(r)}`);
    assert.ok(r.stderr.includes(bak), `stderr does not name the backup that holds them: ${show(r)}`);
  }
});

test('a refused move keeps the legacy config byte for byte, makes no backup, prints no success line and exits 1', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, 'ebusy');
  assert.equal(r.status, 1, show(r));
  assert.equal(fs.readFileSync(legacy, 'utf8'), LEGACY_BODY, 'the legacy config changed after a refused move');
  assert.equal(fs.existsSync(bak), false, `a backup was made although the move was refused: ${show(r)}`);
  assert.equal(r.stdout.includes('Successfully updated') || r.stdout.includes('Migrated'), false, `a success line was printed after a refused move: ${show(r)}`);
  assert.ok(r.stderr.includes(legacy) && r.stderr.includes('EBUSY'), `stderr does not name the legacy file and the code: ${show(r)}`);
});

test('an earlier backup at the same name is replaced, and the run says so', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  fs.writeFileSync(bak, 'OLD BACKUP\n');
  const r = runConfigure(s, legacy, null);
  assert.equal(r.status, 0, show(r));
  assert.equal(fs.readFileSync(bak, 'utf8'), LEGACY_BODY, 'the earlier backup was not replaced by the moved file');
  assert.ok(r.stdout.includes('replaced an earlier backup'), `the run does not say it replaced an earlier backup: ${show(r)}`);
});

test('a writer that keeps writing the old file after the move is named: the backup holds bytes the new config lacks, and the run exits 1', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, 'w-b1');
  assert.equal(r.status, 1, show(r));
  assert.ok(fs.readFileSync(bak, 'utf8').includes('WRITTEN-AFTER-RENAME'), 'the write after the move is not in the backup');
  assert.ok(r.stderr.includes(bak) && r.stderr.includes(path.join('coal', 'coalface.json')), `stderr does not name both files: ${show(r)}`);
});

test('a backup that cannot be read back is said to be unchecked: the run exits 1 and prints no success line', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, 'bak-unreadable');
  assert.equal(r.status, 1, show(r));
  assert.equal(fs.readFileSync(bak, 'utf8'), LEGACY_BODY, 'the moved bytes are not in the backup');
  assert.ok(r.stderr.includes('could not be checked'), `stderr does not say the backup was not checked: ${show(r)}`);
  assert.equal(r.stdout.includes('Successfully updated') || r.stdout.includes('Migrated'), false, `a success line was printed for an unchecked backup: ${show(r)}`);
});

test('a legacy config that git tracks is named as a deletion to commit, and the backup as the user\'s', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8', env: gitEnv(process.env) }).status !== 0) {
    t.skip('git is not on this box, so the tracked-file line cannot be shown here');
    return;
  }
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  fs.writeFileSync(legacy, LEGACY_BODY);
  const probeEnv = gitEnv(childEnv(s.home, {}));
  spawnSync('git', ['init', '-q'], { cwd: s.proj, env: probeEnv, encoding: 'utf8' });
  spawnSync('git', ['add', '--', '.coalface.json'], { cwd: s.proj, env: probeEnv, encoding: 'utf8' });
  const r = runConfigure(s, legacy, null);
  assert.equal(r.status, 0, show(r));
  assert.ok(r.stdout.includes('tracked by git') && r.stdout.includes('commit'), `stdout does not say to commit the removal: ${show(r)}`);
});

test('a legacy config another writer moved away during the run is named as no longer at its path, never as kept: the run exits 1 and prints no success line', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const elsewhere = legacy + '.elsewhere';
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, 'moved-away');
  assert.equal(r.status, 1, show(r));
  assert.equal(fs.readFileSync(elsewhere, 'utf8'), LEGACY_BODY, 'the other writer\'s move did not carry the legacy bytes');
  assert.equal(fs.existsSync(legacy + '.bak'), false, `a backup was made by a run that moved nothing: ${show(r)}`);
  assert.equal(r.stdout.includes('Successfully updated') || r.stdout.includes('Migrated'), false, `a success line was printed after a failed move: ${show(r)}`);
  assert.ok(r.stderr.includes('no longer at'), `stderr does not say the legacy file is no longer at its path: ${show(r)}`);
  assert.equal(r.stderr.includes('it was kept'), false, `stderr says the legacy file was kept although it is gone: ${show(r)}`);
});

test('a legacy config whose move fails and whose presence cannot be checked is named as unchecked, never as kept: the run exits 1, prints no success line and keeps the legacy bytes', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, 'lstat-denied');
  assert.equal(r.status, 1, show(r));
  assert.equal(fs.readFileSync(legacy, 'utf8'), LEGACY_BODY, 'the legacy bytes changed after a refused move');
  assert.equal(r.stdout.includes('Successfully updated') || r.stdout.includes('Migrated'), false, `a success line was printed after a failed move: ${show(r)}`);
  assert.ok(r.stderr.includes('could not check'), `stderr does not say the legacy file could not be checked: ${show(r)}`);
  assert.equal(r.stderr.includes('it was kept'), false, `stderr says the legacy file was kept though nothing checked it: ${show(r)}`);
});

// 29ng (N): the migration's one success line says the old config was read-only when it had no write bit (read BEFORE the move). The file is still moved,
// and the backup keeps the mode it had. POSIX: mode 0o444 as a non-root user (root writes through it: a visible skip). Windows: the read-only attribute,
// which chmod 0o444 sets; the attribute is cleared in finally, so the sandbox can be removed.
test('a read-only legacy config is moved to its backup as it was, and the migration line says it was read-only (29ng N)', (t) => {
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (process.platform !== 'win32' && isRoot) { t.skip('root writes through a 0o444 file, so the mode bits do not hold it read-only here: the ubuntu and macos legs run it as non-root'); return; }
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  const bak = legacy + '.bak';
  fs.writeFileSync(legacy, LEGACY_BODY);
  fs.chmodSync(legacy, 0o444);
  let r;
  let bakWriteBits;
  try {
    r = runConfigure(s, legacy, null);
    bakWriteBits = fs.lstatSync(bak).mode & 0o222;
  } finally {
    if (fs.existsSync(bak)) fs.chmodSync(bak, 0o666); // the attribute cleared before the sandbox is removed
  }
  assert.equal(r.status, 0, show(r));
  assert.equal(fs.existsSync(legacy), false, `the read-only legacy config is still at its name: ${show(r)}`);
  assert.equal(bakWriteBits, 0, 'the backup gained a write bit: the mode it had was not kept');
  assert.ok(r.stdout.includes(', read-only as it was.'), `the migration line does not say the old config was read-only: ${show(r)}`);
});

test('a writable legacy config is moved to its backup, and the migration line does not say read-only (29ng N)', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, null);
  assert.equal(r.status, 0, show(r));
  assert.equal(r.stdout.includes('read-only'), false, `the migration line says read-only for a writable config: ${show(r)}`);
});
