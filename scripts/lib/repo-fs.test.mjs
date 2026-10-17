import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdirRepoParents, escapesRoot, RepoWriteRefused } from './repo-fs.mjs';

// CWK2-042: mkdirRepoParents judges the chain from the write root BEFORE anything is made. A junction on Windows, a symlink on POSIX; the type argument is ignored off Windows.
function layout(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-repofs-root-')));
  const outside = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-repofs-out-')));
  t.after(() => { for (const d of [root, outside]) fs.rmSync(d, { recursive: true, force: true }); });
  return { root, outside };
}
function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); return true; } catch { t.skip('a directory link cannot be made here (capability probe)'); return false; }
}
const refused = (fn, re) => assert.throws(fn, (e) => e instanceof RepoWriteRefused && re.test(e.message) && /and re-run$/.test(e.message) && !/^(EEXIST|ENOTDIR|EPERM)/.test(e.message));

test('the plain case: a missing chain inside the project is made, and a second call is a no-op', (t) => {
  const { root } = layout(t);
  const dir = path.join(root, '.claude', 'coal');
  mkdirRepoParents(dir, root);
  assert.ok(fs.statSync(dir).isDirectory());
  mkdirRepoParents(dir, root);
});

test('a missing parent several levels deep inside the project is made one component at a time', (t) => {
  const { root } = layout(t);
  mkdirRepoParents(path.join(root, 'a', 'b', 'c'), root);
  assert.ok(fs.statSync(path.join(root, 'a', 'b', 'c')).isDirectory());
});

test('the witness: a .claude link to a folder OUTSIDE the project is refused and nothing is made outside', (t) => {
  const { root, outside } = layout(t);
  if (!tryLink(t, outside, path.join(root, '.claude'))) return;
  refused(() => mkdirRepoParents(path.join(root, '.claude', 'coal'), root), /link or junction/);
  assert.deepEqual(fs.readdirSync(outside), [], 'an empty folder appeared outside the project');
});

