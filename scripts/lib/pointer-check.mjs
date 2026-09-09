// CWK-079 — POINTER gate, CoalFace's adoption. Ship-text names something that cannot be
// reached from a clone.
//
// NOT CWK-060's GATE (scripts/lib/config-keys.mjs). That one resolves config KEYS against
// config-schema.mjs. These are POINTERS -- to a file or a directory -- and nothing resolved
// them here before this module. Same family, different resolver: the key gate asks "is this
// name in the schema", this one asks "is the thing this name points at REACHABLE FROM A
// CLONE".
//
// THREE STATES, NOT TWO. tracked -> silent · GITIGNORED -> FAIL · existing-but-UNTRACKED ->
// FAIL. "Exists" is not "reachable": from any other machine a gitignored path and a missing
// one are indistinguishable, so such a citation was never durable -- not even on the day it
// was written.
//
// ============================================================================
// THIS ROOM HAD NO POINTER GATE AT ALL before this unit (measured: `grep -rn pointer
// scripts/` returned zero). Five sibling rooms already carried one; this is an ADOPTION,
// not a branch port, and the measurement below is what decided it is worth adopting rather
// than declared N/A.
//
// MEASURED ON THIS ROOM'S OWN 15 CANDIDATE SURFACES BEFORE ANY OF IT WAS CHOSEN
// (README.md, CHANGELOG.md, SECURITY.md, CONTRIBUTING.md, PRIVACY.md, PLATFORM-LIMITS.md,
// USAGE-DATA.md, skills/coalface/SKILL.md, its 5 references/*.md, commands/*.md). TWO of
// those 15 (PLATFORM-LIMITS.md, USAGE-DATA.md) are GITIGNORED and were later DROPPED from
// the live surface set at verify.mjs (bounce2 F1) -- a gate asking "reachable from a clone"
// has no business walking a file no cloner can ever open. The live gate therefore reports
// against 13 SHIPPED-AND-TRACKED surfaces, not the 15 named here; the funnel below is a
// point-in-time MEASUREMENT frozen against the original 15, kept as the record of why this
// gate was adopted at all, never re-derived to match the live count. Re-derive live numbers
// with the block in verify.mjs; never quote either set of numbers forward as current.
//
//   738 backticked tokens (fenced code stripped FIRST)
//    -> dropped by SHAPE: no-slash 422 · whitespace 108 · absolute-or-url 50 · glob 10 ·
//       placeholder 5 (595 dropped, 143 survive)
//    -> 143 path-shaped citations: 12 agent-home (the SCANNED project, not ours) · 27
//       out-of-scope (no root match, no sibling) -> 104 IN SCOPE
//    -> 104 = 75 tracked + 28 tracked-dir + 0 untracked + 1 MISSING
//       (7 of the 104 in-scope citations are dot-dir citations)
//
//   THE ONE MISSING IS A REAL SHIP-TEXT DEFECT, NOT AN INSTRUMENT ARTEFACT: CHANGELOG.md
//   cites a GitHub URL tail that lost its host (`.github/tree/main/benchmarks/CoalFace`),
//   shape-passes as a repo path, roots into our tracked `.github/`, and resolves to nothing.
//   This gate is RIGHT to flag it; the fix belongs to ship-text, not to this module (no
//   exemption, no allowlist entry, no shape rule written to make it pass).
//
//   28 OF 104 ARE DIRECTORY CITATIONS, and getting that classification backwards fails a
//   quarter of the population. `git ls-files` lists FILES ONLY -- a directory citation is
//   NEVER a member of the tracked-file set, so `resolve()` below must test containment
//   (a tracked path PREFIXED by the citation) as well as exact membership, or every
//   directory-shaped pointer in this room's own ship-text reads as dead.
//
// ============================================================================
// NAMED BLIND SPOT -- stated as what is UNCOVERED with its measured cost, never as a denial.
//
//   AN UNBACKTICKED PATH IS INVISIBLE. Extraction keys on backticks, so a path named in
//   plain prose is never a candidate.
//
//   THE SYMBOL AND SECTION HALVES ARE NOT MECHANISED, by the chair's ruling on two
//   all-false measurements in sibling rooms (a `file.md` §Heading, or a renamed identifier).
//   Nothing here checks either, and the pass line says so.
//
// ============================================================================
// ADOPTER CONTRACT -- DATA, never LOGIC. Nothing below hardcodes this room's layout; the
// caller supplies its own surfaces, ourRoots, ignoredRoots, agentHomes, hasEntry, resolve
// and pending list, all read out of its own tree.

