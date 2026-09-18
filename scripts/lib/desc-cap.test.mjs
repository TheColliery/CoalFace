// Unit tests for scripts/lib/desc-cap.mjs — the skill-listing description-length
// gate (shared by verify.mjs and scripts/build-claude-ai-zips.mjs, board #40).
// Zero-dep (node:test + built-ins), per scripts-quality.md section 2.

import { test } from 'node:test';
import assert from 'node:assert';
import { frontmatterField, descriptionCapCheck, DESC_CAP } from './desc-cap.mjs';

test('bare single-line description parses', () => {
  const text = '---\nname: x\ndescription: hello world\n---\nbody';
  assert.strictEqual(frontmatterField(text, 'description'), 'hello world');
});

test('quoted single-line description strips the quotes', () => {
  const text = '---\nname: x\ndescription: "hello, world"\n---\nbody';
  assert.strictEqual(frontmatterField(text, 'description'), 'hello, world');
});

test('block-scalar (>-) description joins indented lines with single spaces', () => {
  const text = '---\nname: x\ndescription: >-\n  line one\n  line two\n---\nbody';
  assert.strictEqual(frontmatterField(text, 'description'), 'line one line two');
});

test('missing frontmatter block or missing key returns null', () => {
  assert.strictEqual(frontmatterField('no frontmatter here', 'description'), null);
  assert.strictEqual(frontmatterField('---\nname: x\n---\nbody', 'description'), null);
});

test('description at the cap passes (boundary, not over)', () => {
  const text = `---\nname: x\ndescription: ${'a'.repeat(DESC_CAP)}\n---\nbody`;
  const r = descriptionCapCheck(text);
  assert.strictEqual(r.len, DESC_CAP);
  assert.strictEqual(r.over, false);
});

test('description over the cap fails — the negative-path case', () => {
  const text = `---\nname: x\ndescription: ${'a'.repeat(DESC_CAP + 1)}\n---\nbody`;
  const r = descriptionCapCheck(text);
  assert.strictEqual(r.len, DESC_CAP + 1);
  assert.strictEqual(r.over, true);
});

test('description + when_to_use combine toward the cap', () => {
  const text = `---\nname: x\ndescription: ${'a'.repeat(600)}\nwhen_to_use: ${'b'.repeat(500)}\n---\nbody`;
  const r = descriptionCapCheck(text);
  assert.strictEqual(r.len, 1100);
  assert.strictEqual(r.over, true);
});
