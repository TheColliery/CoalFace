import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gitTestEnv, removeTree } from './git-env.mjs';

test('gitTestEnv: strips every GIT_-prefixed key, whatever the name', () => {
  const saved = { ...process.env };
  try {
    process.env.GIT_DIR = '/somewhere/.git';
    process.env.GIT_INDEX_FILE = '/somewhere/.git/index';
    process.env.GIT_WORK_TREE = '/somewhere';
    process.env.GIT_SOME_FUTURE_KEY_NOBODY_HAS_WRITTEN_YET = 'x';
    process.env.git_lowercase_probe_key = 'x'; // 16f item 7: Windows keeps the spelling and git reads the key in any case
    const env = gitTestEnv('/ceiling');
    for (const key of Object.keys(env)) {
      assert.ok(!/^GIT_/i.test(key) || ['GIT_CEILING_DIRECTORIES', 'GIT_EDITOR', 'GIT_TERMINAL_PROMPT'].includes(key) || key.startsWith('GIT_CONFIG_'),
        `${key} is a GIT_* key that survived the strip`);
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (/^GIT_/i.test(key) && !(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
});

test('gitTestEnv: sets GIT_CEILING_DIRECTORIES to the given ceiling, and only that', () => {
  const env = gitTestEnv('/tmp/some-parent');
  assert.equal(env.GIT_CEILING_DIRECTORIES, '/tmp/some-parent');
});

// A fixture git must never open a window or wait on a prompt: with a signing global config a bare `git tag` becomes an annotated
// tag, git starts the system editor (Notepad on this box) and the spawn blocks until someone closes it. GIT_EDITOR=false makes any
// git that wants an editor fail instead; GIT_TERMINAL_PROMPT=0 does the same for a credential prompt.
test('gitTestEnv: a git that wants an editor or a prompt FAILS instead of waiting', () => {
  const saved = { ...process.env };
  try {
    process.env.GIT_EDITOR = 'notepad';
    const env = gitTestEnv('/ceiling');
    assert.equal(env.GIT_EDITOR, 'false');
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  } finally {
    if (saved.GIT_EDITOR === undefined) delete process.env.GIT_EDITOR; else process.env.GIT_EDITOR = saved.GIT_EDITOR;
  }
});

test('gitTestEnv: non-GIT_ keys pass through unchanged (a plain copy, not a wipe)', () => {
  const saved = process.env.COALFACE_GITENV_TEST_PROBE;
  try {
    process.env.COALFACE_GITENV_TEST_PROBE = 'kept';
    const env = gitTestEnv('/ceiling');
    assert.equal(env.COALFACE_GITENV_TEST_PROBE, 'kept');
  } finally {
    if (saved === undefined) delete process.env.COALFACE_GITENV_TEST_PROBE;
    else process.env.COALFACE_GITENV_TEST_PROBE = saved;
  }
});

test('gitTestEnv: mutating the returned object never touches process.env (a real copy)', () => {
  const before = process.env.GIT_DIR;
  const env = gitTestEnv('/ceiling');
  env.GIT_DIR = '/poisoned';
  assert.equal(process.env.GIT_DIR, before);
});

// 05a F2: a fixture git must not SIGN either. The operator's global config can carry commit.gpgsign=true and tag.gpgsign=true;
// a fixture commit then waits on the signer (a passphrase prompt, a locked agent) and uses the operator's live key. The witness
// plants a hostile global (sandbox HOME/USERPROFILE/XDG, never the real one) whose gpg.program sleeps, and caps the call.
test('gitTestEnv: a fixture commit and tag do not wait on a signer, even when the global config demands one (05a F2)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-f2-'));
  const saved = { ...process.env };
  try {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())), 'the sandbox sits under the temp root');
    const home = path.join(root, 'home');
    const repo = path.join(root, 'repo');
    fs.mkdirSync(home);
    fs.mkdirSync(repo);
    // gpg.program is ONE executable path (git does not shell-split it), so the sleeper is a #!/bin/sh script
    const sleeper = path.join(root, 'sleeper.sh').split(path.sep).join('/');
    fs.writeFileSync(path.join(root, 'sleeper.sh'), '#!/bin/sh\nsleep 20\n', { mode: 0o755 });
    fs.writeFileSync(path.join(home, '.gitconfig'),
      ['[commit]', '\tgpgsign = true', '[tag]', '\tgpgsign = true', '[gpg]', '\tformat = openpgp', '\tprogram = ' + sleeper, ''].join('\n'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.XDG_CONFIG_HOME = path.join(home, 'xdg');
    const run = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 8000, killSignal: 'SIGKILL', env: gitTestEnv(root) });
    assert.equal(run(['init', '-q', '.']).status, 0);
    for (const kv of [['user.email', 'f2@test.invalid'], ['user.name', 'f2']]) assert.equal(run(['config', kv[0], kv[1]]).status, 0);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    assert.equal(run(['add', '-A']).status, 0);
    const c = run(['commit', '-q', '-m', 'fixture']);
    assert.equal(c.status, 0, 'commit must not wait on the signer: ' + (c.error ? c.error.code : '') + c.stderr);
    const g = run(['tag', '-m', 'x', 'v0.0.1']);
    assert.equal(g.status, 0, 'tag must not wait on the signer: ' + (g.error ? g.error.code : '') + g.stderr);
  } finally {
    for (const k of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    removeTree(root); // 16e: a killed git launcher leaves the real git (and the signer) holding the project; see the removeTree tests below
  }
});