// A path this room deliberately points at BEFORE it exists. Ships EMPTY, and the empty list
// is a MEASUREMENT (104 of 104 in-scope citations resolve except the one named ship-text
// defect above, which this list must NOT be used to launder), not an omission.
//
// The mechanism ships anyway, with a reason rather than as padding: without an escape hatch
// the first legitimate forward pointer hard-FAILs, and the cheapest way to make a FAIL go
// away is to delete the gate. EVENT-based expiry, same as CWK-060's key gate -- a
// declaration is pruned by what BECOMES TRUE, never by a date nobody re-reads.
export const PENDING_POINTERS = [
  // { path: 'scripts/lib/thing.mjs', reason: 'CWK-000 -- landing next unit' },
];

const GLOB = /[*?[\]{}|]/;
const OUTSIDE = /^([~/]|[A-Za-z]:|[a-z][a-z0-9+.-]*:\/\/)/;
// A `.` or `..` SEGMENT -- never a dot-DIR like `.github`, which is a real name.
const DOTSEG = /(^|\/)\.\.?(\/|$)/;
// A BACKSLASH is not a separator this gate reads. DOTSEG is segment-whole for `/`-delimited
// tokens, and it does not see a BACKSLASH-delimited segment -- so `scripts/..\..\escape.md`
// would survive every shape test and resolve OUTSIDE the repo. Rejecting the character makes
// the invariant unconditional (a citation in our surfaces is `/`-delimited on every platform)
// instead of platform-conditional -- this room's own recorded lesson: resolve-and-contain,
// never segment-scan, because a scan misses `\` on Windows.
const BACKSLASH = /\\/;

// CWK-079 -- looksPathShaped(tok): a SHAPE test for candidate-root DISCOVERY, never for
// judgement. A token surviving pointerCandidates() carries a `/`, but a `/` alone does not
// make it a PATH -- a backticked ratio, `prefer/should`, `try/finally` all reach here too.
// Strip a trailing `:line(-line)?` first, then accept iff the token ends in `/` (a directory
// citation) or its LAST segment carries a `.ext`-shaped suffix.
//
// GATES DISCOVERY ONLY -- feeding deriveIgnoredRoots' candidate-root set below. It is NEVER
// applied inside checkPointers, and it NEVER narrows pointerCandidates itself: a shape-
// rejected token (an extensionless real path like `scripts/lib`) is still a real citation and
// checkPointers keeps resolving it in full. See the NON-LOCALITY property at
// deriveIgnoredRoots, and the pinned regression test in pointer-check.test.mjs.
export function looksPathShaped(tok) {
  const t = tok.replace(/:\d+(-\d+)?$/, '');
  if (t.endsWith('/')) return true;
  return /\.[A-Za-z0-9]{1,10}$/.test(t.split('/').pop());
}

