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

// Namespace campaign #69+#39 (owner-designated shape 2026-08-08): per-project config now
// lives under an agent dir, never bare at the project root. Fixed fallback order (first
// found wins) -- .gemini has no current consumer in this room, probed only for
// flock-consistency (every room checks the same three, so a project's choice of agent dir
// never depends on which room's config is being read).
// Exported (CWK-079) so scripts/lib/pointer-check.mjs's caller DERIVES the pointer gate's
// agent-home roots from this array rather than hand-copying it -- the exact CoalTipple
// failure mode CWK-079's own dispatch names for a DIFFERENT hand-kept list (ourRoots).
const AGENT_DIR_ORDER = ['claude', 'agents', 'gemini'];

// The agent-dir list for one walk: the EXECUTING agent's own dir first (own-dir may be
// absent from AGENT_DIR_ORDER's fixed positions -- e.g. a 4th agent this room doesn't
// otherwise probe -- so it is prepended, not looked up in the fixed list), then the fixed
// fallback order (own dir deduped out so it is never checked twice). The dedup has no
// OBSERVABLE behavior (checking one path twice changes nothing) -- it is correct by
// TRACE, not by test; no case in hooks.test.mjs proves it, none can (INSPECT, namespace
// campaign #69+#39).
function agentDirsFor(ownAgentDir) {
  return ownAgentDir ? [ownAgentDir, ...AGENT_DIR_ORDER.filter((d) => d !== ownAgentDir)] : AGENT_DIR_ORDER;
}

// The flock's ONE canonical project-config path, shown verbatim in every migration /
// ignored-file notice below (UMB-133: every room names the same path).
const CANONICAL_PATH = '.claude/coal/coalface.json';

// Ordered per-level candidate list for one directory, first existing file wins (UMB-133,
// the flock's unified legacy list). Three tiers, each in agent-dir order:
//   1. CANONICAL  <dir>/.<agent>/coal/coalface.json
//   2. LEGACY (nested)  <dir>/.<agent>/.coalface.json   -- the pre-2026-08-08 shape written
//      inside an agent dir; built over the SAME agent-dir list as tier 1 (head ruling),
//      so `.claude` is covered as the row requires and `.agents`/`.gemini` come along
//      consistently (no shipped room ever wrote those two nested shapes -- they are
//      honoured only for flock-consistency, the same reason `.gemini` is probed at all).
//   3. LEGACY (root)    <dir>/.coalface.json
// Canonical beats both legacies at the same level; the nested legacy beats the root one.
// `legacy` marks tiers 2-3 so a hit can be NOTED (loadCfg) without a second path parse.
function candidatesFor(dir, ownAgentDir) {
  const dirs = agentDirsFor(ownAgentDir);
  return [
    ...dirs.map((d) => ({ file: path.join(dir, `.${d}`, 'coal', 'coalface.json'), legacy: false })),
    ...dirs.map((d) => ({ file: path.join(dir, `.${d}`, '.coalface.json'), legacy: true })),
    { file: path.join(dir, '.coalface.json'), legacy: true },
  ];
}

// The NON-CANDIDATE paths worth naming at one directory level -- a `.coalface.json` (or
// its dotless twin) a user might reasonably write and the walk would otherwise pass over
// in silence. Defined as: ONE path component away from a real candidate, at a level the
// walk already visits --
//   <dir>/coalface.json                     dotless typo of the root legacy
//   <dir>/.<agent>/coalface.json            missing the `coal/` segment (or the dot)
//   <dir>/.<agent>/coal/.coalface.json      the legacy dot-name inside the canonical dir
// Seven paths for the CC hook (three agent dirs). NOT probed, by design: an agent dir
// outside the three (would need a directory listing -- a crawl, not a probe); case
// variants (a case-insensitive volume already matches them as candidates, a
// case-sensitive one is a different file); any level the walk does not visit (above the
// winning level, at or above home); and the GLOBAL layer (~/.claude/), out of scope.
function strayPathsFor(dir, ownAgentDir) {
  const dirs = agentDirsFor(ownAgentDir);
  return [
    path.join(dir, 'coalface.json'),
    ...dirs.map((d) => path.join(dir, `.${d}`, 'coalface.json')),
    ...dirs.map((d) => path.join(dir, `.${d}`, 'coal', '.coalface.json')),
  ];
}

