// CWK-060 — documentation-vs-schema drift gate, ported from CoalMine's CWK-059/061
// exemplar (`0019e09`). Every config key NAMED on a user-facing surface must RESOLVE in
// config-schema.mjs, or be declared.
//
// WHY: four rooms shipped ship-text naming a key the schema did not have, in one night.
// CoalMine promised `scanEverything` unimplemented; CoalBoard's `applyConsent` help named
// the wrong gate; CoalWash carried a stale `atomicWrite` comment. One class, invisible to
// every gate the flock had.
//
// THE SHAPE IS PORTED; EVERY NUMBER AND LIST BELOW IS THIS ROOM'S OWN, MEASURED HERE.
// Four adopters before this one each found the exemplar's content did not transfer, and
// all three of its port traps were live here too:
//   1. NO `const TRANSLATIONS` BLOCK. This room's notices are template literals and
//      single-quoted returns inside `directiveFor()` plus one appended line in `main()`.
//      The exemplar's `indexOf('const TRANSLATIONS')` returns -1 here, so a straight copy
//      would scan ZERO BYTES and report GREEN. Hence L3 locates by the `[CoalFace]` prefix
//      every user-facing notice in this room actually carries, and hence ZERO_MATCH_FAILS.
//   2. MIXED QUOTING. Line 197 is a backtick template literal, 200 and 217 are
//      single-quoted. A single-quote-only matcher silently skips the first.
//   3. NO END SENTINEL. `directiveFor` is a FUNCTION, not an object literal, so the
//      exemplar's `\n};` end marker does not bound it. L3 is line-scoped instead, and
//      every locator PRINTS what it scanned so a silent locator cannot hide (ADDENDUM 2).
//
// DETECTION RULE — MEASURED ON THIS ROOM'S OWN SURFACES, not inherited:
//     A  naive backticked identifier          38 candidates /  6 real / 32 false = 84% noise
//     B  + internal-capital (the exemplar)    11 candidates /  5 real /  6 false = 55% noise
//     C  + same-line config marker             8 candidates /  5 real /  3 false = 38% noise
//   Rule C is ADOPTED. The same-line-marker filter now has SIX independent verdicts across
//   the flock and no two alike (CoalMine 0 removed → reject · CoalWash 48 → adopt ·
//   CoalBoard 1 → reject on cost · CoalTipple 2 removed but provably dropped 2 REAL keys →
//   reject on evidence · CoalHearth 0, subsumed by its container prefix). HERE it removes 3
//   false positives and — measured, not assumed — drops ZERO of the real keys rule B finds.
//   That measurement's scope is stated honestly: it can only speak for keys rule B sees at
//   all, which is 5 of 6; `bandwidth` is invisible to B and C alike and is covered by L2
//   instead, so the marker filter costs it nothing either.
//
// UNDER-FIRES BY DESIGN — a miss is a bug, a flood is a dead gate. This room has the
// flock's live cry-wolf exhibit in mind (`tripwireMaxLines` firing on compliant code).
const KEY_SHAPE = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const CONFIG_MARKER = /\.coalface\.json|config|Config|key|Key|default/;

// A key that is NAMED but not yet IMPLEMENTED, each with its ticket. Naming an
// unimplemented key HONESTLY is correct behaviour; a gate forbidding it would forbid the
// disclosure. So the honest case is one line here and the dishonest case is a loud FAIL.
// EXPIRY IS BY EVENT, never a date: rule 1 fails an entry that now resolves in the schema;
// rule 2 fails an entry no surface mentions. The list prunes itself.
// EMPTY TODAY, and the empty case is EXERCISED rather than assumed (CoalBoard's rail):
// the tests drive both expiry paths with a synthetic entry.
export const PENDING_KEYS = {};

// NOT a config key and never will be. DELIBERATELY SEPARATE FROM PENDING_KEYS — merging
// "planned" with "not-a-key" is the escape-hatch rot this gate exists against. Inert
// forever by design, but rule 1 still applies in reverse: if one becomes a real schema key
// the entry is a lie and FAILs.
export const NOT_CONFIG = {
  validateValue: 'config-schema.mjs’s own validator function, named in references/admission-control.md',
  injectSteps: 'the Antigravity PreInvocation hook OUTPUT contract field, not a config input',
  additionalContext: 'the RETIRED pilot-era AG output key (v0.3.4 replaced it with injectSteps) — a hook output field, never a config key',
  xN: 'not an identifier at all — the prose "fan-out xN the per-sub baseline" in both conductor notices, where x is the multiplication sign',
};

