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
// Namespace campaign #39: the stamp's new home. oldStampPath kept for the
// read-fallback/write-drop migration cases below.
function stampPath(home) {
  return path.join(home, '.claude', 'coal', 'coalface', 'update-check');
}
function oldStampPath(home) {
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

test('case 11: AG first PreInvocation -> ONE injectSteps/ephemeralMessage JSON line (auto directive) + marker', () => {
  const s = agSandbox();
  try {
    const r = agRun(s, agEvent({ session_id: 'sess-11' }));
    assertGraceful(r);
    const line = r.stdout.trim();
    assert.ok(line && !line.includes('\n'), 'exactly one stdout line (the sanctioned AG channel)');
    const obj = JSON.parse(line);
    assert.deepStrictEqual(Object.keys(obj), ['injectSteps'], 'injectSteps is the ONLY key (current AG PreInvocation output contract; the pilot-era additionalContext is a dead letter)');
    assert.strictEqual(obj.injectSteps.length, 1, 'exactly one injected step');
    assert.deepStrictEqual(Object.keys(obj.injectSteps[0]), ['ephemeralMessage'], 'ephemeralMessage (transient system message) is the step type');
    assert.match(obj.injectSteps[0].ephemeralMessage, /^\[CoalFace\] Fan-out discipline \(auto\)/, 'same directive text as the CC path (one impl)');
    assert.match(obj.injectSteps[0].ephemeralMessage, />= 4 units/, 'default floor rides through');
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

// Security (dir-symlink residual): mkdirSync(recursive) FOLLOWS a pre-planted symlink at the
// marker subdir (silently succeeding, 0o700 unapplied), so the wx marker would write THROUGH it.
// CF's divergence (advisory payload): reject the symlink dir -> fail-closed (skip the emit); the
// marker is NOT written into the attacker dir.
test('case 21: AG a pre-planted SYMLINK at the marker subdir -> fail-closed silent, NO marker in the target (dir-symlink close)', (t) => {
  const s = agSandbox();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-symtarget-')); // attacker dir the symlink points at
  try {
    const markerDir = path.join(s.tmp, 'coalface'); // os.tmpdir()/coalface (TMPDIR -> s.tmp)
    try {
      fs.symlinkSync(target, markerDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      t.skip('symlink/junction unavailable (needs privilege) — cannot exercise the dir-symlink guard');
      return; // t.skip does not stop the body; return so the case is skipped, never a vacuous pass
    }
    const r = agRun(s, agEvent({ session_id: 'sess-21' }));
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'a symlinked marker subdir -> fail-closed, no emit');
    assert.strictEqual(fs.readdirSync(target).length, 0, 'no marker written THROUGH the symlink into the attacker dir');
  } finally {
    clean(s.home);
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// The CURRENT documented AG payload shape (re-derived 2026-07-23): common fields are
// camelCase protojson — conversationId + workspacePaths[] + transcriptPath. No `cwd`,
// no `session_id` (those stay covered above as defensive legacy fallbacks).
test('case 22: AG current-spec payload (conversationId + workspacePaths) -> injects once, project config honored', () => {
  const s = agSandbox();
  try {
    const proj = fs.mkdtempSync(path.join(s.home, 'cf-proj-'));
    fs.writeFileSync(path.join(proj, '.coalface.json'), '{"autoFanoutFloor": 7}', 'utf8');
    const payload = { conversationId: 'conv-22', workspacePaths: [proj], transcriptPath: path.join(proj, 'transcript.jsonl') };
    const r1 = agRun(s, agEvent(payload));
    assertGraceful(r1);
    const obj = JSON.parse(r1.stdout.trim());
    assert.match(obj.injectSteps[0].ephemeralMessage, />= 7 units/, 'workspacePaths[0] drives the project-config walk (no cwd field in the current spec)');
    const r2 = agRun(s, agEvent(payload));
    assertGraceful(r2);
    assert.strictEqual(r2.stdout, '', 'conversationId keys the once-per-session throttle');
    assert.strictEqual(markersIn(s.tmp).length, 1, 'one marker for the conversation');
  } finally { clean(s.home); }
});

// ---------------------------------------------------------------------------
// Config-cascade clamp — consent-bearing keys merge SAFER-VALUE-WINS
// (hooks-safety.md §9: a project .coalface.json ARRIVES WITH A CLONED REPO,
// untrusted; a plain overlay would let it ESCALATE coalfaceMode/updateMode past
// what the user's own global config explicitly chose. One flock, one color —
// CoalMine updateMode [hooks/_shared/node-config.js] + CoalWash mergeSafety
// [scripts/lib/config-load.mjs] share this exact shape.)
// ---------------------------------------------------------------------------

test('case 23: an untrusted project config cannot ESCALATE coalfaceMode past an explicit global off', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'off' }); // explicit global opt-out
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"on"}', 'utf8'); // a cloned repo trying to force it back on
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'global off must hold -> project cannot escalate to on');
  } finally { clean(home, cwd); }
});

test('case 24: a project config MAY quieten coalfaceMode below an explicit global on', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'on', updateMode: 'off' });
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"off"}', 'utf8'); // legit per-project off-switch
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'project may quieten global on -> off, silent');
  } finally { clean(home, cwd); }
});

