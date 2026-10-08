import test from 'node:test';
import assert from 'node:assert/strict';
import { skeleton, closeAt, splitTop, BLANK } from './js-skeleton.mjs';

const NL = String.fromCharCode(10);
const BT = String.fromCharCode(96);
const blanks = (n) => BLANK.repeat(n);

test('same length, same newlines, and code stays code', () => {
  const src = 'const a = 1; // note' + NL + 'a += 2;' + NL;
  const r = skeleton(src);
  assert.equal(r.ok, true);
  assert.equal(r.skel.length, src.length);
  assert.equal(r.skel.split(NL).length, src.split(NL).length);
  assert.equal(r.skel.slice(0, 12), 'const a = 1;');
  assert.equal(r.skel.includes('note'), false);
});

test('a string body is blanked and its quotes are kept; escapes do not end the string', () => {
  const r = skeleton("x('a" + String.fromCharCode(92) + "'b', \"c{\")");
  assert.equal(r.ok, true);
  assert.equal(r.skel, "x('" + blanks(4) + "', \"" + blanks(2) + '")');
});

test('a regex literal holding a quote or a bracket is blanked, so it cannot desynchronise a bracket match', () => {
  for (const body of ["'", '"', BT, '{', '[(]']) {
    const src = 'f(a.replace(/' + body + '/g, 0), { GIT_DIR: d })';
    const r = skeleton(src);
    assert.equal(r.ok, true, body);
    assert.equal(r.skel.indexOf('GIT_DIR') > -1, true, 'the entry after the regex stays visible: ' + body);
    const open = r.skel.indexOf('{ GIT');
    assert.equal(closeAt(r.skel, open), r.skel.lastIndexOf('}'));
  }
});

test('a slash is a division after a value and a regex after an operator or a keyword; a class may hold the slash', () => {
  const div = skeleton('a / b / c' + NL).skel;
  assert.equal(div, 'a / b / c' + NL);
  const rx = skeleton('x = /a/b/;'.replace('/a/b/', '/[/]/g')).skel;
  assert.equal(rx, 'x = /' + blanks(3) + '/g;');
  assert.equal(skeleton('return /a/;').skel, 'return /' + blanks(1) + '/;');
});

test('a template keeps the code inside ${ } and blanks its text; nesting works', () => {
  const r = skeleton(BT + 'ab${ f(' + BT + 'x${y}z' + BT + ') }cd' + BT);
  assert.equal(r.ok, true);
  assert.ok(r.skel.includes('f('));
  assert.ok(r.skel.includes('y'));
  assert.equal(r.skel.includes('ab'), false);
  assert.equal(r.skel.includes('cd'), false);
});

test('a block comment is blanked across lines and keeps its newlines; a shebang line is not code', () => {
  const r = skeleton('#!/usr/bin/env node' + NL + '/* a' + NL + ' b */ x;');
  assert.equal(r.ok, true);
  assert.equal(r.skel.includes('env'), false);
  assert.equal(r.skel.split(NL).length, 3);
  assert.ok(r.skel.endsWith(' x;'));
});

test('anything it cannot read whole is NOT ok: an open string, template, regex, comment or bracket', () => {
  for (const src of ["x = 'abc", 'x = ' + BT + 'abc', 'x = /abc', '/* abc', 'f({', 'x }']) {
    assert.equal(skeleton(src).ok, false, src);
  }
});

test('closeAt and splitTop work on a skeleton: nesting, crossed brackets, empty entries', () => {
  const s = skeleton("{ a: [1, 2], b: f(x, y), c: '1,2', }").skel;
  assert.equal(closeAt(s, 0), s.length - 1);
  assert.equal(closeAt('( ]', 0), -1);
  assert.equal(closeAt('(', 0), -1);
  assert.deepEqual(splitTop(s, 1, s.length - 1).map(([a, b]) => s.slice(a, b).trim()).map((x) => x.slice(0, 2)), ['a:', 'b:', 'c:']);
});
