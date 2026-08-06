import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDist, checkDist, filesMatch } from './build-plugin.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'coalface-dist-test-'));
}

// EOL-agnostic on a TEXT_EXTS file: robust to whatever line-ending convention
// this checkout actually has (board #47's `.gitattributes` conform + local
// core.autocrlf means the real files on disk may be CRLF or LF) — flip
// relative to what the source bytes ACTUALLY are, never assume one direction.
function flipEol(buf) {
  const text = buf.toString('latin1');
  return Buffer.from(
    buf.includes(Buffer.from('\r\n')) ? text.replace(/\r\n/g, '\n') : text.replace(/\n/g, '\r\n'),
    'latin1'
  );
}

test('buildDist + checkDist round-trip clean against the real source', () => {
  const distRoot = mkTmp();
  buildDist(distRoot);
  assert.deepEqual(checkDist(distRoot), []);
  fs.rmSync(distRoot, { recursive: true, force: true });
});

test('checkDist flags a stale file', () => {
  const distRoot = mkTmp();
  buildDist(distRoot);
  fs.writeFileSync(path.join(distRoot, '.claude-plugin', 'plugin.json'), '{}');
  const drift = checkDist(distRoot);
  assert.ok(drift.some((d) => d.includes('stale')));
  fs.rmSync(distRoot, { recursive: true, force: true });
});

test('checkDist flags an orphan top-level entry', () => {
  const distRoot = mkTmp();
  buildDist(distRoot);
  fs.mkdirSync(path.join(distRoot, 'scripts'));
  const drift = checkDist(distRoot);
  assert.ok(drift.some((d) => d.includes('orphan top-level')));
  fs.rmSync(distRoot, { recursive: true, force: true });
});

// board #59: a dist copy that differs from source ONLY by CRLF-vs-LF line
// endings (board #47's `.gitattributes` conform lets two checkouts of ONE
// commit differ this way for byte-identical content) must NOT read as stale —
// that was the false-positive checkDist reported before filesMatch existed.
test('a dist copy differing from source only by CRLF-vs-LF on a TEXT_EXTS file reads as in sync', () => {
  const distRoot = mkTmp();
  buildDist(distRoot);
  const rel = path.join('.claude-plugin', 'plugin.json');
  const srcBytes = fs.readFileSync(path.join(repoRoot, rel));
  const flipped = flipEol(srcBytes);
  assert.notDeepEqual(flipped, srcBytes, 'fixture setup: the flip must actually change the bytes');
  fs.writeFileSync(path.join(distRoot, rel), flipped);
  const drift = checkDist(distRoot);
  assert.ok(!drift.some((d) => d.includes(rel)), `expected no stale entry for ${rel}, got: ${JSON.stringify(drift)}`);
  fs.rmSync(distRoot, { recursive: true, force: true });
});

// board #59: a REAL content edit made under CRLF line endings must still fail
// loud. INSERTION-shaped deliberately (adding a token the original did not
// have) — a delete/replace-shaped edit can pass against a sabotaged predicate
// that only checks length or removal; an insertion is the shape that actually
// catches a broken equality check (CoalLedger's own INSPECT finding, ported).
test('a real content INSERTION under CRLF line endings still fails loud (stale, not silently accepted)', () => {
  const distRoot = mkTmp();
  buildDist(distRoot);
  const rel = path.join('.claude-plugin', 'plugin.json');
  const srcBytes = fs.readFileSync(path.join(repoRoot, rel));
  const eol = srcBytes.includes(Buffer.from('\r\n')) ? '\r\n' : '\n';
  // Insert a token the source does not have, on ITS OWN new line, so this is
  // unambiguously an addition (not a replace/delete of existing bytes).
  const withInsertion = Buffer.from(srcBytes.toString('latin1') + `// COALFACE-BOARD-59-CANARY-INSERTION${eol}`, 'latin1');
  fs.writeFileSync(path.join(distRoot, rel), withInsertion);
  const drift = checkDist(distRoot);
  assert.ok(drift.some((d) => d.includes('stale') && d.includes(rel)), `expected a stale entry for ${rel}, got: ${JSON.stringify(drift)}`);
  fs.rmSync(distRoot, { recursive: true, force: true });
});

