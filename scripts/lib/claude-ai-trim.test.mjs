import { test } from 'node:test';
import assert from 'node:assert';
import { trimDescription, CLAUDE_AI_DESC_CAP } from './claude-ai-trim.mjs';

test('CLAUDE_AI_DESC_CAP is 200 (the platform constraint this exists to satisfy)', () => {
  assert.strictEqual(CLAUDE_AI_DESC_CAP, 200);
});

test('a description already under the cap is returned unchanged', () => {
  const d = 'Short description.';
  assert.strictEqual(trimDescription(d), d);
});

test('a description exactly at the cap is returned unchanged (boundary, not over)', () => {
  const d = 'x'.repeat(200);
  assert.strictEqual(trimDescription(d), d);
  assert.strictEqual(trimDescription(d).length, 200);
});

test('a description one char over the cap is trimmed and never exceeds it', () => {
  const d = 'word '.repeat(50); // 250 chars, always word-boundary-safe
  const out = trimDescription(d);
  assert.ok(out.length <= 200, `trimmed length ${out.length} must be <= 200`);
  assert.ok(out.endsWith('...'), 'trimmed output carries the ellipsis');
});

test('trim cuts at the last whitespace boundary, never mid-word', () => {
  const d = 'a'.repeat(150) + ' ' + 'b'.repeat(100); // 251 chars total
  const out = trimDescription(d);
  const withoutEllipsis = out.slice(0, -3);
  assert.ok(!withoutEllipsis.includes('b'), 'the cut lands before the second word, never splitting it');
});

test('deterministic: the same input always produces the same output', () => {
  const d = 'x'.repeat(300);
  assert.strictEqual(trimDescription(d), trimDescription(d));
});

test('the real CoalFace SKILL.md description trims to <=200 and stays non-empty', () => {
  const real = 'Fan-out discipline for swarm work. When a task decomposes into many units (a bulk refactor, a repo-wide sweep, a corpus batch), CoalFace runs it as a disciplined factory: mandatory SCOUT surveys the worksite, deterministic PARTITION merges overlapping/tiny spots, workers return anchor-edit orders as TEXT (propose-not-execute), QC checks scope+spec at collection, main = SINGLE WRITER (pre-swarm snapshot + domain gate), RECEIPT shows tokens-vs-solo. Wallet caps DOLLAR cost at ~solo via cheap tiers (raw tokens run HIGHER — fan-out ×N the per-sub baseline), not raw tokens. Modes: coalfaceMode auto (default, rides the contract at/above autoFanoutFloor units) | on (scout every prompt) | off. Manual "/coalface" or "swarm this" convenes it in any mode except off. Cross-agent (native subagent tool; no fan-out → sequential-pipeline degrade). Disciplines fan-outs that would happen anyway — does not make models smarter or guarantee correctness. Zero-dependency, offline, no API keys.';
  assert.ok(real.length > 200, 'fixture must actually exceed the cap to test trimming');
  const out = trimDescription(real);
  assert.ok(out.length <= 200);
  assert.ok(out.length > 0);
});