test('a link at .claude/coal is refused and nothing is made outside', (t) => {
  const { root, outside } = layout(t);
  fs.mkdirSync(path.join(root, '.claude'));
  if (!tryLink(t, outside, path.join(root, '.claude', 'coal'))) return;
  refused(() => mkdirRepoParents(path.join(root, '.claude', 'coal'), root), /link or junction/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('a link that points INSIDE the project is refused too: the pin is the literal folder, not "inside the project"', (t) => {
  const { root } = layout(t);
  const real = path.join(root, 'real');
  fs.mkdirSync(real);
  if (!tryLink(t, real, path.join(root, '.claude'))) return;
  refused(() => mkdirRepoParents(path.join(root, '.claude', 'coal'), root), /link or junction/);
  assert.deepEqual(fs.readdirSync(real), []);
});

test('a FILE named .claude is refused with a sentence, never a raw errno', (t) => {
  const { root } = layout(t);
  fs.writeFileSync(path.join(root, '.claude'), 'x');
  refused(() => mkdirRepoParents(path.join(root, '.claude', 'coal'), root), /exists and is not a directory/);
  assert.equal(fs.readFileSync(path.join(root, '.claude'), 'utf8'), 'x');
});

test('a target outside the root is refused; a real child folder named ..cfg is not (a segment test, never a prefix test)', (t) => {
  const { root, outside } = layout(t);
  refused(() => mkdirRepoParents(path.join(outside, 'x'), root), /outside the project root/);
  assert.deepEqual(fs.readdirSync(outside), []);
  mkdirRepoParents(path.join(root, '..cfg', 'coal'), root);
  assert.ok(fs.statSync(path.join(root, '..cfg', 'coal')).isDirectory());
  assert.equal(escapesRoot('..'), true);
  assert.equal(escapesRoot(['..', 'x'].join(path.sep)), true);
  assert.equal(escapesRoot('..cfg'), false);
});

test('a null root (the user-global config) keeps the plain recursive make', (t) => {
  const { outside } = layout(t);
  const dir = path.join(outside, 'x', 'y');
  mkdirRepoParents(dir, null);
  assert.ok(fs.statSync(dir).isDirectory());
});

test('dir equal to the root returns at once and makes nothing (named narrow gap M8: a root reached through a link is not walked, so a project opened through a linked path still works)', (t) => {
  const { root, outside } = layout(t);
  mkdirRepoParents(root, root);
  const viaLink = path.join(outside, 'rootlink');
  if (!tryLink(t, root, viaLink)) return;
  mkdirRepoParents(viaLink, viaLink);
  assert.deepEqual(fs.readdirSync(root), []);
});

// 17c (c)(d): writeFileAtomic, the temp-then-rename write.
import { writeFileAtomic } from './repo-fs.mjs';

test('writeFileAtomic writes a string and a Buffer, replaces an existing file, and leaves no temp', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  writeFileAtomic(f, 'one');
  assert.equal(fs.readFileSync(f, 'utf8'), 'one');
  writeFileAtomic(f, Buffer.from('two'));
  assert.equal(fs.readFileSync(f, 'utf8'), 'two');
  assert.deepEqual(fs.readdirSync(root), ['a.json']);
});

test('writeFileAtomic: a hard link at the target is replaced, the other name keeps its bytes (a rename never writes through)', (t) => {
  const { root, outside } = layout(t);
  const victim = path.join(outside, 'victim.txt');
  fs.writeFileSync(victim, 'keep me');
  const f = path.join(root, 'a.json');
  try { fs.linkSync(victim, f); } catch { t.skip('a hard link cannot be made here (capability probe)'); return; }
  writeFileAtomic(f, 'new');
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep me');
  assert.equal(fs.readFileSync(f, 'utf8'), 'new');
});

test('writeFileAtomic: a symlink at the target is replaced, never followed (probed by capability)', (t) => {
  const { root, outside } = layout(t);
  const victim = path.join(outside, 'victim.txt');
  fs.writeFileSync(victim, 'keep me');
  const f = path.join(root, 'a.json');
  try { fs.symlinkSync(victim, f, 'file'); } catch { t.skip('a file symlink cannot be made here (capability probe; Windows needs a privilege)'); return; }
  writeFileAtomic(f, 'new');
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep me');
  // CodeQL js/file-system-race (alert #20, CWE-367; precedent a1056f8): an lstat-by-name followed by a read-by-name is two lookups of one NAME. Here the entry's type comes from
  // the readdir that enumerated it (no second stat of the name), and the bytes are read through ONE descriptor that is also checked to be a regular file.
  const entry = fs.readdirSync(root, { withFileTypes: true }).find((e) => e.name === 'a.json');
  assert.ok(entry && !entry.isSymbolicLink() && entry.isFile(), 'the target is still a link (or is not a regular file)');
  const fd = fs.openSync(f, 'r');
  try {
    assert.ok(fs.fstatSync(fd).isFile());
    assert.equal(fs.readFileSync(fd, 'utf8'), 'new');
  } finally { fs.closeSync(fd); }
});

test('writeFileAtomic: a leftover temp of this pid refuses with a sentence, leaves the leftover and the target untouched', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  fs.writeFileSync(f, 'old');
  const temp = `${f}.coalface-tmp-${process.pid}`;
  fs.writeFileSync(temp, 'leftover');
  refused(() => writeFileAtomic(f, 'new'), /leftover temp file blocks the write/);
  assert.equal(fs.readFileSync(f, 'utf8'), 'old');
  assert.equal(fs.readFileSync(temp, 'utf8'), 'leftover');
});

test('writeFileAtomic: a rename that fails (the target is a non-empty folder) refuses with a sentence, keeps the old entry and deletes the temp, never writes in place', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  fs.mkdirSync(f);
  fs.writeFileSync(path.join(f, 'inner.txt'), 'keep me');
  refused(() => writeFileAtomic(f, 'new'), /could not be replaced/);
  assert.equal(fs.readFileSync(path.join(f, 'inner.txt'), 'utf8'), 'keep me');
  assert.deepEqual(fs.readdirSync(root), ['a.json'], 'the temp was left behind');
});

