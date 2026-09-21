// r31 UNIT 3 (CWK-023) -- configure.mjs is a plain CLI (node/runtime.md §1's own
// out-of-scope carve-out), so its top-level imports are static; the tests here spawn
// the REAL file as a child process (hermetic, per scripts-quality.md §2 / testing.md's
// "hook/CLI entry gets a hermetic spawn test") rather than importing its internals.
//
// SANDBOXING: configure.mjs never writes under its OWN repo (it only READS
// hooks/coalface-conductor.js + scripts/lib/config-schema.mjs from there) -- every
// write target is controlled by `cwd` (the project layer) or `HOME`/`USERPROFILE`
// (the `--global` layer). Every test below runs with BOTH sandboxed to a throwaway
// temp dir, so nothing here can ever touch this repo's own tree or the real user's
// home, regardless of Windows (USERPROFILE) or POSIX (HOME).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configurePath = path.join(repo, 'scripts', 'configure.mjs');

function run(args, { cwd, home }) {
  return spawnSync(process.execPath, [configurePath, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-configure-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-configure-proj-'));
  return { home, project };
}

test('--help lists every schema key and exits 0, no write attempted', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--help'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  for (const key of ['coalfaceMode', 'bandwidth', 'autoFanoutFloor', 'updateMode', 'updateCheckDays', 'maxLocalWorkers', 'language']) {
    assert.match(r.stdout, new RegExp(`--${key}\\b`), `--help must list --${key}`);
  }
  assert.match(r.stdout, /--global\b/);
  assert.deepEqual(fs.readdirSync(project), [], '--help must not create anything');
});

test('a NEW project with no agent dir yet writes to .claude/coal/coalface.json (the Claude-Code default)', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  const written = path.join(project, '.claude', 'coal', 'coalface.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(written, 'utf8')), { bandwidth: 40 });
});

test('a project that already has .agents (never .claude) writes there instead -- no foreign .claude/ planted', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(project, '.agents'));
  const r = run(['--updateMode', 'auto'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, '.agents', 'coal', 'coalface.json'), 'utf8')), { updateMode: 'auto' });
  assert.equal(fs.existsSync(path.join(project, '.claude')), false, 'must NOT plant a .claude/ this project never had');
});

// THE BRIDGE, pinned as behaviour: `findProjectCfg` (hooks/coalface-conductor.js) is
// the read path this test proves is actually reached -- a legacy root `.coalface.json`
// is found via that walk, its value survives the merge, and the write migrates it
// (move-on-CONFIG-WRITE-only) rather than leaving two config files disagreeing.
test('a LEGACY root .coalface.json is read, merged, and MIGRATED to the new-shape path, and the legacy file is removed', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const legacy = path.join(project, '.coalface.json');
  fs.writeFileSync(legacy, JSON.stringify({ bandwidth: 10 }) + '\n');
  const r = run(['--autoFanoutFloor', '8'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Migrated the project config/);
  assert.equal(fs.existsSync(legacy), false, 'the legacy file must be removed after a successful migration write');
  const migrated = path.join(project, '.claude', 'coal', 'coalface.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(migrated, 'utf8')), { bandwidth: 10, autoFanoutFloor: 8 });
});

// UMB-133: the nested legacy `<dir>/.claude/.coalface.json` is now a candidate the hook
// READS, so the write path must not quietly keep editing it in place -- it migrates on
// the write exactly like the root legacy (move-on-CONFIG-WRITE-only), into the first
// agent dir the project already has (here `.claude`, which the legacy file itself created).
test('a NESTED legacy .claude/.coalface.json is read, merged, and MIGRATED to .claude/coal/coalface.json, and the legacy file is removed', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const legacy = path.join(project, '.claude', '.coalface.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({ bandwidth: 10 }) + '\n');
  const r = run(['--autoFanoutFloor', '8'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Migrated the project config/);
  assert.equal(fs.existsSync(legacy), false, 'the nested legacy file must be removed after a successful migration write');
  const migrated = path.join(project, '.claude', 'coal', 'coalface.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(migrated, 'utf8')), { bandwidth: 10, autoFanoutFloor: 8 });
});

test('--global writes ~/.claude/.coalface.json (never the project layer), and every key including language is settable', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--global', '--language', 'th'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  const globalPath = path.join(home, '.claude', '.coalface.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(globalPath, 'utf8')), { language: 'th' });
  assert.deepEqual(fs.readdirSync(project), [], '--global must never touch the project layer');
});