// Walk UP from cwd (a hook cwd may be a SUBDIR, not the project root — Phoenix #10),
// checking the full candidate list (canonical -> nested legacy -> root legacy, own agent
// dir first inside each tier) AT EACH LEVEL before moving to the parent — so a new-shape
// config one level down always wins over a legacy config further up, matching the
// pre-migration nearest-wins behavior. STOP at the home dir: its config is the GLOBAL
// (read separately from ~/.claude/), and nothing above home is "this project" (also keeps
// a hermetic test sandboxed under the real home from leaking upward — the CoalBoard
// v1.5.1 lesson). ownAgentDir: the executing agent's own identity ('claude' for the CC
// hook, 'agents' for the Antigravity adapter) — undefined falls back to the fixed order
// alone (defensive; every real caller in this file passes one explicitly).
// Returns { file, legacy, strays }: `strays` is filled ONLY when probeStrays is true and
// only for levels the walk actually reads (the winning level included, nothing above it),
// so a caller that does not report (findProjectCfg, the configure.mjs write path) pays
// nothing for the probe (Phoenix #3: the probe is 7 existsSync per visited level).
function walkProject(ownAgentDir, probeStrays) {
  const out = { file: null, legacy: false, strays: [] };
  try {
    const home = physical(os.homedir());
    let dir = physical(process.cwd());
    for (let i = 0; i < 40; i++) {
      if (dir === home) break;
      if (probeStrays) {
        for (const s of strayPathsFor(dir, ownAgentDir)) if (fs.existsSync(s)) out.strays.push(s);
      }
      for (const c of candidatesFor(dir, ownAgentDir)) {
        if (fs.existsSync(c.file)) { out.file = c.file; out.legacy = c.legacy; return out; }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {}
  return out;
}

// The path of the nearest project config, or null. Contract unchanged for every caller
// (scripts/configure.mjs's write path): a path or null, no notices, no stray probe.
function findProjectCfg(ownAgentDir) {
  return walkProject(ownAgentDir, false).file;
}

// Config-cascade clamp (hooks-safety.md §9): the project .coalface.json ARRIVES
// WITH A CLONED REPO -- untrusted. A plain project-wins overlay lets it ESCALATE
// a consent-bearing enum past what the user's own global config explicitly
// chose (off -> on = unsolicited fan-out spawning; off -> auto on updateMode =
// an unsolicited networked update check). Index 0 = safest/quietest. Precedents,
// same shape verbatim (one flock, one color): CoalMine `updateMode`
// (hooks/_shared/node-config.js) · CoalWash `mergeSafety` (scripts/lib/config-load.mjs).
//
// The two orderings are DELIBERATELY DIFFERENT (station-3 verified 2026-07-27,
// per-key -- do NOT "fix" them to match): for coalfaceMode, `on` forces
// scouting EVERY prompt = max spend, so it is loudest and `auto` sits in the
// MIDDLE; for updateMode, `auto` genuinely IS the loudest (standing consent to
// check+offer unprompted), so it sits LAST. Derive loudest/quietest from what
// the value actually causes for THIS key, never assume a shared shape.
const SAFER_ENUM = {
  coalfaceMode: ['off', 'auto', 'on'],
  updateMode: ['off', 'remind', 'ask', 'auto'],
};
// A user who never wrote a global config is not thereby unprotected -- the
// schema's factory default IS their implicit stance (R2). Must match modeOf()'s
// and updateDue()'s own hardcoded fallbacks below.
const SAFER_ENUM_DEFAULT = { coalfaceMode: 'auto', updateMode: 'ask' };

// ownAgentDir: which agent is executing right now ('claude' from the CC hook's own main()
// below, 'agents' from hooks/ag-conductor.js) -- see findProjectCfg. The GLOBAL config
// home (~/.claude/.coalface.json) is UNCHANGED by this pass -- a scoping decision, not a
// settled fact: the design doc's opening paragraph implies every skill's global home moves
// to ~/.claude/coal/<skill>/, but this room's own checklist item 3 names only the
// update-check stamp, and CoalBoard's shipped precedent in the same campaign made the
// identical narrower call. The doc itself is inconsistent here (INSPECT, namespace
// campaign #69+#39) -- reported to main, not resolved unilaterally in this room.
// The merged config PLUS the notices a report-capable caller emits (UMB-133): one
// `LEGACY:` line when the winning project file is a legacy shape (this names the
// canonical path to migrate to; it deliberately does NOT claim the file was READ -- a
// directory or a malformed file at a legacy path is a hit that parses to nothing, and
// "still read" would then be false, INSPECT F3), one `IGNORED:` line per NON-candidate
// `.coalface.json` the walk passed over. `probeStrays` false = the read-only shape
// (readCfg): no probe, no notices, byte-identical to the pre-UMB-133 read cost.
function loadCfg(ownAgentDir, probeStrays) {
  let globalCfg = {};
  let projectCfg = {};
  const notices = [];
  try {
    const f = path.join(os.homedir(), '.claude', '.coalface.json');
    if (fs.existsSync(f)) globalCfg = parseJsonc(fs.readFileSync(f, 'utf8'));
  } catch {}
  const hit = walkProject(ownAgentDir, probeStrays); // never throws (its own try/catch)
  try {
    if (hit.file && fs.existsSync(hit.file)) projectCfg = parseJsonc(fs.readFileSync(hit.file, 'utf8'));
  } catch {}
  if (hit.file && hit.legacy) notices.push(`LEGACY: ${hit.file} is a legacy config path; canonical = ${CANONICAL_PATH}`);
  for (const s of hit.strays) notices.push(`IGNORED: ${s} is not a config path; canonical = ${CANONICAL_PATH}`);
  const out = { ...globalCfg, ...projectCfg }; // project overlays global per key
  for (const [key, order] of Object.entries(SAFER_ENUM)) {
    if (projectCfg[key] === undefined) continue; // no project override attempted -> nothing to clamp
    // Global's explicit choice is the floor; absent OR UNRECOGNIZED (a malformed
    // value is not an explicit choice either) -> the factory default is the floor
    // (R2) -- a silent/garbled global is not an open door (case 25/27/29).
    const globalSet = globalCfg[key] !== undefined && order.indexOf(String(globalCfg[key]).toLowerCase()) !== -1;
    const floor = globalSet ? globalCfg[key] : SAFER_ENUM_DEFAULT[key];
    const gi = order.indexOf(String(floor).toLowerCase()); // always valid: SAFER_ENUM_DEFAULT members are schema-valid
    const pi = order.indexOf(String(projectCfg[key]).toLowerCase());
    // pi === -1: the project value does not parse against the enum at all -- the
    // untrusted side is REJECTED outright, never passed through as the raw
    // shallow-merge value (that was the fail-open hole: a malformed project value
    // used to fall through `out` untouched instead of being clamped, case 30).
    out[key] = (pi !== -1 && pi <= gi) ? projectCfg[key] : floor; // project may not be LOUDER than the floor
  }
  return { cfg: out, notices };
}

// The read-only entry every existing caller uses: the merged config, nothing else.
function readCfg(ownAgentDir) {
  return loadCfg(ownAgentDir, false).cfg;
}

// Append notices to the FINAL message, one per line. The `[CoalFace]` prefix is supplied
// at the call site exactly like the update nudge and the language lock: only when the
// message would otherwise be empty, so a notice-only message still carries exactly ONE
// prefix and a notice never doubles one (F2). Newline-separated so each notice is its
// own greppable line and the flock's exemplar `IGNORED: ...` shape stays verbatim.
function appendNotices(msg, notices) {
  let m = msg;
  for (const n of notices) m += (m ? '\n' : '[CoalFace] ') + n;
  return m;
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
// Namespace campaign #39 (machine-global half): the stamp's new home is
// ~/.claude/coal/coalface/update-check. Read-new-fallback-old (a pre-migration stamp's
// throttle window still holds -- no re-nag on the first post-migration run) /
// write-new-drop-old (every write lands only at the new path; an old-shape file found on
// a write is removed in the same operation -- no-old-version-leftover, never on a
// read-only path per Phoenix #5).
const OLD_STAMP = () => path.join(os.homedir(), '.claude', '.coalface-update-check');
const NEW_STAMP = () => path.join(os.homedir(), '.claude', 'coal', 'coalface', 'update-check');

function updateDue(cfg) {
  try {
    if (lc(cfg.updateMode || 'ask') === 'off') return false;
    // Clamp on read: updateCheckDays:0 must NOT mean "nag every session".
    const days = (Number.isInteger(cfg.updateCheckDays) && cfg.updateCheckDays >= 1 && cfg.updateCheckDays <= 365) ? cfg.updateCheckDays : 14;
    let last = 0;
    try { last = Number(String(fs.readFileSync(NEW_STAMP(), 'utf8')).trim()) || 0; } catch {}
    if (!last) { try { last = Number(String(fs.readFileSync(OLD_STAMP(), 'utf8')).trim()) || 0; } catch {} } // read-new-fallback-old
    const now = Date.now();
    if (last && now - last < days * 86400000) return false; // inside the window: not due
    try {
      fs.mkdirSync(path.dirname(NEW_STAMP()), { recursive: true });
      fs.writeFileSync(NEW_STAMP(), String(now)); // schedule: stamp the check now, new home only
      fs.rmSync(OLD_STAMP(), { force: true }); // write-new-drop-old
    } catch {}
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

// AL-2: a clause for a LOCKED (non-auto) language value — '' on auto/absent/unrecognized
// (Phoenix #13 zero-noise: the factory default IS the behaviour, so a directive saying
// "follow the conversation" is pure noise; an unrecognized value clamps to auto exactly
// like modeOf/floorOf above, never a raw pass-through). Values hardcoded here rather than
// imported from scripts/lib/config-schema.mjs — a CJS hook cannot require() an ESM module
// (node/runtime.md §3), and every other clamp in this file (modeOf, floorOf) is already
// self-contained the same way.
//
// Applied to the FINAL non-empty message at BOTH emit sites (main() below,
// hooks/ag-conductor.js after its directiveFor(...) call) — NEVER folded into
// directiveFor alone. The hole that creates: directiveFor returns '' when
// coalfaceMode:off, but the self-update nudge in main() still fires (updateMode is its
// own off-switch, orthogonal) — a lock living only inside directiveFor would silently
// skip that nudge-only message.
// NO `[CoalFace]` PREFIX HERE (F2, INSPECT bounce r29) — the prefix belongs at the CALL
// SITE, exactly like the self-update nudge below (`(msg ? ' ' : '[CoalFace] ') + '...'`).
// A prefix embedded in the return value doubles it whenever the message is already
// non-empty (directive+lock, or nudge+lock) — 3 of 5 reachable states, measured by
// INSPECT. Both call sites (main() below, hooks/ag-conductor.js) supply the prefix the
// same way the nudge does.
const LANGUAGE_VALUES = ['auto', 'th', 'en', 'ja', 'zh', 'es'];
function languageLock(cfg) {
  const v = lc(cfg.language || 'auto');
  if (v === 'auto' || !LANGUAGE_VALUES.includes(v)) return '';
  return `Reply language locked to '${v}'. Translate PROSE only -- commands, paths, identifiers, config keys, tier/effort/grade/model names and severity labels stay VERBATIM.`;
}

function main() {
  let input = {};
  try { const p = JSON.parse(readStdin() || '{}'); if (p && typeof p === 'object' && !Array.isArray(p)) input = p; } catch {}
  const event = input.hook_event_name || input.hookEventName || '';
  // SessionStart ONLY — any other/unknown event stays silent (Phoenix #13 zero-noise).
  if (event !== 'SessionStart') return;

  // probeStrays=true: this SessionStart line is the one place a NON-candidate config is
  // named (UMB-133 hole 1) -- on the already-sanctioned channel, never a new one.
  const { cfg, notices } = loadCfg('claude', true); // this hook only ever runs under Claude Code
  let msg = directiveFor(cfg);
  // mode 'off' -> no directive; self-update is ORTHOGONAL (its own off-switch is
  // updateMode), so it still fires when the discipline is off — the keys are independent.
  if (updateDue(cfg)) {
    msg += (msg ? ' ' : '[CoalFace] ') + '[self-update due] Offer the /coalface:update check: web-check the latest CoalFace tag vs the installed plugin.json version; if newer, OFFER `claude plugin update coalface@coalface`; if current, say "up to date"; if git/network is unavailable, say so and suggest updating manually later (never assume). Consent-gated; the hook only scheduled it.';
  }
  // AL-2: applied to the FINAL message (after the update nudge), never to directiveFor's
  // own text alone — see languageLock's own comment for the hole this closes. Prefix at
  // the call site (F2), same idiom as the update nudge two lines above.
  const lock = languageLock(cfg);
  if (lock) msg += (msg ? ' ' : '[CoalFace] ') + lock;
  // UMB-133: LEGACY / IGNORED notice lines ride LAST, on their own lines (see appendNotices).
  msg = appendNotices(msg, notices);
  if (msg) process.stdout.write(msg); // sanctioned SessionStart context-injection channel
}

// Shared core for the Antigravity adapter (hooks/ag-conductor.js): the config read +
// the directive text + the language-lock clause stay ONE implementation, never forked
// per platform. Exporting does NOT change the spawned-hook behavior (main still runs
// when this file is the entrypoint, below) — the hermetic tests keep spawning the real
// file (hooks-safety §7). `findProjectCfg` exported (r31 UNIT 3, CWK-023) so
// scripts/configure.mjs's WRITE path resolves through the SAME candidate-search-and-
// stop-at-home walk this hook's own READ path already uses -- the identical bridge
// pointer-check.mjs already crosses for AGENT_DIR_ORDER, not a second copy of the walk.
module.exports = { readCfg, loadCfg, appendNotices, directiveFor, languageLock, AGENT_DIR_ORDER, findProjectCfg };

if (require.main === module) {
  try { main(); } catch { /* Phoenix #4: fail-silent, never crash the host */ }
}
// No process.exit() — Phoenix #4 (it would truncate the sanctioned stdout write above).