test('case 25: a project-only coalfaceMode ESCALATION (no global preference set) clamps to the SCHEMA DEFAULT (R2 — a silent global is not an open door)', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home); // global sets only updateMode:off, no coalfaceMode opinion written
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"on"}', 'utf8'); // trying to escalate past the implicit 'auto' stance
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, /\[CoalFace\] Fan-out discipline \(auto\)/, 'no explicit global -> the factory default (auto) is the floor, not on');
    assert.doesNotMatch(r.stdout, /FORCED/, 'must NOT reach the forced-on directive');
  } finally { clean(home, cwd); }
});

test('case 26: an untrusted project config cannot ESCALATE updateMode past an explicit global off', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'off' }); // both quiet -> stdout is purely the update channel
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"updateMode":"auto"}', 'utf8');
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'global updateMode:off must hold -> project cannot escalate to auto (no self-update nudge)');
  } finally { clean(home, cwd); }
});

test('case 27: a project-only coalfaceMode QUIETER than the default (no global set) is NOT blocked -> stays project-wins (R2 complement)', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home); // no coalfaceMode opinion written -> implicit floor is 'auto'
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"off"}', 'utf8'); // quieter than the default -> not an escalation
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'off is quieter than the implicit auto default -> project stays free to disable');
  } finally { clean(home, cwd); }
});

test('case 28: an UPPERCASE project value cannot escalate coalfaceMode past a lowercase global (case-fold safe, R4)', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'off' });
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"ON"}', 'utf8'); // mixed-case escalation attempt
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'case-folded compare -> ON is still clamped to off, same as case 23');
  } finally { clean(home, cwd); }
});

// ---------------------------------------------------------------------------
// Fail-OPEN close: an unrecognized value on EITHER side of the clamp must not
// fall through to the raw shallow-merge result (hooks-safety.md §9 — the
// clamp binds "recognized values", not "the values I bothered to validate").
// Rows 1/2 of the room-reviewer's table already hold via cases 23/25; these
// two cover the rows that were broken (`if (gi === -1 || pi === -1) continue`).
// ---------------------------------------------------------------------------

test('case 29: a MALFORMED global value is not an explicit choice -> floor falls to the schema default, same as an absent global (R2), never the raw project value', () => {
  for (const badGlobal of ['Off ', 'disabled', 0]) {
    const { home, cwd } = sandbox();
    try {
      writeGlobalCfg(home, { coalfaceMode: badGlobal, updateMode: 'off' });
      fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"on"}', 'utf8');
      const r = run(cwd, home);
      assertGraceful(r);
      assert.match(r.stdout, /\[CoalFace\] Fan-out discipline \(auto\)/, `unparseable global ${JSON.stringify(badGlobal)} must floor to the schema default (auto), not pass 'on' through`);
      assert.doesNotMatch(r.stdout, /FORCED/, `unparseable global ${JSON.stringify(badGlobal)} must never reach FORCED`);
    } finally { clean(home, cwd); }
  }
});

