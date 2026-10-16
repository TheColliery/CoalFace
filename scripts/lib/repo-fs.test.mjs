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
