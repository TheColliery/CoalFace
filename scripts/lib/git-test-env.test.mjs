import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gitTestEnv } from './git-test-env.mjs';

test('gitTestEnv: strips every GIT_-prefixed key, whatever the name', () => {
  const saved = { ...process.env };
  try {
    process.env.GIT_DIR = '/somewhere/.git';
    process.env.GIT_INDEX_FILE = '/somewhere/.git/index';
    process.env.GIT_WORK_TREE = '/somewhere';
    process.env.GIT_SOME_FUTURE_KEY_NOBODY_HAS_WRITTEN_YET = 'x';
    const env = gitTestEnv('/ceiling');
    for (const key of Object.keys(env)) {
      assert.ok(!key.startsWith('GIT_') || ['GIT_CEILING_DIRECTORIES', 'GIT_EDITOR', 'GIT_TERMINAL_PROMPT'].includes(key) || key.startsWith('GIT_CONFIG_'),
        `${key} is a GIT_* key that survived the strip`);
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('GIT_') && !(key in saved)) delete process.env[key];
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
    fs.rmSync(root, { recursive: true, force: true });
  }
});