// 17c bounce LOW-3: the "no in-place fallback" property for the one case where a fallback is tempting, a held plain-file target (Windows: EPERM/EBUSY/EACCES from the rename).
// fs.renameSync is stubbed to throw once, so the leg runs on every platform; the model is stubRmSync in git-test-env.test.mjs.
test('writeFileAtomic: a rename refused EPERM on a plain-file target keeps the old bytes, removes the temp, throws "could not be replaced" and never writes in place', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  fs.writeFileSync(f, 'old');
  const real = fs.renameSync;
  let calls = 0;
  fs.renameSync = () => { calls += 1; throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); };
  t.after(() => { fs.renameSync = real; });
  refused(() => writeFileAtomic(f, 'new'), /could not be replaced/);
  assert.equal(calls, 1, 'the rename is tried once, never retried in place');
  assert.equal(fs.readFileSync(f, 'utf8'), 'old', 'the target was written in place');
  assert.deepEqual(fs.readdirSync(root), ['a.json'], 'the temp was left behind');
});

// 17c E1 (t161 finding 1, the mode half): the old in-place write kept an existing file's permission bits; a rename installs the TEMP's mode (0o666 & umask), so a 0o640 config became
// 0o644 under the usual umask. A REPLACED regular target keeps its own bits; the .bak copy of a config takes the mode of the config it copies (what copyFileSync gave it); a NEW file
// keeps the previous default (no restrictive default nobody asked for). The mode legs probe the capability (a volume that keeps no POSIX bits skips VISIBLY), one skippable leg per test.
function modeBitsKept(dir) {
  const probe = path.join(dir, 'mode-probe');
  fs.writeFileSync(probe, 'x');
  try { fs.chmodSync(probe, 0o640); return (fs.statSync(probe).mode & 0o777) === 0o640; } catch { return false; } finally { fs.rmSync(probe, { force: true }); }
}

test('writeFileAtomic keeps the permission bits of a replaced regular file (skipped where the volume keeps no POSIX modes)', (t) => {
  const { root } = layout(t);
  if (!modeBitsKept(root)) { t.skip('this volume keeps no POSIX permission bits (capability probe)'); return; }
  const f = path.join(root, 'a.json');
  fs.writeFileSync(f, 'old');
  fs.chmodSync(f, 0o640);
  writeFileAtomic(f, 'new');
  assert.equal(fs.statSync(f).mode & 0o777, 0o640);
  assert.equal(fs.readFileSync(f, 'utf8'), 'new');
});

test('writeFileAtomic with modeFrom: the file takes the mode of the named source (the .bak of a config), not the temp default (skipped where the volume keeps no POSIX modes)', (t) => {
  const { root } = layout(t);
  if (!modeBitsKept(root)) { t.skip('this volume keeps no POSIX permission bits (capability probe)'); return; }
  const src = path.join(root, 'cfg.json');
  fs.writeFileSync(src, 'orig');
  fs.chmodSync(src, 0o600);
  writeFileAtomic(path.join(root, 'cfg.json.bak'), fs.readFileSync(src), src);
  assert.equal(fs.statSync(path.join(root, 'cfg.json.bak')).mode & 0o777, 0o600);
});

test('writeFileAtomic: a NEW file keeps the default creation mode (no restrictive default is invented)', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'new.json');
  writeFileAtomic(f, 'x');
  const plain = path.join(root, 'plain.json');
  fs.writeFileSync(plain, 'x');
  assert.equal(fs.statSync(f).mode & 0o777, fs.statSync(plain).mode & 0o777, 'a new file got a different mode than a plain create');
});