// A schema key this gate's detection rule CANNOT SEE, declared with the reason it is
// accepted. MANDATORY, NOT OPTIONAL: any schema key failing KEY_SHAPE and not declared
// here is a hard FAIL, so the gate cannot silently ACQUIRE a blind spot.
//
// THIS ROOM'S ENTRY IS `bandwidth`, NOT `language` — and that difference is itself a
// finding. The dispatch predicted `language` by construction, since AGENTS.md 5 Standard
// Systems #2 mandates it flock-wide. THIS SCHEMA HAS NO `language` KEY AT ALL (measured:
// 0 occurrences in config-schema.mjs), so the mandated key is MISSING rather than blind —
// the same gap CoalHearth found. Reported to the chair, not silently patched here: adding
// a schema key is a capability change, not this ticket's scope.
export const BLIND_KEYS = {
  bandwidth: 'a single lowercase word (no internal capital), indistinguishable from prose by shape; covered instead by the L2 key-table pass, where the first cell is a key by the table’s own contract',
};

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
const TICK = new RegExp('`([^`' + BS + 'n]+)`', 'g');
const IDENT = new RegExp(BS + 'b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)' + BS + 'b', 'g');
// A markdown table row whose FIRST cell is a single backticked token. The pipe is a
// character class, never a hand-built escape — one keystroke from meaning ALTERNATION.
const ROW_KEY = new RegExp('^' + BS + 's*[|]' + BS + 's*`([^`|]+)`' + BS + 's*[|]');

function tableRegion(text, heading) {
  const lines = text.split(NL);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(heading));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

