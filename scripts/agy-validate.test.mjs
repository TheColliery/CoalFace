// The Antigravity route: the root plugin.json carries the marketplace fields, the root hooks.json is the one AG reads,
// the dist carries byte-equal copies of both and the logo, and agy's own validator reads the built plugin with no error
// and no missing-logo note. agy is probed, never decided by platform: where it is not on PATH the test skips VISIBLY.
// Divergence, named: there is no .antigravity-plugin/plugin.json. AG reads the root plugin.json (CoalHearth 84226de, and
// the probe in 29c), so a second manifest would be a file nothing reads.
// Strict mode cannot pass on this dist: plugin/ ships commands/ and hooks/hooks.json for the Claude Code route, and the AG
// validator names both as never loaded. So the test pins the warnings to exactly those two named entries and fails on any other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeAgy, validateAgyPlugin, agyEnv } from './lib/agy-probe.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'plugin');
const AGY_TIMEOUT_MS = 120000;
const NAMED_WARNING_FILES = ['commands', 'hooks/hooks.json'];
const MANIFEST_KEYS = ['name', 'displayName', 'description', 'version', 'logo', 'author'];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

test('the root AG manifest carries the six marketplace fields and the Claude Code version', () => {
  const ag = readJson(path.join(repo, 'plugin.json'));
  const claude = readJson(path.join(repo, '.claude-plugin', 'plugin.json'));
  for (const key of MANIFEST_KEYS) assert.ok(ag[key], `plugin.json has no ${key}`);
  assert.equal(typeof ag.author, 'string', 'AG reads author as a string');
  assert.equal(ag.version, claude.version, 'AG and Claude Code manifests disagree on version');
  assert.ok(fs.existsSync(path.join(repo, ag.logo)), `logo ${ag.logo} is not in the repo`);
});

test('the dist carries byte-equal copies of the root manifest, the root hooks file and the logo', () => {
  for (const rel of ['plugin.json', 'hooks.json', path.join('assets', 'logo.svg')]) {
    const src = fs.readFileSync(path.join(repo, rel));
    const copy = fs.readFileSync(path.join(dist, rel));
    assert.ok(src.equals(copy), `plugin/${rel} is not byte-equal to ${rel}`);
  }
});

test('agy validate: the built plugin has no error, no missing-logo note, and only the named warnings', (t) => {
  // agy writes .gemini/config under HOME, so the run gets a temp HOME, removed after.
  const home = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'coalface-agyval-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = agyEnv(home);
  // Skip ONLY when agy is absent; a probe that hangs or fails is a failure, not a skip.
  const probe = probeAgy({ timeoutMs: AGY_TIMEOUT_MS, env });
  if (probe.state === 'absent') { t.skip('agy not on PATH: AG plugin validation not run'); return; }
  assert.equal(probe.state, 'present', `agy probe failed (not a skip): ${probe.reason}`);

  const r = validateAgyPlugin({ pluginDir: dist, env, timeoutMs: AGY_TIMEOUT_MS });
  assert.equal(r.error, undefined, `agy plugin validate did not run: ${r.error && r.error.code}`);
  let report;
  try { report = JSON.parse(r.stdout); } catch (e) {
    assert.fail(`agy plugin validate printed no JSON report (exit ${r.status}): ${e.message}\n${r.stdout}\n${r.stderr}`);
  }

  const all = report.findings || [];
  assert.deepEqual(
    all.filter((f) => f.severity === 'error').map((f) => `${f.file}: ${f.message}`), [],
    'agy reports error entries on the built plugin',
  );
  assert.equal(all.some((f) => /no logo/.test(f.message)), false, 'agy still reports no logo');
  const warnings = all.filter((f) => f.severity === 'warning').map((f) => f.file).sort();
  assert.deepEqual(warnings, [...NAMED_WARNING_FILES].sort(), 'AG warnings differ from the named set');
});