test('case 30: a MALFORMED project value cannot escalate past an explicit global off -> the unrecognized value is rejected, not passed through raw', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'off' });
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"coalfaceMode":"on "}', 'utf8'); // trailing space: fails the exact SAFER_ENUM lookup
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'malformed project value rejected -> global off holds, silent (not passed through as a live coalfaceMode)');
  } finally { clean(home, cwd); }
});

// The fail-open-close fix is key-generic (loops Object.entries(SAFER_ENUM)), so
// updateMode inherits it -- this proves it, mirroring case 30's project-malformed
// direction. The GLOBAL-malformed direction (case 29's shape) is deliberately NOT
// mirrored here: updateDue() only branches on `=== 'off'` (R2's own NIL-BLAST
// note above), so a clamped floor of 'ask' and an unclamped raw 'garbage' floor
// are BOTH "not off" -- the nudge fires either way and the assertion could not
// tell fixed from buggy. Writing that case would repeat the exact vacuous-oracle
// trap flagged on case 29 (sharing modeOf's fallback); the project-malformed
// direction below does not share an oracle with anything downstream, so it
// actually discriminates.
test('case 31: a MALFORMED project updateMode cannot escalate past an explicit global off (key-generic close, second SAFER_ENUM key)', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'off' });
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"updateMode":"auto "}', 'utf8'); // trailing space: fails the exact SAFER_ENUM lookup
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'malformed project updateMode rejected -> global off floor holds -> no self-update nudge');
  } finally { clean(home, cwd); }
});

// AG regression for the SAME fail-open close, not inferred from the shared
// readCfg -- spawns the real ag-conductor.js so a future refactor that gives AG
// its own config read (breaking the sharing this fix relies on) fails THIS test,
// not just the CC-path ones above.
test('case 32: AG inherits the fail-open close via the shared readCfg -> a malformed project value cannot escalate past an explicit global off', () => {
  const s = agSandbox();
  try {
    writeGlobalCfg(s.home, { coalfaceMode: 'off' });
    const proj = fs.mkdtempSync(path.join(s.home, 'cf-proj-'));
    fs.writeFileSync(path.join(proj, '.coalface.json'), '{"coalfaceMode":"on "}', 'utf8'); // trailing space, mirrors case 30 on the AG path
    const r = agRun(s, agEvent({ session_id: 'sess-32', cwd: proj }));
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'clamp reached through readCfg on the AG adapter too -> global off holds, no injectSteps emitted');
  } finally { clean(s.home); }
});

// ---------------------------------------------------------------------------
// Namespace campaign #69+#39: per-project config address + update-check stamp
// ---------------------------------------------------------------------------

test('case 33: own agent dir wins over the fixed fallback order at the same level', () => {
  const s = agSandbox();
  try {
    const proj = fs.mkdtempSync(path.join(s.home, 'cf-proj-'));
    fs.mkdirSync(path.join(proj, '.claude', 'coal'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'coal', 'coalface.json'), '{"autoFanoutFloor": 11}', 'utf8');
    fs.mkdirSync(path.join(proj, '.agents', 'coal'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.agents', 'coal', 'coalface.json'), '{"autoFanoutFloor": 22}', 'utf8');
    const r = agRun(s, agEvent({ session_id: 'sess-33', cwd: proj })); // AG's own dir = agents
    assertGraceful(r);
    assert.match(r.stdout, />= 22 units/, 'agents (own dir) wins over claude, though claude is first in the fixed fallback order');
  } finally { clean(s.home); }
});

test('case 34: fixed fallback order is used when the own dir has no config', () => {
  const s = agSandbox();
  try {
    const proj = fs.mkdtempSync(path.join(s.home, 'cf-proj-'));
    fs.mkdirSync(path.join(proj, '.claude', 'coal'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'coal', 'coalface.json'), '{"autoFanoutFloor": 33}', 'utf8'); // no .agents/coal/coalface.json
    const r = agRun(s, agEvent({ session_id: 'sess-34', cwd: proj })); // AG's own dir = agents, absent
    assertGraceful(r);
    assert.match(r.stdout, />= 33 units/, 'own dir (agents) missing -> falls through the fixed order to .claude');
  } finally { clean(s.home); }
});

test('case 35: the LEGACY root dotfile is read when no new-shape candidate exists anywhere', () => {
  const { home, cwd } = sandbox();
  try {
    muteUpdate(home);
    fs.writeFileSync(path.join(cwd, '.coalface.json'), '{"autoFanoutFloor": 44}', 'utf8'); // pre-2026-08-08 shape, no .claude/.agents/.gemini dirs at all
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, />= 44 units/, 'legacy root dotfile still read normally -- no breakage for an existing config');
  } finally { clean(home, cwd); }
});

test('case 36: update-check stamp read-new-fallback-old -- a pre-migration stamp still throttles', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'auto' });
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(oldStampPath(home), String(Date.now()), 'utf8'); // OLD path only, fresh (inside the 14-day window)
    const r = run(cwd, home);
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'a fresh OLD-path stamp is read as the fallback and still throttles -> no re-nag on the first post-migration run');
  } finally { clean(home, cwd); }
});