// CWK-079 -- ignored-root discovery, EXISTENCE-INDEPENDENT by design. `.gitignore` is
// TRACKED, so `git check-ignore` answers for an ABSENT path exactly as for a present one --
// the PATTERN is what matters, never what the caller happens to have on local disk. A
// disk-listing probe (`fs.readdirSync(repo)`) is DEAD CODE on a clean clone: a clone carries
// no gitignored files by definition, so that branch runs at zero for every user and every CI
// leg.
//
// `checkIgnore` is INJECTED (a batched `git check-ignore --stdin` call in production, a
// Set-backed stub in tests) so this function stays zero-I/O and unit-testable with no git
// repo required -- the same reason `resolve`/`hasEntry` are injected into checkPointers below.
//
// NOT MENTIONED IN THE PORTED DESIGN, MEASURED HERE: `git check-ignore` querying a bare
// `root/` for a NONEXISTENT root is unsafe on a CRLF `.gitignore` under `core.autocrlf=true`
// (git 2.55.0.windows.5) -- it reports a FALSE POSITIVE for every non-matching nonexistent
// name, against a phantom line reference. The injected `checkIgnore` in verify.mjs works
// around this at the QUERY, not here: it feeds `root/<synthetic-filename>` instead of a bare
// `root/`, which this function never needed to know about -- the injection boundary is
// exactly what let the fix land without touching this module's own contract.
//
// NAMED BOUND (a) -- ROOT-LEVEL MASKING. This room's own `.claude/` and `.agents/` are BOTH
// agent-home roots AND genuinely listed in `.gitignore` (unlike CoalMine's `.github`, which
// is tracked, not gitignored, so the identical bound cost zero there). Agent-home roots are
// held out BEFORE this probe ever runs, so a dead citation rooted in `.claude/`/`.agents/`
// would never reach `ignoredRoots` regardless of whether it is genuinely gitignored here.
// Measured cost on THIS population: ZERO -- none of the 104 in-scope citations are
// agent-home-rooted (agent-home tokens are excluded from scope entirely, upstream of this
// probe), and a citation to `.claude/...`/`.agents/...` in our own ship-text overwhelmingly
// means the SCANNED USER's project, which is the entire reason the exclusion exists. Stated
// as the bound it is, not claimed zero by luck the way CoalMine's is: our root really is
// gitignored, the mask is real, only the measured population against it is empty today.
//
// NAMED BOUND (b) -- NOT-A-PATH-AT-ALL, narrowed at discovery by looksPathShaped, with the
// residue named in both directions: a trailing-slash token is accepted here with no check on
// what precedes it (git answers "not ignored" for a pattern that matches nothing, so this
// costs nothing but a wasted probe); an extensionless real path (`scripts/lib`) no longer
// contributes its OWN first segment to candidateRoots.
//
// THE NON-LOCALITY PROPERTY, and why bound (b)'s residue is not a gap: a shape-rejected token
// is NOT exempt from the check -- it is still probed and can still FAIL the moment ANY OTHER
// path-shaped citation shares its first segment, because ignoredRoots is a per-ROOT set, not
// a per-TOKEN one, and checkPointers judges every in-scope token against it regardless of
// what that token's own shape looked like. Pinned as a two-plant regression test in
// pointer-check.test.mjs.
export function deriveIgnoredRoots({ surfaces = [], agentHomes = new Set(), checkIgnore }) {
  const candidateRoots = new Set();
  for (const s of surfaces) {
    if (typeof s.text !== 'string') continue;
    for (const tok of pointerCandidates(s.text)) {
      if (!looksPathShaped(tok)) continue;
      candidateRoots.add(tok.split('/')[0]);
    }
  }
  let homesHeldOut = 0;
  const toProbe = [];
  for (const root of candidateRoots) {
    if (agentHomes.has(root)) { homesHeldOut++; continue; }
    toProbe.push(root);
  }
  const ignored = typeof checkIgnore === 'function' ? checkIgnore(toProbe) : [];
  return { candidateRoots, toProbe, homesHeldOut, ignoredRoots: new Set(ignored) };
}

// Candidate extraction. Exported so an adopter measures its OWN funnel with this instrument
// rather than re-implementing it and getting different numbers.
export function pointerCandidates(text) {
  const out = [];
  // Fenced code blocks are EXAMPLES, not prose claims about this tree.
  const prose = String(text).replace(/^```[\s\S]*?^```/gm, '');
  for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1];
    if (/\s/.test(tok)) continue;          // a command or a Markdown table row, not a pointer
    if (/[<>]/.test(tok)) continue;        // <placeholder> -- the author already said "not literal"
    if (GLOB.test(tok)) continue;          // a glob names a SET, not a file
    if (!tok.includes('/')) continue;      // a bare filename is the USER's repo's
    if (OUTSIDE.test(tok)) continue;       // absolute, home-relative, or a URL
    if (DOTSEG.test(tok)) continue;        // `../` navigates, it does not NAME, and it escapes
    if (BACKSLASH.test(tok)) continue;     // not a separator this gate reads -- see above
    // A DOT-DIR IS NOT DROPPED HERE. Whether `.github/workflows/ci.yml` is OURS or the
    // scanned project's is TREE knowledge, not text shape, so that decision lives in
    // checkPointers where ourRoots and agentHomes exist.
    out.push(tok);
  }
  return out;
}

// `docs/x.md:12` and `scripts/` both name a real thing; the line suffix and the trailing
// slash are punctuation, not part of the path.
function normalise(tok) {
  return tok.replace(/:\d+(-\d+)?$/, '').replace(/\/+$/, '');
}

