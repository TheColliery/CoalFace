// CW-017 — CoalFace's own internal link-check engine. Zero-dep (Phoenix #2), no network:
// this room had NO link-checking capability at all before this unit (`.github/SKILL-REPO-
// PATTERN.md:91`'s MUST names a zero-dep `scripts/lib/link-check.mjs` as the DEFAULT shape;
// CoalLedger's own `link-check.yml` reused its pre-existing AST engine, so nothing there was
// a starting point for a room with no engine at all).
//
// WHAT IT CHECKS, and nothing more: an inline markdown link/image `[text](target)` whose
// TARGET is an internal relative path must resolve to a real file (or directory) in this
// repo, and a TARGET carrying an `#anchor` (same-file `](#slug)` or cross-file
// `](path.md#slug)`) must resolve to a real heading in the target file, using GitHub's own
// heading-to-slug algorithm — lowercase, strip markdown emphasis + punctuation, spaces to
// hyphens, duplicate headings numbered -1/-2/... on repeat (this room's own CHANGELOG.md
// repeats "### Fixed"/"### Added" every release, which is exactly the duplicate-heading
// case a naive first-slug-wins check would mis-flag).
//
// OUT OF SCOPE, named rather than silently missing: an EXTERNAL link (any target carrying a
// URI scheme — http:, https:, mailto:, ...) is never fetched, this is link-ROT-for-the-
// local-repo, not a crawler. A repo-root-relative target (a leading `/`) is likewise out of
// scope (ambiguous between a filesystem root and a rendered-site root) and skipped, never
// flagged. Reference-style links (`[text][ref]` + a `[ref]: url` definition) are unsupported
// — measured zero occurrences across this room's own 13 tracked docs before this module was
// written, so supporting them would be untested machinery for a population of zero.
//
// r33 bounce1 F2 — CODE-SPAN SCOPE, stated honestly: both fence FORMS CommonMark allows
// (``` and ~~~) are neutralized. A 4-space INDENTED code block is NOT recognized — its rules
// (must follow a blank line, must not be a list-item continuation) are real CommonMark
// subtlety this module does not implement, and this room's docs do not use the form. A link
// literal shown inside an indented block would still be checked as if real; declared here
// rather than silently missing.

const FENCE = /^(?:```[\s\S]*?^```|~~~[\s\S]*?^~~~)/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const LINK = /!?\[[^\]]*\]\(([^)]+)\)/g;
const ATX_HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const URI_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// NEUTRALIZE, never remove — a straight `.replace(..., '')` would shift every later
// character's line/column, so a finding's own file:line would point at the wrong line the
// moment a fence or inline span preceded it. Blank out the content, keep every newline: line
// numbers computed by counting '\n' before an index stay correct regardless of what a fence
// or inline span contained.
function neutralize(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text.replace(FENCE, blank).replace(INLINE_CODE, blank);
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}

