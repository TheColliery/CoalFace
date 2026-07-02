// Unit tests for the .coalface.json schema SSoT (zero-dep, node:test only).
import { test } from 'node:test';
import assert from 'node:assert';
import { CONFIG_SCHEMA, validateValue, validateConfig } from './config-schema.mjs';

test('schema ships exactly the 5 shipped keys, each with one-line help', () => {
  const keys = CONFIG_SCHEMA.map((s) => s.key).sort();
  assert.deepStrictEqual(keys, ['autoFanoutFloor', 'bandwidth', 'coalfaceMode', 'updateCheckDays', 'updateMode']);
  for (const s of CONFIG_SCHEMA) assert.ok(typeof s.help === 'string' && s.help.length > 0, `${s.key} has help`);
});

test('validateValue: enum accepts case-insensitively, rejects unknown', () => {
  const mode = CONFIG_SCHEMA.find((s) => s.key === 'coalfaceMode');
  assert.strictEqual(validateValue(mode, 'auto'), null);
  assert.strictEqual(validateValue(mode, 'ON'), null);
  assert.match(validateValue(mode, 'always'), /must be one of/);
  assert.match(validateValue(mode, 42), /must be one of/);
});

test('validateValue: int enforces bounds + integer-ness', () => {
  const bw = CONFIG_SCHEMA.find((s) => s.key === 'bandwidth');
  assert.strictEqual(validateValue(bw, 25), null);
  assert.strictEqual(validateValue(bw, 1), null);
  assert.strictEqual(validateValue(bw, 100), null);
  assert.match(validateValue(bw, 0), /must be >= 1/);
  assert.match(validateValue(bw, 101), /must be <= 100/);
  assert.match(validateValue(bw, 25.5), /must be an integer/);
  assert.match(validateValue(bw, '25'), /must be a finite number/);
  assert.match(validateValue(bw, NaN), /must be a finite number/);
});

test('validateConfig: the factory shape passes clean', () => {
  const errors = validateConfig({ coalfaceMode: 'auto', bandwidth: 25, autoFanoutFloor: 4, updateMode: 'ask', updateCheckDays: 14 });
  assert.deepStrictEqual(errors, []);
});

test('validateConfig: unknown key + bad values reported, never thrown', () => {
  const errors = validateConfig({ coalfaceMode: 'off', maxAnts: 100, autoFanoutFloor: 0 });
  assert.ok(errors.some((e) => e.includes("'maxAnts' not in schema")), 'unknown key reported');
  assert.ok(errors.some((e) => e.includes("'autoFanoutFloor'")), 'out-of-range reported');
});

test('validateConfig: a non-object config fails loud with one clear error', () => {
  assert.deepStrictEqual(validateConfig(null), ['config must be a JSON object']);
  assert.deepStrictEqual(validateConfig([1]), ['config must be a JSON object']);
});