export function checkPointers({
  surfaces = [],            // [{ label, text, historyOnly? }]
  ourRoots = new Set(),     // top-level names that belong to THIS repo (from `git ls-files`)
  ignoredRoots = new Set(), // top-level entries this repo gitignores -- FILES AND HIDDEN DIRS
  agentHomes = new Set(),   // dot-dir roots this tool reads INSIDE A USER's tree (derived)
  hasEntry = () => false,   // (relDir, name) => boolean
  resolve,                  // (relPath) => 'tracked' | 'untracked' | 'missing'
  pending = PENDING_POINTERS,
} = {}) {
  const findings = [];
  if (typeof resolve !== 'function') {
    findings.push({ level: 'FAIL', msg: 'pointer check: no resolve() supplied — the gate cannot answer its own question' });
    return { findings, checked: 0 };
  }

  const cited = new Set();
  let checked = 0;

  for (const s of surfaces) {
    if (typeof s.text !== 'string') {
      // NAME what could not be read. A caller that filters unreadable surfaces out first
      // hides its own scope gap — the silent narrowing this family of gates exists against.
      findings.push({ level: 'SKIP', msg: `pointer check could not read ${s.label}` });
      continue;
    }
    // CWK-079 bounce2 1c/F4 — a Map, not a Set: the dedup UNIT stays one finding per
    // surface (the reviewer's own ruling — a per-occurrence report would be noise), but
    // the OCCURRENCE COUNT rides into the FAIL message so a fixer reading the gate output
    // can tell a 1x typo from a 40x one and cannot under-scope the fix.
    const counts = new Map();
    for (const tok of pointerCandidates(s.text)) counts.set(tok, (counts.get(tok) || 0) + 1);
    for (const tok of counts.keys()) {
      const occ = counts.get(tok);
      const occSuffix = occ > 1 ? ` (${occ}× in this file)` : '';
      const first = tok.split('/')[0];
      const norm = normalise(tok);

      // A GITIGNORED ROOT IS THE SHARP CASE, decided WITHOUT resolving and BEFORE `pending`
      // is consulted — deliberately. A declaration can excuse a path that does not exist
      // YET; it can never launder one that exists and is unreachable from a clone.
      if (ignoredRoots.has(first)) {
        cited.add(norm);
        checked++;
        findings.push({
          level: 'FAIL',
          msg: `${s.label} cites \`${tok}\`, which lives under the gitignored \`${first}\` — not reachable from a clone. Cite the durable artefact (a commit SHA, a shipped doc) or commit the file.${occSuffix}`,
        });
        continue;
      }

      // AN AGENT INSTALL HOME NAMES THE SCANNED PROJECT'S TREE, NEVER OURS -- derived from
      // hooks/coalface-conductor.js's own AGENT_DIR_ORDER, never hand-copied here.
      if (agentHomes.has(norm) || [...agentHomes].some((h) => norm.startsWith(h + '/'))) continue;

      // SCOPE — two independent structural tests, either sufficient, neither circular. A
      // repo-root-only rule SILENTLY SKIPS a token whose first segment is not a top-level
      // dir, and a skipped citation is the quieter failure than a wrongly-flagged one.
      const citerDir = s.label.includes('/') ? s.label.slice(0, s.label.lastIndexOf('/')) : '';
      const parentDir = citerDir.includes('/') ? citerDir.slice(0, citerDir.lastIndexOf('/')) : '';
      let base = null;
      if (ourRoots.has(first)) base = '';
      else if (citerDir && hasEntry(citerDir, first)) base = citerDir;
      else if (parentDir && hasEntry(parentDir, first)) base = parentDir;
      if (base === null) continue; // a path into someone else's tree
      cited.add(norm);

      // Published history is never fixed forward: a path correct when written is not a
      // defect now. Such a surface is checked for the gitignored case above and nothing else.
      if (s.historyOnly) continue;

      checked++;
      const rel = base ? base + '/' + norm : norm;
      const state = resolve(rel);
      if (state === 'tracked') continue;
      if (pending.some((p) => p && p.path === rel)) continue;
      if (state === 'untracked') {
        findings.push({ level: 'FAIL', msg: `${s.label} cites \`${tok}\`, which exists here but is UNTRACKED — a clone does not have it. Commit it, or cite the durable artefact.${occSuffix}` });
      } else {
        findings.push({ level: 'FAIL', msg: `${s.label} cites \`${tok}\`, which does not resolve in this repo${occSuffix}` });
      }
    }
  }

  // EVENT-based expiry, both directions. A declaration list nobody prunes becomes a
  // permanent hole with an author's name on it.
  for (const p of pending) {
    if (!p || !p.path) { findings.push({ level: 'FAIL', msg: 'PENDING_POINTERS entry has no path' }); continue; }
    if (!p.reason) { findings.push({ level: 'FAIL', msg: `PENDING_POINTERS declares ${p.path} with no reason — an allowlist of bare strings is a bypass with no author` }); }
    if (resolve(p.path) === 'tracked') {
      findings.push({ level: 'FAIL', msg: `PENDING_POINTERS declares ${p.path} as not-yet-existing, but it now resolves — delete the entry` });
    } else if (!cited.has(p.path)) {
      findings.push({ level: 'FAIL', msg: `PENDING_POINTERS declares ${p.path}, but no in-scope surface cites it — delete the entry` });
    }
  }

  // CWK-079 bounce2 1b/F3 -- `checked` is a proper field, never a property hung on the
  // findings ARRAY: a caller's own `.filter()` (verify.mjs's `hardP` split, e.g.) returns a
  // NEW array with no properties of its own, silently dropping a property attached this
  // way. Returning a plain object makes that class of loss structurally impossible.
  return { findings, checked };
}
