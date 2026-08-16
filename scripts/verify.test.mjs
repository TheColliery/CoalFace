import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mkTmpRepoCopy() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coalface-verify-test-'));
  for (const name of fs.readdirSync(repo)) {
    if (name === '.git') continue;
    // board #40: dist-claude-ai/ is a gitignored, CI-generated build artifact that
    // build-claude-ai-zips.test.mjs writes + removes at the repo root while node:test
    // runs test FILES in parallel by default -- copying it here raced that other
    // test's own rmSync, an intermittent ENOENT with no relation to this gate at all.
    // Excluded the same way .git already is: it is never part of what verify.mjs checks.
    if (name === 'dist-claude-ai') continue;
    fs.cpSync(path.join(repo, name), path.join(tmp, name), { recursive: true });
  }
  return tmp;
}

function runVerify(tmp) {
  return spawnSync(process.execPath, [path.join(tmp, 'scripts', 'verify.mjs')], { encoding: 'utf8' });
}

// board #64: verify.mjs's DESC_CAP gate walked skill/command frontmatter only —
// .claude-plugin/plugin.json's own description field was unchecked. This pins
// the fix: a real over-cap value must FAIL the gate, a clean one must PASS.
test('verify.mjs negative path: an over-cap .claude-plugin/plugin.json description FAILs the gate', () => {
  const tmp = mkTmpRepoCopy();
  try {
    const clean = runVerify(tmp);
    assert.equal(clean.status, 0, `pristine copy must PASS, got:\n${clean.stdout}${clean.stderr}`);

    const pjPath = path.join(tmp, '.claude-plugin', 'plugin.json');
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    pj.description = 'x'.repeat(1025);
    fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n', 'utf8');

    const over = runVerify(tmp);
    assert.equal(over.status, 1, 'a plugin.json description over 1024 chars must FAIL with exit 1');
    assert.match(over.stdout, /\.claude-plugin\/plugin\.json: description 1025 chars exceeds the 1024-char cap/,
      'the FAIL line names the file, the exact length, and the cap');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
