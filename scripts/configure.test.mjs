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
  for (const key of ['coalfaceMode', 'bandwidth', 'autoFanoutFloor', 'updateMode', 'updateCheckDays', 'maxLocalWorkers', 'admitCpuBusyMaxPct', 'admitMemFreeMinPct', 'language']) {
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

// THE BRIDGE, pinned as behaviour: `findProjectHit` (hooks/coalface-conductor.js) is
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

// CWK-120 ride-along (a), THE CONFIG-PARSE CLASS: a config body that parses as VALID
// JSON but is NOT an object (a top-level array here) used to pass `parsed || {}`
// unguarded (an array is truthy) -- every subsequent `cfg[key] = value` silently no-op'd
// on the array's non-index keys, and the write wrote the array straight back out with
// every --flag dropped, exit 0, no warning. Routed into the SAME malformed-config path
// as unparsable JSON: backed up, flagged non-zero, rebuilt from {}.
test('a top-level ARRAY config (valid JSON, wrong shape) is treated as malformed, not silently ignored', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(project, '.claude', 'coal'), { recursive: true });
  const target = path.join(project, '.claude', 'coal', 'coalface.json');
  fs.writeFileSync(target, '[1, 2, 3]');
  const r = run(['--bandwidth', '30'], { cwd: project, home });
  assert.equal(r.status, 1, 'a recovered-but-flagged run is still a partial failure the user must notice');
  assert.match(r.stderr, /existing config is malformed/);
  assert.equal(fs.readFileSync(target + '.bak', 'utf8'), '[1, 2, 3]', 'the backup must preserve the ORIGINAL bytes untouched');
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { bandwidth: 30 }, 'the write must rebuild from {} and apply the flag, never write the array back out');
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

// ---- CWK-125 (R14 item b): configure.mjs's own cwd was the RAW process.cwd(), while findProjectHit returns a
// path built from physical(startDir) (the `.native` spelling). legacyPaths.includes(readPath) is a STRING compare,
// so a cwd spelled as its Windows 8.3 alias (C:\Users\RUNNER~1\...) never matched, the legacy config was written
// back IN PLACE and never migrated: a real CLI defect that needs an aliased cwd, which a dev box with a short
// username never has (CoalBoard 5733c20 paid it as a CI red). Capability probe, never process.platform.
function shortAlias(dir) {
  try {
    const r = spawnSync('cmd.exe', ['/d', '/c', 'for %I in ("' + dir + '") do @echo %~sI'], { encoding: 'utf8', windowsVerbatimArguments: true, timeout: 20000 });
    const a = r.status === 0 ? String(r.stdout).trim() : '';
    return a && a.toLowerCase() !== dir.toLowerCase() && fs.existsSync(a) ? a : null;
  } catch { return null; }
}
test('configure CWK-125: cwd spelled as its 8.3 ALIAS -- a legacy root .coalface.json still MIGRATES (never rewritten in place)', (t) => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cfg-125-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'a-long-home-directory-name-cwk125');
  const proj = path.join(home, 'a-long-project-directory-name');
  fs.mkdirSync(proj, { recursive: true });
  const legacy = path.join(proj, '.coalface.json');
  fs.writeFileSync(legacy, JSON.stringify({ bandwidth: 10 }) + '\n');
  const alias = shortAlias(proj);
  if (!alias) { t.skip('this volume makes no 8.3 alias (capability probe)'); return; }
  const r = run(['--autoFanoutFloor', '8'], { cwd: alias, home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Migrated the project config/, 'the legacy read must be recognised as legacy under an aliased cwd: ' + r.stdout);
  assert.equal(fs.existsSync(legacy), false, 'the legacy file must be removed after the migration write');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'coal', 'coalface.json'), 'utf8')), { bandwidth: 10, autoFanoutFloor: 8 });
});
test('configure CWK-125: HOME spelled as its 8.3 ALIAS -- the walk stops at home, a foreign config above it is neither read nor rewritten', (t) => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cfg-125h-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'a-long-home-directory-name-cwk125');
  const proj = path.join(home, 'a-long-project-directory-name');
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(path.join(base, '.claude'), { recursive: true });
  const foreign = path.join(base, '.claude', '.coalface.json');
  const before = JSON.stringify({ language: 'foreign' });
  fs.writeFileSync(foreign, before);
  const alias = shortAlias(home);
  if (!alias) { t.skip('this volume makes no 8.3 alias (capability probe)'); return; }
  const r = run(['--updateMode', 'remind'], { cwd: proj, home: alias });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(foreign, 'utf8'), before, 'the foreign config above home must be left untouched');
  assert.ok(fs.existsSync(path.join(proj, '.claude', 'coal', 'coalface.json')), 'the write must land at the project own-dir default');
});