// GitHub's heading-to-slug algorithm, best-effort. r33 bounce1 F1 (CONFIRMED, fixed): the
// original ASCII-only `\w` strip deleted every Thai/CJK character, so two DISTINCT non-ASCII
// headings both collapsed to "" (then "-1" on the second) — a genuine GitHub anchor a human
// reader clicks was reported broken here. GitHub's OWN algorithm keeps non-ASCII letters and
// digits, so `\p{L}`/`\p{N}` (any script, Unicode-aware) is the class this module actually
// needs to agree with GitHub on the ANCHOR side too — self-consistency alone was insufficient
// the moment a real anchor is typed by hand or pasted from GitHub's own "copy link" feature,
// since neither of those is produced by this function. `\p{M}` (combining Marks) is kept
// alongside them for the SAME reason, found while proving this fix rather than assumed: Thai
// vowel/tone signs (e.g. ` ั` MAI HAN-AKAT, ` ้` MAI THO) are Unicode category Mn, not L —
// an `\p{L}\p{N}` filter alone silently strips them out of the base consonant they combine
// with, corrupting the word (measured: "หัวข้อ" -> "หวขอ", a different, wrong string, not a
// close approximation). Emoji fall in none of L/N/M (Unicode category So/Symbol), so they are
// still stripped exactly as before — GitHub agrees with us there too, and this room's own 30
// live non-ASCII headings are all emoji.
//
// r33 bounce2 M1 (CONFIRMED, fixed) — `\p{M}` alone is TOO WIDE: it also admits
// DEFAULT-IGNORABLE marks GitHub strips. U+FE0F VARIATION SELECTOR-16 is category Mn;
// U+20E3 COMBINING ENCLOSING KEYCAP is category Me — both survive a bare `\p{M}` filter.
// This room's own house-style headings (README's H1 among them, an emoji immediately
// followed by VS16) slugged to a leading INVISIBLE character instead of dropping the
// whole emoji, so the GitHub-correct anchor (e.g. `#coalface`) read as broken here.
// Pre-stripped BEFORE the keep-filter runs, so it never reaches `\p{M}` at all: the
// Variation Selectors block (U+FE00-U+FE0F), ZWJ (U+200D), the Variation Selectors
// Supplement (U+E0100-U+E01EF), and `\p{Me}` (enclosing marks — the keycap combiner).
// `\p{Mn}`/`\p{Mc}` are UNTOUCHED, so Thai vowel/tone marks (the reason `\p{M}` was kept
// at all) are unaffected — measured against both classes together, see the test file.
function slugify(headingText) {
  return headingText
    .toLowerCase()
    .replace(/[`*_~]/g, '')                                    // strip common inline emphasis/code markers
    .replace(/[\uFE00-\uFE0F\u200D\u{E0100}-\u{E01EF}\p{Me}]/gu, '') // strip default-ignorable/enclosing marks BEFORE the keep-filter (r33 bounce2 M1)
    .replace(/[^\p{L}\p{N}\p{M}\- ]+/gu, '')                   // strip everything but a letter/number/mark (any script), hyphen, space
    .trim()
    .replace(/\s+/g, '-');
}

// r33 bounce1 F1b (CONFIRMED, fixed) — GitHub's own "copy link to heading" percent-encodes a
// non-ASCII anchor (the most likely way a real Thai/CJK anchor ever enters our own prose), and
// the raw markdown source can carry EITHER that encoded form or the literal un-encoded text
// typed by hand. Both must compare equal to the (un-encoded) heading slug set. Wrapped:
// `decodeURIComponent` throws `URIError` on a malformed `%` sequence, and a link-check gate
// must never crash on a bad link — it reports the link unresolved instead (falls back to the
// original string, which then correctly fails to match any real slug).
function safeDecodeAnchor(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Every ATX heading in `text`, slugged and DE-DUPLICATED the way GitHub numbers a repeat:
// first occurrence keeps the bare slug, each further repeat gets a trailing -1, -2, ...
export function extractHeadingSlugs(text) {
  const clean = neutralize(text);
  const slugs = new Set();
  const seen = new Map();
  for (const rawLine of clean.split('\n')) {
    const m = ATX_HEADING.exec(rawLine);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  }
  return slugs;
}

// Every inline link/image target in `text`, with its 1-based line number, classified.
export function extractLinks(text) {
  const clean = neutralize(text);
  const out = [];
  for (const m of clean.matchAll(LINK)) {
    const raw = m[1].trim().split(/\s+/)[0]; // drop an optional `"title"` suffix
    if (!raw) continue;
    const hashAt = raw.indexOf('#');
    const target = hashAt === -1 ? raw : raw.slice(0, hashAt);
    const anchor = hashAt === -1 ? null : raw.slice(hashAt + 1);
    out.push({ line: lineAt(clean, m.index), target, anchor });
  }
  return out;
}

// checkFile — pure, DI'd. `resolveTarget(fromFile, target) => absolutePath` lets the caller
// own path joining (Node's `path` module); `stat(absPath) => { isFile, isDir } | null` and
// `readText(absPath) => string | null` are the only I/O this module ever performs, and both
// arrive from the caller so this stays a unit-testable pure checker with no fs import.
export function checkFile(file, text, { resolveTarget, stat, readText }) {
  const findings = [];
  for (const { line, target, anchor } of extractLinks(text)) {
    const decodedAnchor = anchor === null ? null : safeDecodeAnchor(anchor);
    if (target === '') {
      // Same-file anchor: `](#slug)`.
      if (decodedAnchor !== null && !extractHeadingSlugs(text).has(decodedAnchor)) {
        findings.push({ file, line, message: `links to \`#${anchor}\`, which has no matching heading in this file` });
      }
      continue;
    }
    if (URI_SCHEME.test(target)) continue; // external — never fetched
    if (target.startsWith('/')) continue;  // repo-root-relative — ambiguous, out of scope

    const abs = resolveTarget(file, target);
    const info = stat(abs);
    if (!info) {
      findings.push({ file, line, message: `links to \`${target}\`, which does not exist` });
      continue;
    }
    if (anchor === null || info.isDir) continue; // a dir target has no headings to check
    if (!/\.mdx?$/i.test(target)) continue;       // only a markdown target carries headings
    const targetText = readText(abs);
    if (targetText === null) {
      findings.push({ file, line, message: `links to \`${target}#${anchor}\`, but \`${target}\` could not be read` });
      continue;
    }
    if (!extractHeadingSlugs(targetText).has(decodedAnchor)) {
      findings.push({ file, line, message: `links to \`${target}#${anchor}\`, which has no matching heading in \`${target}\`` });
    }
  }
  return findings;
}

// checkFiles — batch entry, DI'd exactly like checkFile. Never throws on one bad file;
// an unreadable input is a finding, not a crash (scripts-quality.md §1: a gate wraps every
// per-item check so one corrupt input yields a clean line, not a stack trace).
export function checkFiles(files, { readText, resolveTarget, stat }) {
  const all = [];
  for (const file of files) {
    const text = readText(file);
    if (text === null) { all.push({ file, line: 0, message: 'could not be read' }); continue; }
    all.push(...checkFile(file, text, { resolveTarget, stat, readText }));
  }
  return all;
}