// board #59 INSPECT (finding 2): filesMatch()'s latin1 decode is defended by a
// six-line comment ("utf8 would false-match a corrupted dist containing invalid
// UTF-8") that no test exercised — flipping latin1 -> utf8 stayed green under
// every other case in this file, because a SINGLE invalid byte against an
// otherwise-valid source decodes to a DIFFERENT string under utf8 too (U+FFFD
// vs the real char) and so still mismatches either way. The actual failure
// needs BOTH sides invalid at the same position with DIFFERENT byte values
// (0xFF vs 0xFE — both illegal in every UTF-8 position): utf8 collapses both
// to U+FFFD and would falsely MATCH; latin1 is a lossless 1:1 mapping and
// keeps them distinct (U+00FF vs U+00FE), so filesMatch() must return false.
test('two invalid-UTF-8 bytes that differ from EACH OTHER still fail loud (utf8 would collapse both to U+FFFD and false-match)', () => {
  const a = path.join(mkTmp(), 'a.md');
  const bDir = mkTmp();
  const b = path.join(bDir, 'a.md');
  fs.mkdirSync(path.dirname(a), { recursive: true });
  const prefix = Buffer.from('some shared text ', 'latin1');
  const suffix = Buffer.from(' more shared text', 'latin1');
  const bufA = Buffer.concat([prefix, Buffer.from([0xff]), suffix]);
  const bufB = Buffer.concat([prefix, Buffer.from([0xfe]), suffix]);
  assert.notDeepEqual(bufA, bufB, 'fixture setup: the two invalid bytes must actually differ');
  assert.equal(bufA.toString('utf8'), bufB.toString('utf8'), 'fixture precondition: utf8 must collapse both to the same string (both -> U+FFFD)');
  fs.writeFileSync(a, bufA);
  fs.writeFileSync(b, bufB);
  assert.equal(filesMatch(a, b), false, 'latin1 must keep 0xFF and 0xFE distinct — a utf8 decode would false-match these');
  fs.rmSync(path.dirname(a), { recursive: true, force: true });
  fs.rmSync(bDir, { recursive: true, force: true });
});

// board #59 INSPECT (finding 2, second half): the CRLF normalize is
// `replace(/\r\n/g, '\n')`, deliberately not a blanket `replace(/\r/g, '')` — a
// LONE bare \r (not followed by \n) is real content, not a line-ending
// artifact, and must still cause a mismatch. Isolated via filesMatch()
// directly: an appended-text version of this case would still mismatch on
// the appended bytes alone regardless of \r handling, so it can't tell the
// two regexes apart. Here the ONLY difference between the two buffers is one
// lone \r — under the correct regex neither buffer contains "\r\n" so both
// stay untouched and they compare unequal (correct: mismatch); under a
// blanket `\r`-strip regression, stripping the lone \r from one side makes
// the two buffers byte-identical text and would falsely MATCH.
test('a lone bare CR (not part of CRLF) makes two otherwise-identical files mismatch', () => {
  const distRoot = mkTmp();
  const a = path.join(distRoot, 'a.md');
  const b = path.join(distRoot, 'b.md');
  const bufA = Buffer.from('hello\rworld', 'latin1'); // lone CR, no following LF — real content
  const bufB = Buffer.from('helloworld', 'latin1'); // the CR is simply absent — genuinely different content
  assert.notDeepEqual(bufA, bufB, 'fixture setup: the two buffers must actually differ');
  fs.writeFileSync(a, bufA);
  fs.writeFileSync(b, bufB);
  assert.equal(filesMatch(a, b), false, 'a lone \\r must not be silently stripped — these are different content, not an EOL variant of each other');
  fs.rmSync(distRoot, { recursive: true, force: true });
});

// board #59 INSPECT (finding 3): checkDist() only ever walks real DIST_ITEMS
// (which today are all TEXT_EXTS), so it structurally cannot exercise the
// non-TEXT_EXTS branch — that coverage has to call filesMatch() directly.
// A non-text/unlisted extension (e.g. a future binary asset) must stay
// strict byte-compare even when it would "normalize equal" under the
// CRLF-fold — the exact case TEXT_EXTS's own comment names ("must not
// silently normalize a future binary asset").
test('filesMatch() stays strict byte-compare on a non-TEXT_EXTS extension (CRLF fallback does not fire)', () => {
  const distRoot = mkTmp();
  const a = path.join(distRoot, 'asset.bin');
  const b = path.join(distRoot, 'asset-copy.bin');
  const original = Buffer.from('line one\r\nline two\r\n', 'latin1');
  const flipped = flipEol(original);
  assert.notDeepEqual(flipped, original, 'fixture setup: the flip must actually change the bytes');
  fs.writeFileSync(a, original);
  fs.writeFileSync(b, flipped);
  assert.equal(filesMatch(a, b), false, 'a .bin pair differing only by EOL must NOT match — .bin is not in TEXT_EXTS');
  fs.rmSync(distRoot, { recursive: true, force: true });
});

// Sibling positive control for the same extension gate: two .md files (a real
// TEXT_EXTS member) differing only by EOL DO match — proves the gate is a
// real branch, not a helper that always returns false for a same-ext pair.
test('filesMatch() falls back to EOL-normalize on a TEXT_EXTS extension (.md)', () => {
  const distRoot = mkTmp();
  const a = path.join(distRoot, 'note.md');
  const b = path.join(distRoot, 'note-copy.md');
  const original = Buffer.from('# Title\r\nbody\r\n', 'latin1');
  const flipped = flipEol(original);
  assert.notDeepEqual(flipped, original, 'fixture setup: the flip must actually change the bytes');
  fs.writeFileSync(a, original);
  fs.writeFileSync(b, flipped);
  assert.equal(filesMatch(a, b), true, 'two .md files differing only by EOL must match — .md IS in TEXT_EXTS');
  fs.rmSync(distRoot, { recursive: true, force: true });
});