test('case 37: update-check stamp write-new-drop-old -- a due check writes only the new path and removes the old', () => {
  const { home, cwd } = sandbox();
  try {
    writeGlobalCfg(home, { coalfaceMode: 'off', updateMode: 'auto' });
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(oldStampPath(home), String(Date.now() - 20 * 86400000), 'utf8'); // OLD path, stale (past the 14-day window) -> due
    const r = run(cwd, home);
    assertGraceful(r);
    assert.match(r.stdout, /self-update due/, 'a stale OLD-path stamp is still read as the fallback, correctly judged due');
    assert.ok(fs.existsSync(stampPath(home)), 'the fresh stamp lands at the NEW path');
    assert.strictEqual(fs.existsSync(oldStampPath(home)), false, 'the OLD path is dropped in the same operation (no-old-version-leftover)');
  } finally { clean(home, cwd); }
});

// Clamp-unchanged: the SAFER_ENUM clamp (hooks-safety.md §9) reads projectCfg from
// WHATEVER candidate findProjectCfg() resolved to -- prove it still holds when that
// candidate is a NEW-shape own-dir path, not just the legacy path cases 23-32 use.
test('case 38: the config-cascade clamp is unaffected by which candidate supplied the project override', () => {
  const s = agSandbox();
  try {
    writeGlobalCfg(s.home, { coalfaceMode: 'off' }); // explicit global floor
    const proj = fs.mkdtempSync(path.join(s.home, 'cf-proj-'));
    fs.mkdirSync(path.join(proj, '.agents', 'coal'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.agents', 'coal', 'coalface.json'), '{"coalfaceMode":"on"}', 'utf8'); // escalation attempt, NEW own-dir shape
    const r = agRun(s, agEvent({ session_id: 'sess-38', cwd: proj }));
    assertGraceful(r);
    assert.strictEqual(r.stdout, '', 'clamp still holds the explicit global off floor -- read-order migration changed the ADDRESS only, never the clamp semantics');
  } finally { clean(s.home); }
});

// Write side (namespace campaign checklist item 2): CoalFace has no project-config
// writer anywhere in this codebase (no configure.mjs, no consent-persistence code --
// unlike CoalTipple/CoalWash) -- grep-proof, not merely asserted, so a future writer
// added without updating this test fails loud instead of silently violating
// write-new-drop-old.
test('write side: no project-config writer exists in this room (grep-proof N/A)', () => {
  assert.strictEqual(fs.existsSync(path.join(REPO, 'scripts', 'configure.mjs')), false, 'no configure.mjs in this room');
  const sourceDirs = ['hooks', 'scripts', path.join('scripts', 'lib')];
  const writerHit = /writeFileSync\s*\([^)]*coalface\.json/;
  for (const dir of sourceDirs) {
    for (const f of fs.readdirSync(path.join(REPO, dir))) {
      if (f.endsWith('.test.mjs') || f.endsWith('.test.js')) continue; // this file's own fixtures are not the product
      const abs = path.join(REPO, dir, f);
      if (fs.statSync(abs).isDirectory()) continue;
      const text = fs.readFileSync(abs, 'utf8');
      assert.ok(!writerHit.test(text), `${dir}/${f} writes a *.coalface.json -- update this test if a real writer was added (write-new-drop-old must then apply)`);
    }
  }
});