// findings: [{ level, msg }] — the shape every other verify.mjs check returns.
// `read` is injected so the caller owns file IO and a test can drive it in-memory.
export function checkConfigKeys({
  schemaKeys,
  mdFiles = [],
  hookFiles = [],
  templateFiles = [],
  keyTables = [],
  read,
  label = (f) => f, // repo-relative display; absolute paths make a finding unreadable
  noticePrefix = '[CoalFace]',
  pending = PENDING_KEYS,
  notConfig = NOT_CONFIG,
  blind = BLIND_KEYS,
  // A locator this room genuinely has no surface for — declared, never inferred (INSPECT F1).
  absentLocators = {},
}) {
  const findings = [];
  const known = new Set(schemaKeys);
  const cov = []; // per-locator coverage, PRINTED every run (ADDENDUM 2 rule 2)

  // AN EMPTY SURFACE LIST IS ITSELF A ZERO-MATCH (INSPECT F1) — and the first cut of this
  // file had the bug it was written to prevent. The per-locator guards read
  // `if (hookFiles.length && sites === 0)`, so the `&& length` clause — there to spare a
  // deliberately-unused locator a false alarm — turned "scanned NOTHING" into "clean".
  // MEASURED by the reviewer: emptying `keyTables` or `templateFiles` produced ZERO FAILs.
  // Sharpest instance: BLIND_KEYS accepts `bandwidth` BECAUSE L2 is its only coverage, so
  // an empty keyTables deletes that coverage while the "blind to 1 DECLARED key" line still
  // prints — asserting coverage that no longer exists.
  //
  // FIXED THE SAME WAY BLIND_KEYS ITSELF WORKS: absence must be DECLARED, never inferred.
  // A locator a room genuinely does not need is one line in `absentLocators` with a reason;
  // an undeclared empty list is a hard FAIL. The distinction the `&& length` clause was
  // reaching for is real — it just has to be written down by a human, not guessed.
  const LOCATORS = { mdFiles, keyTables, hookFiles, templateFiles };
  for (const [name, list] of Object.entries(LOCATORS)) {
    if (list.length || Object.hasOwn(absentLocators, name)) continue;
    findings.push({
      level: 'FAIL',
      msg: 'locator ' + name + ' has an EMPTY surface list — it scans zero bytes and would report '
        + 'clean, which is indistinguishable from finding no drift. Declare it in absentLocators '
        + 'with the reason this room has no such surface, or populate it',
    });
  }
  // A declared blind key's coverage claim must actually exist: BLIND_KEYS points at the
  // key-table pass, so a room declaring one while running no key table is asserting
  // structural coverage it does not have.
  if (Object.keys(blind).length && !keyTables.length) {
    findings.push({
      level: 'FAIL',
      msg: 'BLIND_KEYS declares ' + Object.keys(blind).length + ' key(s) whose stated coverage is the '
        + 'key-table pass, but no key table is configured — the declaration cites coverage that does not exist',
    });
  }

  // PRECONDITION — a hard gate. A schema key KEY_SHAPE cannot see must be DECLARED.
  const invisible = [...known].filter((k) => !KEY_SHAPE.test(k)).sort();
  const accepted = invisible.filter((k) => Object.hasOwn(blind, k));
  if (accepted.length) {
    findings.push({
      level: 'SKIP',
      msg: 'blind to ' + accepted.length + ' DECLARED schema key(s) the prose rule cannot detect: '
        + accepted.join(', ') + ' — covered by the L2 key-table pass instead, so the pass line '
        + 'covers every DETECTABLE key plus these by structure (accepted in BLIND_KEYS)',
    });
  }
  for (const k of invisible) {
    if (Object.hasOwn(blind, k)) continue;
    findings.push({
      level: 'FAIL',
      msg: 'schema key ' + k + ' cannot be detected by the prose rule (no internal capital), so any '
        + 'mention in docs is read and discarded. Declare it in BLIND_KEYS with its reason, or rename it',
    });
  }

  const seen = new Map();
  const unreadable = [];
  const tableReported = new Set();
  const note = (tok, file) => { file = label(file);
    if (!seen.has(tok)) seen.set(tok, new Set());
    seen.get(tok).add(file);
  };

  // Every hand-named surface FAILS INDIVIDUALLY when unreadable (CoalHearth's rail): an
  // all-or-nothing check lets ONE renamed surface drop out behind a green line.
  const readOr = (f) => {
    try { return read(f); } catch {
      unreadable.push(f);
      findings.push({ level: 'FAIL', msg: 'named surface ' + label(f) + ' could not be read — coverage silently lost. Fix the path or remove it from the surface set' });
      return null;
    }
  };

  // L1 — MARKDOWN PROSE. Backticked + internal capital + a config marker on the same line.
  let l1lines = 0, l1hits = 0;
  for (const f of mdFiles) {
    const text = readOr(f);
    if (text === null) continue;
    for (const line of text.split(NL)) {
      l1lines++;
      for (const m of line.matchAll(TICK)) {
        const tok = m[1];
        if (!KEY_SHAPE.test(tok) || !CONFIG_MARKER.test(line)) continue;
        note(tok, f); l1hits++;
      }
    }
  }
  cov.push('L1 ' + mdFiles.length + ' md/' + l1lines + ' lines→' + l1hits);

  // L2 — KEY TABLE, SHAPE-FREE. Inside a declared key table the first cell IS a key by the
  // table's own contract, so POSITION supplies what SHAPE cannot. This is the only path
  // that can see `bandwidth`, which is exactly why BLIND_KEYS points at it.
  let l2rows = 0, l2hits = 0;
  for (const { file, heading } of keyTables) {
    const text = readOr(file);
    if (text === null) continue;
    const region = tableRegion(text, heading);
    if (!region.length) {
      findings.push({ level: 'FAIL', msg: 'key table locator found NO region in ' + label(file) + ' under "' + heading + '" — a locator that matches nothing must fail loudly, never pass quietly (it would scan zero bytes and report clean)' });
      continue;
    }
    for (const ln of region) {
      l2rows++;
      const m = ROW_KEY.exec(ln);
      if (!m) continue;
      const tok = m[1];
      note(tok, file); l2hits++;
      if (known.has(tok) || Object.hasOwn(notConfig, tok) || Object.hasOwn(pending, tok)) continue;
      tableReported.add(tok);
      findings.push({
        level: 'FAIL',
        msg: 'key table ' + label(file) + ' (under "' + heading + '") documents ' + tok + ', which does not resolve '
          + 'in the schema — a table row IS a key claim whatever its shape. Implement it, or declare it',
      });
    }
  }
  cov.push('L2 ' + keyTables.length + ' table(s)/' + l2rows + ' rows→' + l2hits);

  // L3 — HOOK NOTICES, located by the `[CoalFace]` prefix every user-facing notice carries.
  // QUOTE-AGNOSTIC by construction: it scans the LINE, so a template literal, a single-quoted
  // string and a concatenation all read the same. ZERO MATCHES MUST FAIL.
  let l3sites = 0, l3hits = 0;
  for (const f of hookFiles) {
    const text = readOr(f);
    if (text === null) continue;
    for (const line of text.split(NL)) {
      if (!line.includes(noticePrefix)) continue;
      if (/^\s*(\/\/|\*)/.test(line)) continue; // a comment ABOUT a notice is not a notice
      l3sites++;
      // STRIP `${...}` INTERPOLATIONS FIRST. Measured: without this the gate convicts
      // `floorOf` — a local helper whose CALL sits inside the notice's template literal.
      // The user never reads that identifier, only the value it returns, so it is not
      // ship-text at all. Fixed by SHAPE rather than by an allowlist entry: an entry would
      // have to be re-added for every future `${someHelper(...)}`, which is the allowlist
      // rot this design refuses.
      const visible = line.replace(/\$\{[^}]*\}/g, ' ');
      for (const id of visible.matchAll(IDENT)) { if (KEY_SHAPE.test(id[1])) { note(id[1], f); l3hits++; } }
    }
  }
  if (hookFiles.length && l3sites === 0) {
    findings.push({ level: 'FAIL', msg: 'hook notice locator found ZERO sites carrying "' + noticePrefix + '" across ' + hookFiles.length + ' hook(s) — a locator that finds nothing reports clean, which is indistinguishable from no drift. Fix the prefix or the surface set' });
  }
  cov.push('L3 ' + hookFiles.length + ' hook(s)/' + l3sites + ' notice sites→' + l3hits);

  // L4 — SHIPPED CONFIG TEMPLATE, COMMENT HALF ONLY. The JSON half is OUT because
  // verify.mjs already schema-validates it; the COMMENT half is IN because it is ship-text
  // that installs into a user's own config home. That split is CoalTipple's correction and
  // CoalHearth's implementation: "it IS config, already schema-validated" is true of the
  // values and FALSE of the comments, which no check reads.
  let l4lines = 0, l4hits = 0;
  for (const f of templateFiles) {
    const text = readOr(f);
    if (text === null) continue;
    for (const line of text.split(NL)) {
      if (!/^\s*\/\//.test(line)) continue;
      l4lines++;
      for (const id of line.matchAll(IDENT)) { if (KEY_SHAPE.test(id[1])) { note(id[1], f); l4hits++; } }
    }
  }
  if (templateFiles.length && l4lines === 0) {
    findings.push({ level: 'FAIL', msg: 'template locator found ZERO comment lines across ' + templateFiles.length + ' template(s) — scanning nothing and reporting clean' });
  }
  cov.push('L4 ' + templateFiles.length + ' template(s)/' + l4lines + ' comment lines→' + l4hits);

  findings.push({ level: 'SKIP', msg: 'coverage: ' + cov.join(' · ') });

  // THE CHECK. A named token must resolve, or be declared.
  for (const [tok, files] of [...seen].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (known.has(tok) || tableReported.has(tok)) continue;
    if (Object.hasOwn(notConfig, tok) || Object.hasOwn(pending, tok)) continue;
    findings.push({
      level: 'FAIL',
      msg: 'config key ' + tok + ' is named in ' + [...files].sort().join(', ') + ' but does not resolve in the '
        + 'schema — implement it, or declare it in PENDING_KEYS (planned, with its ticket) or NOT_CONFIG (never a key, with its reason)',
    });
  }

  // SELF-CLEANING RULE 1 — a declaration that is no longer true.
  for (const tok of Object.keys(pending)) {
    if (known.has(tok)) findings.push({ level: 'FAIL', msg: 'PENDING_KEYS lists ' + tok + ', but it now resolves in the schema — implemented, so delete the entry' });
  }
  for (const tok of Object.keys(notConfig)) {
    if (known.has(tok)) findings.push({ level: 'FAIL', msg: 'NOT_CONFIG lists ' + tok + ' as never-a-config-key, but it now resolves in the schema — the entry is a lie, delete it' });
  }
  for (const tok of Object.keys(blind)) {
    if (!known.has(tok)) findings.push({ level: 'FAIL', msg: 'BLIND_KEYS declares ' + tok + ', but it is not in the schema at all — the key is gone, delete the entry' });
    else if (KEY_SHAPE.test(tok)) findings.push({ level: 'FAIL', msg: 'BLIND_KEYS declares ' + tok + ' as undetectable, but it now matches the shape rule — the gate can see it, delete the entry' });
  }

  // SELF-CLEANING RULE 2 — a declaration protecting nothing is dead weight. GATED ON A
  // COMPLETE SCAN: a partial scan may not convict a declaration (a 0-hit proves nothing
  // when the scope was incomplete). Degrades to a visible SKIP, never a false accusation.
  if (unreadable.length) {
    findings.push({ level: 'SKIP', msg: 'declaration-pruning not checked: ' + unreadable.length + ' named surface(s) unreadable — a partial scan cannot prove a declaration is dead' });
  } else {
    for (const [tok, why] of [...Object.entries(pending), ...Object.entries(notConfig)]) {
      if (!seen.has(tok)) findings.push({ level: 'FAIL', msg: 'no scanned surface names ' + tok + ' (' + why + ') — the declaration protects nothing, delete it' });
    }
  }

  return findings;
}
