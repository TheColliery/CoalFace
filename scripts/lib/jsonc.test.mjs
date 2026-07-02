// Unit tests for the JSONC stripper + proto-guarded parse (zero-dep, node:test only).
import { test } from 'node:test';
import assert from 'node:assert';
import { stripJsonc, parseJsonc } from './jsonc.mjs';

test('stripJsonc removes line + block comments, keeps strings intact', () => {
  const src = '{\n  // line comment\n  "a": "x // not a comment", /* block */ "b": 2\n}';
  const parsed = JSON.parse(stripJsonc(src));
  assert.deepStrictEqual(parsed, { a: 'x // not a comment', b: 2 });
});

test('stripJsonc: a string value ending in a backslash does not desync (CM #12)', () => {
  const src = '{ "path": "C:\\\\", "next": 1 // trailing comment\n}';
  const parsed = JSON.parse(stripJsonc(src));
  assert.deepStrictEqual(parsed, { path: 'C:\\', next: 1 });
});

test('parseJsonc drops __proto__/constructor/prototype (proto-pollution guard)', () => {
  const evil = '{ "coalfaceMode": "auto", "__proto__": { "coalfaceMode": "off" }, "constructor": {}, "prototype": {} }';
  const parsed = parseJsonc(evil);
  assert.strictEqual(parsed.coalfaceMode, 'auto');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, 'constructor'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, 'prototype'), false);
  // And the merge that motivated the guard stays clean:
  const merged = Object.assign({}, parsed);
  assert.strictEqual(merged.coalfaceMode, 'auto');
  assert.strictEqual({}.coalfaceMode, undefined, 'Object.prototype not polluted');
});
