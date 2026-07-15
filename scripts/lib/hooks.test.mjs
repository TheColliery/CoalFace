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
  // A RUN-UNIQUE parent (base) holds the above-home marker, so the test never
  // touches the SHARED tmpdir root — the old check-then-write there was a TOCTOU
  // race between parallel runs and a clobber hazard for any real file
  // (CodeQL js/file-system-race; the CoalHearth stop-at-home test's shape).
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-above-'));
  const home = path.join(base, 'h');
  const cwd = path.join(home, 'proj');
  fs.mkdirSync(cwd, { recursive: true });
  try {
    muteUpdate(home);
    fs.writeFileSync(path.join(base, '.coalface.json'), '{"coalfaceMode":"off"}', 'utf8'); // ABOVE home, inside the unique base
    const r = run(cwd, home); // cwd is nested under home; an unstopped walk would find the marker
    assertGraceful(r);
    assert.match(r.stdout, /\[CoalFace\] Fan-out discipline \(auto\)/, 'above-home config ignored -> directive prints');
  } finally { clean(base); }
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

// ---------------------------------------------------------------------------
// Antigravity adapter (hooks/ag-conductor.js) — once-per-session PreInvocation
// ---------------------------------------------------------------------------
// Same hermetic discipline: spawn the REAL adapter with AG-shaped fixture stdin.
// AG's PreInvocation fires per MODEL CALL, so the load-bearing behavior is the
// once-per-session tmp-marker throttle; the sandbox therefore pins TMPDIR too
// (os.tmpdir() reads TEMP/TMP on Windows but TMPDIR on POSIX — the marker must
// land in the sandbox on every CI runner).

const AG_HOOK = path.join(REPO, 'hooks', 'ag-conductor.js');
const agEvent = (extra = {}) => JSON.stringify({ hook_event_name: 'PreInvocation', ...extra });

function agSandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-ag-home-'));
  const cwd = fs.mkdtempSync(path.join(home, 'cf-cwd-')); // UNDER home: the config walk is contained
  const tmp = fs.mkdtempSync(path.join(home, 'cf-tmp-')); // dedicated marker dir: count asserts are exact
  return { home, cwd, tmp };
}
function agRun(s, stdin, tmpOverride) {
  const tmp = tmpOverride || s.tmp;
  return spawnSync(process.execPath, [AG_HOOK], {
    cwd: s.cwd,
    env: { ...process.env, HOME: s.home, USERPROFILE: s.home, TEMP: tmp, TMP: tmp, TMPDIR: tmp, CLAUDE_CONFIG_DIR: '' },
    input: stdin,
    encoding: 'utf8',
    timeout: 20000,
  });
}
// Markers now live in a private per-tool subdir os.tmpdir()/coalface (created 0o700),
// each named ag-conductor-<hash>.marker (CodeQL js/insecure-temporary-file fix 2026-07-14).
function markersIn(tmp) {
  try { return fs.readdirSync(path.join(tmp, 'coalface')).filter((f) => f.startsWith('ag-conductor-') && f.endsWith('.marker')); }
  catch { return []; }
}
// Replicate the adapter's djb2 so a test can pre-plant the EXACT marker path (EEXIST case).
function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h + s.charCodeAt(i)) >>> 0);
  return h.toString(36);
}

test('case 11: AG first PreInvocation -> ONE additionalContext JSON line (auto directive) + marker', () => {
  const s = agSandbox();
  try {
    const r = agRun(s, agEvent({ session_id: 'sess-11' }));
    assertGraceful(r);
    const line = r.stdout.trim();
    assert.ok(line && !line.includes('\n'), 'exactly one stdout line (the sanctioned AG channel)');
    const obj = JSON.parse(line);
    assert.deepStrictEqual(Object.keys(obj), ['additionalContext'], 'additionalContext (camelCase) is the ONLY key');
    assert.match(obj.additionalContext, /^\[CoalFace\] Fan-out discipline \(auto\)/, 'same directive text as the CC path (one impl)');
    assert.match(obj.additionalContext, />= 4 units/, 'default floor rides through');
    assert.strictEqual(markersIn(s.tmp).length, 1, 'per-session marker written');
  } finally { clean(s.home); }
});

test('case 12: AG throttle -> 2nd PreInvocation of the SAME session is silent', () => {
  const s = agSandbox();
  try {
    const r1 = agRun(s, agEvent({ session_id: 'sess-12' }));
    const r2 = agRun(s, agEvent({ session_id: 'sess-12' }));
    assertGraceful(r1);
    assertGraceful(r2);
    assert.match(r1.stdout, /Fan-out discipline/, 'first model call injects');
    assert.strictEqual(r2.stdout, '', 'every later model call of the session is silent (no per-call spam)');
    assert.strictEqual(markersIn(s.tmp).length, 1, 'still one marker (same session)');
  } finally { clean(s.home); }
});

test('case 13: AG throttle is PER-SESSION -> a new session_id injects again', () => {
  const s = agSandbox();
  try {
    const r1 = agRun(s, agEvent({ session_id: 'sess-13a' }));
    const r2 = agRun(s, agEvent({ session_id: 'sess-13b' }));
    assertGraceful(r1);
    assertGraceful(r2);
    assert.match(r1.stdout, /Fan-out discipline/);
    assert.match(r2.stdout, /Fan-out discipline/, 'a different session gets its own one injection');
    assert.strictEqual(markersIn(s.tmp).length, 2, 'one marker per session');
  } finally { clean(s.home); }
});