// t161 finding 2: fs.writeSync returns a byte count and may write short without throwing; the rename then installed a truncated file. The stub makes the FIRST writeSync write
// only half the buffer (the room's stubRmSync model); the whole buffer must still reach the file.
test('writeFileAtomic writes the whole buffer even when a single writeSync would write short', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  const content = 'x'.repeat(4096);
  const realWrite = fs.writeSync;
  let shorted = 0;
  fs.writeSync = (fd, buf, ...rest) => {
    const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
    if (shorted++ === 0 && b.length > 1) return realWrite(fd, b, 0, Math.floor(b.length / 2));
    return realWrite(fd, buf, ...rest);
  };
  t.after(() => { fs.writeSync = realWrite; });
  writeFileAtomic(f, content);
  fs.writeSync = realWrite;
  assert.equal(fs.readFileSync(f, 'utf8').length, 4096, 'the file holds a truncated write');
});

// The mode legs above skip where the volume keeps no POSIX bits (this box is Windows). These stub legs run EVERYWHERE: fs.fchmodSync records the mode it is asked to set, so the
// rule (a replaced regular file and a modeFrom source pass their own bits; a new file sets none) is proven on every platform.
function recordFchmod(t) {
  const real = fs.fchmodSync;
  const modes = [];
  fs.fchmodSync = (fd, m) => { modes.push(m); };
  t.after(() => { fs.fchmodSync = real; });
  return modes;
}

test('writeFileAtomic sets the replaced file\'s own mode bits on the temp before the rename (stub, every platform)', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  fs.writeFileSync(f, 'old');
  const want = fs.lstatSync(f).mode & 0o7777;
  const modes = recordFchmod(t);
  writeFileAtomic(f, 'new');
  assert.deepEqual(modes, [want]);
});

test('writeFileAtomic with modeFrom sets the SOURCE file\'s mode bits, not the target\'s (stub, every platform)', (t) => {
  const { root } = layout(t);
  const src = path.join(root, 'cfg.json');
  fs.writeFileSync(src, 'orig');
  const want = fs.lstatSync(src).mode & 0o7777;
  const modes = recordFchmod(t);
  writeFileAtomic(path.join(root, 'cfg.json.bak'), 'orig', src);
  assert.deepEqual(modes, [want]);
});

test('writeFileAtomic for a NEW file sets no mode at all (stub, every platform)', (t) => {
  const { root } = layout(t);
  const modes = recordFchmod(t);
  writeFileAtomic(path.join(root, 'new.json'), 'x');
  assert.deepEqual(modes, []);
});

test('writeFileAtomic ignores a modeFrom that is a folder: no mode is set and the write still lands (stub, every platform)', (t) => {
  const { root } = layout(t);
  const dir = path.join(root, 'd');
  fs.mkdirSync(dir);
  const modes = recordFchmod(t);
  writeFileAtomic(path.join(root, 'x.json'), 'x', dir);
  assert.deepEqual(modes, []);
  assert.equal(fs.readFileSync(path.join(root, 'x.json'), 'utf8'), 'x');
});

// rev-e1 LOW-1: a volume that keeps no POSIX bits may refuse fchmod (the swallow is deliberate: the write must still land). The stub makes fchmodSync throw on every platform, so the
// leg proves the swallowed failure path that the leg above never reaches.
test('writeFileAtomic: a refused fchmod does not stop the write: the file is replaced, no temp is left (stub, every platform)', (t) => {
  const { root } = layout(t);
  const f = path.join(root, 'a.json');
  fs.writeFileSync(f, 'old');
  const real = fs.fchmodSync;
  let calls = 0;
  fs.fchmodSync = () => { calls += 1; throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); };
  t.after(() => { fs.fchmodSync = real; });
  writeFileAtomic(f, 'new');
  assert.equal(calls, 1, 'the stub was not reached (the file has no mode to apply)');
  assert.equal(fs.readFileSync(f, 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(root), ['a.json'], 'a temp was left');
});
