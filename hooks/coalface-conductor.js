#!/usr/bin/env node
'use strict';
// CoalFace conductor — a Phoenix-13 hook: fail-silent, zero-dependency (node builtins
// only), no network, no spawn, no process.exit. SessionStart ONLY (lean): it injects the
// standing fan-out-discipline directive (mode-aware) + a self-update directive when due,
// on the one sanctioned SessionStart context-injection channel (Phoenix #13). The model
// does everything else (scout/partition/QC/apply live in SKILL.md).

const fs = require('fs');
const os = require('os');
const path = require('path');

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function lc(s) { return String(s == null ? '' : s).toLowerCase(); }

// String-aware JSONC strip (the CoalMine #12 fix: a value ending in a backslash before a
// later // must not desync the comment stripper) + prototype-pollution guard: drop
// __proto__/constructor/prototype via the JSON.parse reviver so an untrusted PROJECT
// config can't pollute the merged config's prototype through the Object.assign in
// readCfg (OWASP prototype pollution; series-consistent with CoalBoard/CoalHearth).
function parseJsonc(text) {
  try {
    const clean = String(text).replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : ''));
    const p = JSON.parse(clean, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch { return {}; }
}

// realpath a dir to its PHYSICAL path, falling back to a lexical resolve if realpath
// throws (an absent dir has no realpath) — so the stop-at-home compare is like-for-like.
// macOS's os.tmpdir() (and any symlinked HOME) is a symlink: process.cwd() returns the
// realpath (/private/var/...) while os.homedir() returns the raw HOME env (/var/...), so
// a lexical `dir === home` NEVER matches and the walk escapes above home (CoalHearth
// beta.3 realpath-both-sides lesson). Resolve BOTH sides before comparing.
function physical(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

// Find the nearest project .coalface.json by walking UP from cwd (a hook cwd may be a
// SUBDIR, not the project root — Phoenix #10). STOP at the home dir: its config is the
// GLOBAL (read separately from ~/.claude/), and nothing above home is "this project"
// (also keeps a hermetic test sandboxed under the real home from leaking upward — the
// CoalBoard v1.5.1 lesson).
function findProjectCfg() {
  try {
    const home = physical(os.homedir());
    let dir = physical(process.cwd());
    for (let i = 0; i < 40; i++) {
      if (dir === home) break;
      const f = path.join(dir, '.coalface.json');
      if (fs.existsSync(f)) return f;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {}
  return null;
}

function readCfg() {
  const out = {};
  const files = [];
  try { files.push(path.join(os.homedir(), '.claude', '.coalface.json')); } catch {}
  const proj = findProjectCfg();
  if (proj) files.push(proj); // project read last -> overlays global per key
  for (const f of files) {
    try { if (fs.existsSync(f)) Object.assign(out, parseJsonc(fs.readFileSync(f, 'utf8'))); } catch {}
  }
  return out;
}

// Clamped reads: an out-of-range/wrong-type value silently degrades to the default,
// never misbehaves (hooks-safety: every numeric a hook reads is range-clamped).
function modeOf(cfg) {
  const m = lc(cfg.coalfaceMode || 'auto');
  return (m === 'on' || m === 'off') ? m : 'auto';
}
function floorOf(cfg) {
  const v = cfg.autoFanoutFloor;
  return (Number.isInteger(v) && v >= 1 && v <= 50) ? v : 4;
}

// Self-update is kind-1 (series-standard, mirrors the CoalHearth/CoalBoard conductors):
// the HOOK only SCHEDULES (a throttled, crash-safe stamp — written BEFORE the directive
// prints, so a crash never re-nags; no network ever, Phoenix #7); the AGENT verifies the
// latest tag online (the /coalface:update procedure) and offers the update.
function updateDue(cfg) {
  try {
    if (lc(cfg.updateMode || 'ask') === 'off') return false;
    // Clamp on read: updateCheckDays:0 must NOT mean "nag every session".
    const days = (Number.isInteger(cfg.updateCheckDays) && cfg.updateCheckDays >= 1 && cfg.updateCheckDays <= 365) ? cfg.updateCheckDays : 14;
    const stamp = path.join(os.homedir(), '.claude', '.coalface-update-check');
    let last = 0;
    try { last = Number(String(fs.readFileSync(stamp, 'utf8')).trim()) || 0; } catch {}
    const now = Date.now();
    if (last && now - last < days * 86400000) return false; // inside the window: not due
    try { fs.mkdirSync(path.dirname(stamp), { recursive: true }); fs.writeFileSync(stamp, String(now)); } catch {} // schedule: stamp the check now
    return true; // due — first run (last === 0) or the window has elapsed
  } catch { return false; }
}

// The standing fan-out-discipline directive for a merged config — '' when the
// discipline is off. THE one copy of the text: the CC SessionStart path (main below)
// and the Antigravity adapter (hooks/ag-conductor.js) both emit exactly this string
// (the CoalHearth journal-step one-flock pattern: shared core, thin platform adapters).
function directiveFor(cfg) {
  const mode = modeOf(cfg);
  if (mode === 'auto') {
    return `[CoalFace] Fan-out discipline (auto). Any fan-out of >= ${floorOf(cfg)} units rides the /coalface contract instead of ad-hoc spawning: scout the worksite -> deterministic partition -> workers return anchor-edit orders as text -> QC scope+spec at collection -> single-writer sequential apply behind a pre-swarm snapshot + domain gate -> receipt. Wallet: DOLLAR cost stays ~solo via cheap tiers (raw tokens run HIGHER — fan-out xN the per-sub baseline), not tokens. 1-2-sub ad-hoc spawns stay zero-ceremony; manual /coalface convenes it any time.`;
  }
  if (mode === 'on') {
    return '[CoalFace] Fan-out discipline FORCED (on). Scout EVERY prompt for decomposable work and fan it out via the /coalface contract (scout -> partition -> anchor-edit orders -> QC -> single-writer apply behind a snapshot -> receipt); only non-decomposable work runs solo. Wallet: DOLLAR cost stays ~solo via cheap tiers (raw tokens run HIGHER — fan-out xN the per-sub baseline), not tokens.';
  }
  return '';
}

function main() {
  let input = {};
  try { const p = JSON.parse(readStdin() || '{}'); if (p && typeof p === 'object' && !Array.isArray(p)) input = p; } catch {}
  const event = input.hook_event_name || input.hookEventName || '';
  // SessionStart ONLY — any other/unknown event stays silent (Phoenix #13 zero-noise).
  if (event !== 'SessionStart') return;

  const cfg = readCfg();
  let msg = directiveFor(cfg);
  // mode 'off' -> no directive; self-update is ORTHOGONAL (its own off-switch is
  // updateMode), so it still fires when the discipline is off — the keys are independent.
  if (updateDue(cfg)) {
    msg += (msg ? ' ' : '[CoalFace] ') + '[self-update due] Offer the /coalface:update check: web-check the latest CoalFace tag vs the installed plugin.json version; if newer, OFFER `claude plugin update coalface@coalface`; if current, say "up to date"; if git/network is unavailable, say so and suggest updating manually later (never assume). Consent-gated; the hook only scheduled it.';
  }
  if (msg) process.stdout.write(msg); // sanctioned SessionStart context-injection channel
}

// Shared core for the Antigravity adapter (hooks/ag-conductor.js): the config read +
// the directive text stay ONE implementation, never forked per platform. Exporting
// does NOT change the spawned-hook behavior (main still runs when this file is the
// entrypoint, below) — the hermetic tests keep spawning the real file (hooks-safety §7).
module.exports = { readCfg, directiveFor };

if (require.main === module) {
  try { main(); } catch { /* Phoenix #4: fail-silent, never crash the host */ }
}
// No process.exit() — Phoenix #4 (it would truncate the sanctioned stdout write above).
