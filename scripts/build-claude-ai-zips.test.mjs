import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'scripts', 'build-claude-ai-zips.mjs');

// Stage a self-contained fake repo under a fresh tmpdir: the script + its two libs +
// plugin/skills. The script derives its OWN repo root from `import.meta.url`, so once
// it is copied to <tmp>/scripts/build-claude-ai-zips.mjs it operates entirely inside
// <tmp> — it never reads or writes anything under the real repo root. Returns the tmp
// root; caller owns cleanup (board #40 fixback F5: the prior version of test 1 ran the
// real script against the real repo root and raced a sibling test's own repo-root scan).
function stageFakeRepo() {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cf-claude-ai-'));
  fs.mkdirSync(path.join(tmp, 'scripts', 'lib'), { recursive: true });
  fs.cpSync(script, path.join(tmp, 'scripts', 'build-claude-ai-zips.mjs'));
  fs.cpSync(path.join(repo, 'scripts', 'lib', 'desc-cap.mjs'), path.join(tmp, 'scripts', 'lib', 'desc-cap.mjs'));
  fs.cpSync(path.join(repo, 'scripts', 'lib', 'claude-ai-trim.mjs'), path.join(tmp, 'scripts', 'lib', 'claude-ai-trim.mjs'));
  return tmp;
}

test('build-claude-ai-zips: stages every plugin skill with a trimmed, valid description', () => {
  const tmp = stageFakeRepo();
  try {
    fs.cpSync(path.join(repo, 'plugin', 'skills'), path.join(tmp, 'plugin', 'skills'), { recursive: true });
    const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'build-claude-ai-zips.mjs')], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /^Done: \d+\/\d+ skill\(s\) staged/m, 'summary line present');
    assert.doesNotMatch(r.stdout, /FAIL/, 'no per-skill failures');

    const outDir = path.join(tmp, 'dist-claude-ai');
    assert.ok(fs.existsSync(outDir), 'dist-claude-ai/ was created inside the tmp repo');
    const staged = fs.readdirSync(outDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const pluginSkillCount = fs.readdirSync(path.join(repo, 'plugin', 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
    assert.strictEqual(staged.length, pluginSkillCount, 'one staged dir per plugin skill, none missing/extra');
    assert.strictEqual(staged.length, 1, 'this room ships exactly one skill (coalface)');

    for (const s of staged) {
      const skillMd = path.join(outDir, s.name, 'SKILL.md');
      assert.ok(fs.existsSync(skillMd), `${s.name}/SKILL.md exists in the staged copy`);
      const text = fs.readFileSync(skillMd, 'utf8');
      const m = text.match(/^description:\s*"((?:[^"\\]|\\.)*)"/m);
      assert.ok(m, `${s.name}: description rewritten as a single-line quoted value`);
      const unescaped = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      assert.ok(unescaped.length <= 200, `${s.name}: staged description (${unescaped.length} chars) must be <= 200`);
      assert.ok(unescaped.length > 0, `${s.name}: staged description is non-empty`);
    }

    // The plugin/ SOURCE is never touched by this build — only the staged copy. Reads
    // this room's real plugin/skills (read-only, never the live repo's dist-claude-ai).
    const sourceSkillMd = path.join(repo, 'plugin', 'skills', 'coalface', 'SKILL.md');
    const sourceText = fs.readFileSync(sourceSkillMd, 'utf8');
    assert.ok(sourceText.includes('description: >-'), 'plugin/ source SKILL.md frontmatter shape is untouched (block scalar, not rewritten to a quoted line)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('build-claude-ai-zips: fails loud when plugin/ has not been built', () => {
  const tmp = stageFakeRepo();
  try {
    // No plugin/ dir at all under tmp.
    const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'build-claude-ai-zips.mjs')], { encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0, 'exits non-zero when plugin/skills is missing');
    assert.match(r.stderr, /does not exist/, 'names the missing dist as the reason');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