// ---------------------------------------------------------------------------
// 16e item 2 (CWK-041, the EBUSY class; the cure is CoalWash's removeTree, v1.12.4). Windows will not remove a directory a live process holds as its cwd. When spawnSync kills
// Git for Windows' launcher (cmd/git.exe) at its clock, the real git.exe (and a gpg.program it started) lives on inside the fixture project, and the teardown rmSync fails with
// EPERM/EBUSY, masking the assertion that explains the kill. Measured on this box (scratchpad/16e/witness-launcher.out, 3 of 3): launcher first on PATH, the f2 scenario above with
// its guard removed, commit killed at 3 s, plain rmSync EPERM after ~20 ms, a loop of fresh calls clears it at 9.3-9.4 s; with the real git first on PATH (the box's own order,
// witness.out) plain rmSync removed it in under 30 ms, 3 of 3, so the class shows only where PATH finds the launcher, as on CI's windows-latest.
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';

// A child that holds `dir` as its cwd for `holdMs`; resolves once it says so.
// 16f item 3 (E1 t133 finding 5): the child sees a sandbox for HOME, USERPROFILE and the temp folders, never the operator's own.
function holdCwd(dir, holdMs, t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-rt-home-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const env = { ...process.env, HOME: sandbox, USERPROFILE: sandbox, TEMP: sandbox, TMP: sandbox, TMPDIR: sandbox };
  const child = spawn(process.execPath, ['-e', `process.stdout.write('ready'); setTimeout(() => {}, ${holdMs});`], { cwd: dir, env, stdio: ['ignore', 'pipe', 'ignore'] });
  const closed = new Promise((resolve) => child.on('close', resolve));
  const ready = new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
  return { child, ready, closed };
}

// 16f item 1 (E1 t133 finding 1): does THIS volume refuse to remove a directory a live process holds as its cwd? Windows does; a POSIX volume lets it go. The retry leg below
// proves nothing where a plain rmSync would also pass, so it asks first and skips VISIBLY, alone in its own test.
async function volumeRefusesHeldDir(t) {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-rt-probe-'));
  t.after(() => fs.rmSync(probe, { recursive: true, force: true }));
  const h = holdCwd(probe, 1500, t);
  await h.ready;
  let refused = false;
  try { fs.rmSync(probe, { recursive: true, force: true }); } catch { refused = true; }
  await h.closed;
  return refused;
}

test('removeTree removes a temp project while a child process still holds it as its cwd', async (t) => {
  if (!(await volumeRefusesHeldDir(t))) { t.skip('this volume removes a directory a live process holds as its cwd, so a plain rmSync would also pass this leg (capability probe; Windows refuses)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-rt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = holdCwd(dir, 2000, t);
  await h.ready;
  removeTree(dir);
  assert.equal(fs.existsSync(dir), false, 'the held project is removed once the holder exits');
  await h.closed;
});

test('the instrument: a plain rmSync refuses the same held directory (skipped where the volume lets a held directory go)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-rt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = holdCwd(dir, 1500, t);
  await h.ready;
  let code = null;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { code = e && e.code; }
  await h.closed;
  if (code === null) { t.skip('this volume removed a directory a live process holds as its cwd (capability probe; Windows refuses)'); return; }
  assert.ok(['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(code), `plain rmSync failed with ${code}`);
});

test('removeTree gives up at its budget with the hold error, so a real leak stays loud (skipped where nothing holds)', async (t) => {
  if (!(await volumeRefusesHeldDir(t))) { t.skip('this volume removes a held directory at once (capability probe; Windows refuses)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-rt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = holdCwd(dir, 3000, t);
  await h.ready;
  let code = null;
  try { removeTree(dir, { budgetMs: 400, pollMs: 50 }); } catch (e) { code = e && e.code; }
  await h.closed;
  assert.ok(['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(code), `expected the hold error at the budget, got ${code}`);
});

// No wall-clock bound (testing.md, Determinism): fs.rmSync is replaced by a counting stub, so the retry behaviour is read from the number of calls, never from elapsed time.
function stubRmSync(t, impl) {
  const real = fs.rmSync;
  const calls = { n: 0 };
  fs.rmSync = (...a) => { calls.n += 1; return impl(calls.n, ...a); };
  t.after(() => { fs.rmSync = real; });
  return calls;
}
const errWith = (code) => Object.assign(new Error(code), { code });

test('removeTree throws a non-hold error at once: one rmSync call, no retry', (t) => {
  const calls = stubRmSync(t, () => { throw errWith('EACCES'); });
  assert.throws(() => removeTree('x', { budgetMs: 60000, pollMs: 1 }), (e) => e && e.code === 'EACCES');
  assert.strictEqual(calls.n, 1);
});

test('removeTree retries a hold error with fresh calls until the removal works', (t) => {
  const calls = stubRmSync(t, (n) => { if (n < 3) throw errWith('EPERM'); });
  removeTree('x', { budgetMs: 60000, pollMs: 1 });
  assert.strictEqual(calls.n, 3, 'two refusals, then the third call removes');
});

// 16e R2 (T5, T14): Windows keeps the spelling an env key was set with and git reads it case-insensitively, so a `Git_Dir` slips a case-sensitive `GIT_` strip.
test('gitTestEnv: strips a GIT_ key whatever its letter case (Windows keeps the spelling)', () => {
  const saved = { ...process.env };
  try {
    process.env.Git_Dir = '/somewhere/.git';
    process.env.git_index_file = '/somewhere/.git/index';
    const env = gitTestEnv('/ceiling');
    const own = ['GIT_CEILING_DIRECTORIES', 'GIT_EDITOR', 'GIT_TERMINAL_PROMPT'];
    for (const key of Object.keys(env)) {
      assert.ok(!/^git_/i.test(key) || own.includes(key) || key.startsWith('GIT_CONFIG_'), `${key} is a GIT_* key (any case) that survived the strip`);
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (/^git_/i.test(key) && !(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
});