// 14a unit 1 (E2-4 class, S3): configure.mjs WRITES the project config at the path the walk found, or at the own-dir default. A link planted at that file, or at a directory
// above it under the level (a junction on Windows, a symlink on POSIX), made the write land outside the project. The write is now refused: nothing is written, nothing is removed,
// stderr carries one FAIL line naming the path, and the exit is non-zero. A file symlink needs a privilege some Windows boxes lack, so those legs probe by creating the link and
// skip visibly when it cannot be made; a junction needs none, and the type argument is ignored off Windows.
function e24Layout(t) {
  const { home, project } = sandbox();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-configure-outside-'));
  t.after(() => { for (const d of [home, project, outside]) fs.rmSync(d, { recursive: true, force: true }); });
  return { home, project, outside };
}
function tryLinkCfg(t, target, link, type) {
  try { fs.symlinkSync(target, link, type); return true; } catch { t.skip(`a ${type} link cannot be made here (capability probe)`); return false; }
}
function assertRefusedWrite(r, expectedFailPath, label) {
  assert.notEqual(r.status, 0, `${label}: the write was not refused (exit 0): ${r.stdout}`);
  const fail = r.stderr.split('\n').find((l) => l.startsWith('FAIL '));
  assert.ok(fail, `${label}: no FAIL line on stderr: ${r.stderr}`);
  assert.ok(fail.startsWith(`FAIL ${expectedFailPath}: `), `${label}: the FAIL line does not name ${expectedFailPath}: ${fail}`);
  assert.ok(fail.includes('resolves outside its folder'), `${label}: the reason is not stated: ${fail}`);
  assert.ok(!r.stderr.includes('    at '), `${label}: a raw stack trace reached the user: ${r.stderr}`);
}

test('E2-4 configure: the .claude directory is a link outside the project -> the write is REFUSED and nothing lands outside', (t) => {
  const { home, project, outside } = e24Layout(t);
  if (!tryLinkCfg(t, outside, path.join(project, '.claude'), 'junction')) return;
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json'), '.claude as a link');
  assert.deepEqual(fs.readdirSync(outside), [], 'a file or a folder was created outside the project');
});

test('E2-4 configure: the coal directory is a link outside the project -> the write is REFUSED and nothing lands outside', (t) => {
  const { home, project, outside } = e24Layout(t);
  fs.mkdirSync(path.join(project, '.claude'));
  if (!tryLinkCfg(t, outside, path.join(project, '.claude', 'coal'), 'junction')) return;
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json'), 'coal as a link');
  assert.deepEqual(fs.readdirSync(outside), [], 'a file was created outside the project');
});

