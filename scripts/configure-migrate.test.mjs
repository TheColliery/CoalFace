// 29ko: the legacy-config migration of scripts/configure.mjs deletes the legacy file on the strength of its first read. An edit made inside
// that window (after the read, before the delete) was in neither file. Ported from the reviewer's witness (READ-WINDOW CO-WRITER, the
// CoalFace code-reviewer, 24a0bdf3, 2026-11-20).
//
// It spawns the REAL scripts/configure.mjs from a temp project holding a LEGACY config. A preload wraps fs.renameSync: right after the
// rename that lands the NEW-home config (the window between the migration's read of the legacy file and its delete), it changes the
// legacy file. Leg A (the class): the legacy file must be KEPT and the exit must be non-zero. Leg B (the ordinary run): the migration
// writes the new home, removes the legacy file, and exits 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, '..');
const CONFIGURE = path.join(ROOM, 'scripts', 'configure.mjs');
const TIMEOUT_MS = 60000;
const LEGACY_BODY = '{"coalfaceMode":"auto","bandwidth":30}\n';

// The preload runs inside the configure child. It touches only the file CF_W_LEGACY names, and only after a rename into a path that is
// neither the legacy file nor a .bak (that rename is the new-home write).
const PRELOAD_SRC = [
  "import fs from 'node:fs';",
  'const legacy = process.env.CF_W_LEGACY;',
  'const mode = process.env.CF_W_MODE;',
  'const orig = fs.renameSync;',
  'let done = false;',
  'fs.renameSync = function patchedRename(from, to) {',
  '  const r = orig.apply(this, arguments);',
  "  if (!done && legacy && mode && String(to) !== legacy && !String(to).endsWith('.bak')) {",
  '    done = true;',
  "    const before = fs.readFileSync(legacy, 'utf8');",
  "    if (mode === 'append') fs.writeFileSync(legacy, before.replace(/}\\s*$/, ',\"updateMode\":\"off\"}\\n'));",
  "    else if (mode === 'same') fs.writeFileSync(legacy, before.replace('30', '70'));",
  "    fs.writeFileSync(legacy + '.witness-touched', mode);",
  '  }',
  '  return r;',
  '};',
  '',
].join('\n');

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-migrate-')));
  t.after(() => {
    // remove only the folder this test made, by name, after checking it resolves under the temp root
    const tmp = fs.realpathSync.native(os.tmpdir());
    const rel = path.relative(tmp, root);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.basename(root).startsWith('cf-migrate-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  const preload = path.join(root, 'preload.mjs');
  fs.writeFileSync(preload, PRELOAD_SRC);
  return { root, home, proj, preload };
}

function childEnv(home, extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_') || k.startsWith('CLAUDE_') || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  return { ...env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home, GIT_CEILING_DIRECTORIES: path.dirname(home), ...extra };
}

function runConfigure({ home, proj, preload }, legacy, mode) {
  const args = ['--max-old-space-size=256'];
  if (mode) args.push('--import', pathToFileURL(preload).href);
  args.push(CONFIGURE, '--bandwidth', '50');
  return spawnSync(process.execPath, args, {
    cwd: proj, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
    env: childEnv(home, mode ? { CF_W_LEGACY: legacy, CF_W_MODE: mode } : {}),
  });
}

const show = (r) => `exit=${r.status} signal=${r.signal} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`;

for (const [shape, rel] of [['root .coalface.json', '.coalface.json'], ['nested .claude/.coalface.json', path.join('.claude', '.coalface.json')]]) {
  for (const mode of ['append', 'same']) {
    test(`leg A (${shape}, ${mode} inside the window): the changed legacy config is kept and the run exits non-zero`, (t) => {
      const s = sandbox(t);
      const legacy = path.join(s.proj, rel);
      fs.mkdirSync(path.dirname(legacy), { recursive: true });
      fs.writeFileSync(legacy, LEGACY_BODY);
      const r = runConfigure(s, legacy, mode);
      assert.ok(fs.existsSync(legacy + '.witness-touched'), `the preload never reached the window: ${show(r)}`);
      assert.ok(fs.existsSync(legacy), `the legacy config was deleted after it changed inside the window (the edit is in neither file): ${show(r)}`);
      assert.notEqual(r.status, 0, `the run exited 0 after leaving a changed legacy config: ${show(r)}`);
    });
  }
}

test('leg B (root .coalface.json, no change): the migration writes the new home, removes the legacy config and exits 0', (t) => {
  const s = sandbox(t);
  const legacy = path.join(s.proj, '.coalface.json');
  fs.writeFileSync(legacy, LEGACY_BODY);
  const r = runConfigure(s, legacy, null);
  const home = path.join(s.proj, '.claude', 'coal', 'coalface.json');
  assert.equal(r.status, 0, show(r));
  assert.ok(fs.existsSync(home), `the new home was not written: ${show(r)}`);
  assert.equal(JSON.parse(fs.readFileSync(home, 'utf8')).bandwidth, 50, show(r));
  assert.ok(!fs.existsSync(legacy), `the legacy config was left behind on an ordinary run: ${show(r)}`);
});
