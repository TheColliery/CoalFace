// CoalFace — hermetic conductor case-set (hooks-safety.md §7).
// Every case spawns the REAL hook (hooks/coalface-conductor.js) as a child process with
// a sandboxed HOME/USERPROFILE/TEMP/TMP + emptied CLAUDE_CONFIG_DIR, so real machine
// state (the real ~/.claude/.coalface.json, a real update stamp) can never leak in.
// The cwd sandbox sits UNDER the sandbox home, so the project-config walk is contained
// by the stop-at-home rule the suite itself asserts (CoalBoard v1.5.1 lesson).
//
// Each case asserts the three observable surfaces: exit 0 on every path; stderr silent
// (SessionStart stdout is the one sanctioned channel, Phoenix #13); the expected state
// effect (directive text, stamp written, or nothing).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const HOOK = path.join(REPO, 'hooks', 'coalface-conductor.js');
const SESSION_START = JSON.stringify({ hook_event_name: 'SessionStart' });

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-home-'));
  const cwd = fs.mkdtempSync(path.join(home, 'cf-cwd-')); // UNDER home: the walk is contained
  return { home, cwd };
}
function clean(...dirs) {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}
function run(cwd, home, stdin = SESSION_START) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    // CLAUDE_CONFIG_DIR emptied: a real machine value would point config outside the
    // sandbox home (hooks-safety §7 poisoned-env isolation).
    env: { ...process.env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, CLAUDE_CONFIG_DIR: '' },
    input: stdin,
    encoding: 'utf8',
    timeout: 20000,
  });
}
function writeGlobalCfg(home, cfg) {
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', '.coalface.json'), JSON.stringify(cfg), 'utf8');
}
// A fresh sandbox home makes the self-update check "due" on the very first boot; cases
// about the DIRECTIVE mute it so their assertion stays about the mode path only (the
// update path has its own cases below).
function muteUpdate(home, extra = {}) {
  writeGlobalCfg(home, { updateMode: 'off', ...extra });
}
function stampPath(home) {
  return path.join(home, '.claude', '.coalface-update-check');
}
function assertGraceful(r) {
  assert.strictEqual(r.status, 0, 'hook must exit 0 on every path (Phoenix #4)');
  assert.strictEqual(r.stderr, '', 'hook must be silent on stderr (Phoenix #13)');
  assert.strictEqual(r.signal, null, 'hook must not be killed by a signal');
}

// ---------------------------------------------------------------------------
// Directive per mode
// ---------------------------------------------------------------------------

test('case 1: default (no config) -> auto directive with the default floor 4', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home); // isolate the directive from the first-boot update nudge
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, /\[CoalFace\] Fan-out discipline \(auto\)/);
    assert.match(r.stdout, />= 4 units/, 'default autoFanoutFloor 4 appears in the directive');
    assert.match(r.stdout, /\/coalface/);
  } finally { clean(home, cwd); }
});

test('case 2: coalfaceMode:on -> FORCED directive (scout every prompt)', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home, { coalfaceMode: 'on' });
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, /FORCED \(on\)/);
    assert.match(r.stdout, /Scout EVERY prompt/);
  } finally { clean(home, cwd); }
});

test('case 3: coalfaceMode:off -> fully silent (no directive)', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home, { coalfaceMode: 'off' });
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'off = silent SessionStart');
  } finally { clean(home, cwd); }
});

test('case 4: autoFanoutFloor honored in range (7), CLAMPED out of range (999 -> 4)', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home, { autoFanoutFloor: 7 });
    const r1 = run(cwd, home);
    assertGraceful(r1);
    assert.match(r1.stdout, />= 7 units/, 'in-range floor honored');
    muteUpdate(home, { autoFanoutFloor: 999 });
    const r2 = run(cwd, home);
    assertGraceful(r2);
    assert.match(r2.stdout, />= 4 units/, 'out-of-range floor clamps to the default 4');
  } finally { clean(home, cwd); }
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

test('case 5: garbage stdin / wrong event -> exit 0, fully silent', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home);
    for (const stdin of ['not json at all {{{', '', '[1,2,3]', JSON.stringify({ hook_event_name: 'PostToolUse' })]) {
      const r = run(cwd, home, stdin);
      assertGraceful(r);
      assert.strictEqual(r.stdout, '', `silent on ${JSON.stringify(stdin.slice(0, 20))}`);
    }
  } finally { clean(home, cwd); }
});

test('case 6: proto-pollution project config must NOT silence the directive', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home);
    // A poisoned PROJECT config: without the reviver guard, Object.assign would [[Set]]
    // "__proto__" -> the merged config INHERITS coalfaceMode:"off" -> silent conductor.
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"__proto__":{"coalfaceMode":"off"}}', 'utf8');
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, /\[CoalFace\] Fan-out discipline \(auto\)/, 'directive survives the poisoned config');
  } finally { clean(home, cwd); }
});

test('case 7: config walk STOPS at home — a .coalface.json above home is never read', () => {
  const { home, cwd } = sandbox();
  const marker = path.join(path.dirname(home), '.coalface.json'); // ABOVE the sandbox home
  const hadMarker = fs.existsSync(marker); // never clobber a real file if one exists
  try {
    muteUpdate(home);
    if (!hadMarker) fs.writeFileSync(marker, '{"coalfaceMode":"off"}', 'utf8');
    const r = run(cwd, home); // cwd is nested under home; an unstopped walk would find the marker
    assertGraceful(r);
    assert.match(r.stdout, /\[CoalFace\] Fan-out discipline \(auto\)/, 'above-home config ignored -> directive prints');
  } finally {
    if (!hadMarker) fs.rmSync(marker, { force: true });
    clean(home, cwd);
  }
});

// ---------------------------------------------------------------------------
// Self-update (kind-1) — stamp scheduler
// ---------------------------------------------------------------------------

test('case 8: update stamp-throttle -> 1st boot nudges + stamps, 2nd silent; fires even with the discipline off (orthogonal)', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'auto' }); // discipline off -> stdout is PURELY the update channel
    const r1 = run(cwd, home);
    assertGraceful(r1);
    assert.match(r1.stdout, /self-update due/, 'run #1 (first ever) is due -> nudges');
    assert.match(r1.stdout, /^\[CoalFace\] /, 'nudge carries the brand prefix even with no directive');
    assert.ok(fs.existsSync(stampPath(home)), 'crash-safe stamp written under home/.claude');
    const r2 = run(cwd, home);
    assertGraceful(r2);
    assert.strictEqual(r2.stdout, '', 'run #2 inside the window -> throttled silent');
  } finally { clean(home, cwd); }
});

test('case 9: updateMode:off -> no nudge AND nothing scheduled (no stamp)', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { updateMode: 'off' }); // mode stays auto -> directive only
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, /Fan-out discipline \(auto\)/);
    assert.doesNotMatch(r.stdout, /self-update due/);
    assert.strictEqual(fs.existsSync(stampPath(home)), false, 'off never writes a stamp');
  } finally { clean(home, cwd); }
});

test('case 10: updateCheckDays:0 is CLAMPED -> 2nd boot throttled, not re-nagged', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'auto', updateCheckDays: 0 });
    const r1 = run(cwd, home);
    const r2 = run(cwd, home);
    assertGraceful(r1);
    assertGraceful(r2);
    assert.match(r1.stdout, /self-update due/, 'run #1 (first ever) is due -> nudges + stamps');
    assert.strictEqual(r2.stdout, '', 'run #2 must be throttled: updateCheckDays:0 clamps to 14, the window holds');
  } finally { clean(home, cwd); }
});