test('E2-4 configure: a legacy config being MIGRATED through a linked .claude is refused whole -- the legacy file stays, nothing lands outside', (t) => {
  const { home, project, outside } = e24Layout(t);
  const legacy = path.join(project, '.coalface.json');
  fs.writeFileSync(legacy, JSON.stringify({ bandwidth: 10 }) + '\n');
  if (!tryLinkCfg(t, outside, path.join(project, '.claude'), 'junction')) return;
  const r = run(['--autoFanoutFloor', '8'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json'), 'the migration through a link');
  assert.deepEqual(fs.readdirSync(outside), [], 'a file was created outside the project');
  assert.deepEqual(JSON.parse(fs.readFileSync(legacy, 'utf8')), { bandwidth: 10 }, 'the legacy file was changed or removed although the write was refused');
});

test('E2-4 configure: the config found at a PARENT folder sits behind a link outside -> refused, and nothing lands outside', (t) => {
  const { home, project, outside } = e24Layout(t);
  const sub = path.join(project, 'sub');
  fs.mkdirSync(sub);
  fs.mkdirSync(path.join(outside, 'coal'));
  fs.writeFileSync(path.join(outside, 'coal', 'coalface.json'), JSON.stringify({ bandwidth: 10 }));
  if (!tryLinkCfg(t, outside, path.join(project, '.claude'), 'junction')) return;
  const r = run(['--bandwidth', '40'], { cwd: sub, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json'), 'a parent level link');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outside, 'coal', 'coalface.json'), 'utf8')), { bandwidth: 10 }, 'the file outside the project was rewritten');
});

test('E2-4 configure: the canonical config FILE is a symlink to a file outside -> the write is REFUSED and the outside file is untouched', (t) => {
  const { home, project, outside } = e24Layout(t);
  const target = path.join(outside, 'victim.json');
  fs.writeFileSync(target, JSON.stringify({ bandwidth: 10 }));
  fs.mkdirSync(path.join(project, '.claude', 'coal'), { recursive: true });
  if (!tryLinkCfg(t, target, path.join(project, '.claude', 'coal', 'coalface.json'), 'file')) return;
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json'), 'the canonical file as a link');
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { bandwidth: 10 }, 'the file outside the project was rewritten through the link');
});

test('E2-4 configure: the .bak target is a symlink to a file outside -> a malformed config is not backed up through it, and the outside file is untouched', (t) => {
  const { home, project, outside } = e24Layout(t);
  const target = path.join(outside, 'victim.txt');
  fs.writeFileSync(target, 'precious');
  const dir = path.join(project, '.claude', 'coal');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'coalface.json'), '{ not json');
  if (!tryLinkCfg(t, target, path.join(dir, 'coalface.json.bak'), 'file')) return;
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json.bak'), 'the .bak as a link');
  assert.equal(fs.readFileSync(target, 'utf8'), 'precious', 'the file outside the project was overwritten by the backup copy');
  assert.equal(fs.readFileSync(path.join(dir, 'coalface.json'), 'utf8'), '{ not json', 'the malformed config was rewritten although the run was refused');
});

test('E2-4 configure control: --global still writes the user-level file, and an ordinary project still writes inside itself', (t) => {
  const { home, project } = e24Layout(t);
  const g = run(['--global', '--updateMode', 'remind'], { cwd: project, home });
  assert.equal(g.status, 0, g.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude', '.coalface.json'), 'utf8')), { updateMode: 'remind' });
  const p = run(['--bandwidth', '40'], { cwd: project, home });
  assert.equal(p.status, 0, p.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, '.claude', 'coal', 'coalface.json'), 'utf8')), { bandwidth: 40 });
});

test('E2-4 configure: the root legacy position is a directory link outside the project -> refused by the READ check, nothing is created or removed', (t) => {
  const { home, project, outside } = e24Layout(t);
  fs.writeFileSync(path.join(outside, 'keep'), 'k');
  if (!tryLinkCfg(t, outside, path.join(project, '.coalface.json'), 'junction')) return;
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.coalface.json'), 'the legacy position as a link');
  assert.equal(fs.existsSync(path.join(project, '.claude')), false, 'a migration write was made although the found config was refused');
  assert.deepEqual(fs.readdirSync(outside), ['keep'], 'something was created or removed outside the project');
  assert.ok(fs.lstatSync(path.join(project, '.coalface.json')).isSymbolicLink(), 'the link itself was removed');
});