test('an unrecognized flag FAILs (exit 1), prints usage, and writes nothing', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--nonsense', 'x'], { cwd: project, home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unrecognized option '--nonsense'/);
  assert.match(r.stdout, /Usage: node scripts\/configure\.mjs/);
  assert.deepEqual(fs.readdirSync(project), []);
});

test('an out-of-range int value FAILs through the SAME validateValue() verify.mjs uses -- the CLI parser cannot drift from the JSON validator', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--bandwidth', '101'], { cwd: project, home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /bandwidth must be <= 100/);
});

// RED-FIRST-SHAPED: this asserts the Number(), not parseInt(), choice named in the
// file header -- a garbage tail must be rejected outright, never silently truncated
// to the leading digits. parseInt('50abc', 10) would have returned 50 and passed.
test('a garbage-tail numeric value ("50abc") is REJECTED outright, never truncated', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--autoFanoutFloor', '50abc'], { cwd: project, home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /autoFanoutFloor must be a finite number/);
});

test('an invalid enum value FAILs, naming every legal choice', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const r = run(['--language', 'klingon'], { cwd: project, home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /language must be one of: auto, th, en, ja, zh, es/);
});

test('a MALFORMED existing config is backed up (.bak, original bytes preserved) and overwritten, flagged non-zero', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(project, '.claude', 'coal'), { recursive: true });
  const target = path.join(project, '.claude', 'coal', 'coalface.json');
  fs.writeFileSync(target, '{ not json');
  const r = run(['--bandwidth', '30'], { cwd: project, home });
  assert.equal(r.status, 1, 'a recovered-but-flagged run is still a partial failure the user must notice');
  assert.match(r.stderr, /existing config is malformed/);
  assert.equal(fs.readFileSync(target + '.bak', 'utf8'), '{ not json', 'the backup must preserve the ORIGINAL bytes untouched');
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { bandwidth: 30 });
});

test('a project config with inline comments (JSONC) parses, and the write warns that comments were stripped', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(project, '.claude', 'coal'), { recursive: true });
  const target = path.join(project, '.claude', 'coal', 'coalface.json');
  fs.writeFileSync(target, '{\n  // a comment\n  "bandwidth": 5\n}\n');
  const r = run(['--autoFanoutFloor', '6'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /inline comments were stripped/, `console.warn goes to stderr, got stdout:\n${r.stdout}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { bandwidth: 5, autoFanoutFloor: 6 });
});

// PROTO-POLLUTION GUARD, pinned as a behaviour test rather than trusted from
// jsonc.mjs's own unit tests alone -- this proves configure.mjs's OWN read path
// actually calls the guarded parseJsonc, not a bare JSON.parse.
test('a __proto__-poisoned existing config is parsed with the key dropped, never pollutes', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(project, '.claude', 'coal'), { recursive: true });
  const target = path.join(project, '.claude', 'coal', 'coalface.json');
  fs.writeFileSync(target, '{ "__proto__": { "polluted": true }, "bandwidth": 15 }');
  const r = run(['--autoFanoutFloor', '9'], { cwd: project, home });
  assert.equal(r.status, 0, r.stderr);
  const written = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.deepEqual(written, { bandwidth: 15, autoFanoutFloor: 9 });
  assert.equal(Object.prototype.polluted, undefined, 'Object.prototype must be untouched by this process');
});