test('case 14: AG no session key / garbage stdin -> silent skip, NO marker (fail-closed)', () => {
  const s = agSandbox();
  try {
    for (const stdin of ['', 'not json {{{', '[1,2,3]', agEvent() /* PreInvocation but keyless */]) {
      const r = agRun(s, stdin);
      assertGraceful(r);
      assert.strictEqual(r.stdout, '', `silent on ${JSON.stringify(stdin.slice(0, 20))} (cannot dedupe -> never risk per-call spam)`);
    }
    assert.strictEqual(markersIn(s.tmp).length, 0, 'keyless runs write nothing');
  } finally { clean(s.home); }
});

test('case 15: AG camelCase sessionId accepted (defensive both-casings reader)', () => {
  const s = agSandbox();
  try {
    const r1 = agRun(s, agEvent({ sessionId: 'sess-15' }));
    const r2 = agRun(s, agEvent({ sessionId: 'sess-15' }));
    assertGraceful(r1);
    assertGraceful(r2);
    assert.match(r1.stdout, /Fan-out discipline/, 'camelCase key still injects');
    assert.strictEqual(r2.stdout, '', 'and still throttles');
  } finally { clean(s.home); }
});

test('case 16: AG coalfaceMode:off -> silent, but the marker still throttles the config re-read', () => {
  const s = agSandbox();
  try {
    writeGlobalCfg(s.home, { coalfaceMode: 'off' });
    const r = agRun(s, agEvent({ session_id: 'sess-16' }));
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'off = no directive on AG either');
    assert.strictEqual(markersIn(s.tmp).length, 1, 'marker written anyway: later calls skip before reading config');
  } finally { clean(s.home); }
});

test('case 17: AG NEVER carries the self-update nudge and never stamps (not ported — CC-plugin-specific payload)', () => {
  const s = agSandbox();
  try {
    writeGlobalCfg(s.home, { updateMode: 'auto' }); // fresh home: the CC path WOULD nudge here (case 8)
    const r = agRun(s, agEvent({ session_id: 'sess-17' }));
    assertGraceful(r);
    assert.match(r.stdout, /Fan-out discipline \(auto\)/, 'directive still injects');
    assert.doesNotMatch(r.stdout, /self-update due/, 'no CC-plugin update instruction on AG');
    assert.strictEqual(fs.existsSync(stampPath(s.home)), false, 'no update stamp written on the AG path');
  } finally { clean(s.home); }
});

test('case 18: AG unwritable tmp (marker cannot persist) -> fails CLOSED: silent, exit 0', () => {
  const s = agSandbox();
  try {
    const notADir = path.join(s.home, 'not-a-dir');
    fs.writeFileSync(notADir, 'x', 'utf8'); // os.tmpdir() resolves to a FILE -> mkdir/marker write throws
    const r = agRun(s, agEvent({ session_id: 'sess-18' }), notADir);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'unpersistable guard -> skip the emit (never per-call spam)');
  } finally { clean(s.home); }
});

test('case 19: AG honors payload cwd for the project config (hook cwd != workspace on AG)', () => {
  const s = agSandbox();
  try {
    // Project dir with a config, NOT the spawn cwd (both under home: walk contained).
    const proj = fs.mkdtempSync(path.join(s.home, 'cf-proj-'));
    fs.writeFileSync(path.join(proj, '.coalface.json'), '{"autoFanoutFloor": 9}', 'utf8');
    const r1 = agRun(s, agEvent({ session_id: 'sess-19a', cwd: proj }));
    assertGraceful(r1);
    assert.match(r1.stdout, />= 9 units/, 'project config at payload.cwd is read (the spawn cwd has none)');
    // Unresolvable / non-string cwd -> spawn-cwd fallback, never a crash.
    const r2 = agRun(s, agEvent({ session_id: 'sess-19b', cwd: path.join(s.home, 'no-such-dir') }));
    const r3 = agRun(s, agEvent({ session_id: 'sess-19c', cwd: 12345 }));
    assertGraceful(r2);
    assertGraceful(r3);
    assert.match(r2.stdout, />= 4 units/, 'nonexistent payload cwd -> spawn-cwd fallback (default floor)');
    assert.match(r3.stdout, />= 4 units/, 'non-string payload cwd -> spawn-cwd fallback');
  } finally { clean(s.home); }
});

// Security (CodeQL js/insecure-temporary-file): the marker is created with the wx flag
// (O_CREAT|O_EXCL), so a PRE-EXISTING marker path (a prior turn, or an attacker's planted
// file/symlink) makes the create fail EEXIST -> CF fails CLOSED (silent), never writing
// through / past it. Proves the atomic latch refuses an existing target.
test('case 20: AG a pre-existing marker path -> EEXIST fail-closed silent (planted file/symlink refused)', () => {
  const s = agSandbox();
  try {
    const markerDir = path.join(s.tmp, 'coalface');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, `ag-conductor-${hashKey('sess-20')}.marker`), 'planted', 'utf8');
    const r = agRun(s, agEvent({ session_id: 'sess-20' }));
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'pre-existing marker -> EEXIST -> no emit');
  } finally { clean(s.home); }
});