test('E2-4 configure: the .bak position is a directory link outside the project -> refused BEFORE any write, the malformed config is left as it was', (t) => {
  const { home, project, outside } = e24Layout(t);
  fs.writeFileSync(path.join(outside, 'keep'), 'k');
  const dir = path.join(project, '.claude', 'coal');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'coalface.json'), '{ not json');
  if (!tryLinkCfg(t, outside, path.join(dir, 'coalface.json.bak'), 'junction')) return;
  const r = run(['--bandwidth', '40'], { cwd: project, home });
  assertRefusedWrite(r, path.join(fs.realpathSync.native(project), '.claude', 'coal', 'coalface.json.bak'), 'the .bak position as a link');
  assert.equal(fs.readFileSync(path.join(dir, 'coalface.json'), 'utf8'), '{ not json', 'the malformed config was rewritten although the run was refused');
  assert.deepEqual(fs.readdirSync(outside), ['keep'], 'something was created outside the project');
});

// 16e R7 (T13): a legacy config found at a PARENT level of the folder configure runs in migrates at ITS OWN level. It used to be written back in place as a legacy file
// (the legacy test compared the found path against the legacy shapes of cwd only), so the migration the cwd-level case performs never happened one folder up.
test('a LEGACY .coalface.json found in a PARENT folder is migrated at the parent level, the legacy file removed, and nothing is created in the subfolder', (t) => {
  const { home, project } = sandbox();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); });
  const legacy = path.join(project, '.coalface.json');
  fs.writeFileSync(legacy, JSON.stringify({ bandwidth: 10 }) + '\n');
  const sub = path.join(project, 'sub');
  fs.mkdirSync(sub);
  const r = run(['--autoFanoutFloor', '8'], { cwd: sub, home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Migrated the project config/);
  assert.equal(fs.existsSync(legacy), false, 'the parent legacy file is removed after the migration write');
  const migrated = path.join(project, '.claude', 'coal', 'coalface.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(migrated, 'utf8')), { bandwidth: 10, autoFanoutFloor: 8 });
  assert.deepEqual(fs.readdirSync(sub), [], 'nothing is created in the subfolder');
});

// CWK2-042 (16f wave 2): the parent folder is made only after the chain is judged. A FILE named .claude is refused WHICHEVER refusal fires first: on Windows the up-front pin
// (containedWriteTarget) passes it through (lstat of a path under a file is ENOENT there) and the walk refuses it with its own sentence; on POSIX that lstat is ENOTDIR, the pin
// fails closed and refuses it with its 14a text (CI run 38949562405, ubuntu and macOS). So this test asserts the CLASS, never which refusal fired: exit 1, exactly one FAIL line
// that names the .claude target, no errno text and no stack, the file untouched, nothing created beside it. (The pin's text for this case says "resolves outside its folder (a link ...)",
// which is the wrong story for a plain file; that is a shipped-conductor wording question, returned separately.)
test('CWK2-042 configure: a FILE named .claude -> refused with exactly one FAIL line naming it, never a raw errno, the file untouched, nothing created beside it', () => {
  const { home, project } = sandbox();
  try {
    fs.writeFileSync(path.join(project, '.claude'), 'keep me');
    const r = run(['--bandwidth', '40'], { cwd: project, home });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const fails = r.stderr.split(/\r?\n/).filter((l) => l.startsWith('FAIL '));
    assert.equal(fails.length, 1, `expected exactly one FAIL line: ${r.stderr}`);
    assert.ok(fails[0].startsWith(`FAIL ${path.join(fs.realpathSync.native(project), '.claude')}`), `the FAIL line does not name the .claude target: ${fails[0]}`);
    assert.doesNotMatch(r.stderr, /Failed to write to config file|ENOTDIR|EISDIR|EEXIST|\n\s+at /);
    assert.equal(fs.readFileSync(path.join(project, '.claude'), 'utf8'), 'keep me');
    assert.deepEqual(fs.readdirSync(project), ['.claude'], 'something was created beside the file');
  } finally { for (const d of [home, project]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('CWK2-042 configure: the plain case and a missing parent inside the project still write (the walk makes the chain)', () => {
  const { home, project } = sandbox();
  try {
    const r = run(['--bandwidth', '40'], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, '.claude', 'coal', 'coalface.json'), 'utf8')), { bandwidth: 40 });
  } finally { for (const d of [home, project]) fs.rmSync(d, { recursive: true, force: true }); }
});
