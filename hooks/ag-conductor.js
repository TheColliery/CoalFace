#!/usr/bin/env node
'use strict';
// CoalFace conductor — Antigravity (AG 2.0 hooks.json) adapter. AG has NO one-shot
// session-start event (SessionStart is a valid name but never fires in the AG CLI/IDE —
// pilot 2026-07-12), so the standing fan-out-discipline directive rides the FIRST
// `PreInvocation` of a session instead. PreInvocation fires per MODEL CALL (many times
// per user prompt — NOT a UserPromptSubmit/SessionStart equivalent), so an unguarded
// port would re-inject the directive into EVERY model call (context spam + token burn).
// Guard: a per-session marker file in os.tmpdir() (Phoenix #6 — session state in tmp,
// scoped by session id) makes the injection at most ONCE per session; every later
// PreInvocation of the same session is a ~1ms existsSync + return (Phoenix #3).
//
// The directive text + config read come from ./coalface-conductor.js (require'd, never
// re-typed): ONE implementation for both platforms — the CoalHearth journal-step
// one-flock pattern (shared core, thin platform adapters). Deliberately NOT ported:
//   - the self-update nudge: its payload ("claude plugin update coalface@coalface") is
//     Claude-Code-plugin-specific; AG installs by file-copy (~/.gemini/config/skills),
//     so that instruction would be wrong there (the same named decision as CoalHearth's
//     AG shim). No ~/.claude update stamp is written on the AG path.
//   - no prompt-content degrade is NEEDED: the CC conductor never inspects the user
//     PROMPT (the directive is config-driven and static), so the AG PreInvocation
//     payload's lack of a guaranteed prompt-text field costs nothing here.
//
// Emit = the one sanctioned AG channel: a single-line `additionalContext` JSON
// (camelCase — pilot-confirmed; snake_case is wrong). NOT validated live on AG:
// whether AG delivers PreInvocation additionalContext into the agent's context is
// pilot-UNCONFIRMED — emitted per spec, claimed as nothing more.
//
// Phoenix-13 throughout: fail-silent, exit 0 always, zero-dep (node builtins only),
// no network, no child process, no process.exit(); the only write is the tmp marker.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readCfg, directiveFor } = require('./coalface-conductor.js');

// First non-empty string among keys (defensive: AG core fields are snake_case; accept
// camelCase too — the pilot captured the payload shape only partially).
function firstString(obj, keys) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

// Deterministic djb2 (Phoenix #8: same key -> same marker name): arbitrary session key
// (UUID or transcript path) -> stable filesystem-safe token (CoalHearth's ag hash).
function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h + s.charCodeAt(i)) >>> 0);
  return h.toString(36);
}

function main() {
  let payload = {};
  try {
    const p = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (p && typeof p === 'object' && !Array.isArray(p)) payload = p;
  } catch { /* absent/garbage stdin -> {} -> no session key -> skip below */ }

  // AG does not guarantee the hook process's cwd is the workspace; the payload's `cwd`
  // is authoritative — chdir ONCE at entry so readCfg's project-config walk starts at
  // the real workspace (the CoalWash AG mechanism; one-flock, zero shared-core churn —
  // nothing here is cwd-relative before this point: requires are module-path-resolved,
  // the marker path is absolute-tmpdir). Missing/non-string/unresolvable cwd -> keep
  // the spawn cwd (defensive fallback, never throws out).
  const payloadCwd = firstString(payload, ['cwd']);
  if (payloadCwd) { try { process.chdir(payloadCwd); } catch { /* keep spawn cwd */ } }

  // A per-session key is REQUIRED for the once-per-session guard. Absent -> skip
  // silently (Phoenix #12) rather than risk re-injecting on every model call.
  const key = firstString(payload, ['session_id', 'sessionId', 'transcript_path', 'transcriptPath']);
  if (!key) return;

  // The once-per-session guard is an ATOMIC create-exclusive latch (CodeQL js/insecure-
  // temporary-file, one-flock fix 2026-07-14). The marker lives in a private per-tool
  // subdir (mode 0o700 — closes the shared-/tmp exposure on Unix, a no-op on Windows), and
  // is created with the `wx` flag (O_CREAT|O_EXCL): the write atomically FAILS if the path
  // already exists in ANY form (a prior turn's marker, or a planted file/symlink) — killing
  // the old check-then-write TOCTOU race AND refusing a symlink target in one syscall.
  // The wx flag guards the marker FILE; the subdir needs its own guard: mkdirSync(recursive)
  // SILENTLY succeeds on a PRE-PLANTED symlink at markerDir (following it, the 0o700 mode NOT
  // applied), so the wx marker would then write THROUGH it into an attacker's dir. lstatSync
  // (does NOT follow the link) rejects a symlink subdir before the write — routed to the SAME
  // per-repo branch as a marker-write failure (CF/CM fail-closed skip; CH emits with the note).
  // ponytail: session-scoped, OS-tmp-cleaner reaped. AG's Stop fires per RESPONSE (many/
  // session) -> no safe "session over" hook to delete it on; accumulation is bounded.
  //
  // NAMED divergence from CoalHearth's AG shim (which emits + a "may repeat" note when the
  // marker cannot persist): CH's payload is a RECOVERY block — losing it risks losing work,
  // so repeating is the lesser evil. CF's payload is an ADVISORY directive — repeating it on
  // every model call IS the spam this guard exists to prevent — so ANY create failure
  // (EEXIST = already ran this session, OR an unwritable tmp) fails CLOSED: skip the emit
  // (manual /coalface still works; the auto nudge is lost only on a broken tmp or a repeat).
  const markerDir = path.join(os.tmpdir(), 'coalface');
  const marker = path.join(markerDir, `ag-conductor-${hashKey(key)}.marker`);
  try {
    fs.mkdirSync(markerDir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(markerDir).isSymbolicLink()) return; // dir-symlink residual -> fail-closed (see above)
    fs.writeFileSync(marker, '', { flag: 'wx' });
  } catch { return; } // EEXIST (already ran) OR any write failure -> fail-closed, no emit

  const msg = directiveFor(readCfg());
  if (!msg) return; // coalfaceMode off -> silent (the marker still spares per-call config reads)

  console.log(JSON.stringify({ additionalContext: msg })); // the one sanctioned AG stdout
}

try { main(); } catch { /* Phoenix #4: fail-silent, never crash the host */ }
// No process.exit() — Phoenix #4 (it would truncate the sanctioned stdout write above).
