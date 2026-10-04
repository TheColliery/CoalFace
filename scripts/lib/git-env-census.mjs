// CWK-133 / CWK-136 -- the git-spawn census. Does every `git` child this room spawns take its
// environment from gitTestEnv() (scripts/lib/git-test-env.mjs) or gitEnv() (scripts/secret-gate.mjs), and only from one of them?
//
// It proves SAFETY, not presence. CoalTipple's census (the first exemplar) only tested that an `env:`
// key existed in the call, which passes `env: process.env` -- the exact hole CWK-133 closes: inside a
// linked worktree a git hook exports an absolute GIT_DIR, and a child that inherits it acts on the
// enclosing repository. A git spawn is refused when
//   (a) it carries no `env:` key at all, or
//   (b) its `env:` text mentions process.env AT ALL (a spread, a bare pass-through, a helper beside it), or
//   (c) its `env:` is anything but gitTestEnv(...) or gitEnv(...) ALONE: the whole expression is one call to it, or a bare
//       identifier declared `const NAME = gitEnv(...)` in the same file and not mutated afterwards. An
//       expression that merely CONTAINS gitEnv( -- `base || gitEnv()`, Object.assign(gitEnv(), ...) -- is
//       refused: the helper's presence is not the property, the absence of everything else is.
// A node child (process.execPath) and any other non-git command is not a git spawn and is left alone.
//
// It is TEXTUAL, not a parser. What it sees: a direct spawnSync / execFileSync / spawn / execFile call whose
// first argument is the literal 'git' (or 'git.exe') in single, double or backtick quotes (a template
// literal with no ${} is still a literal), outside a `//` comment line. NAMED OPEN, on purpose:
//   - a callee reached any other way (an alias `const run = spawnSync`, a property of another object, a
//     wrapper around git defined elsewhere and called by its own name);
//   - git through a shell (`sh -c '... git ...'`, execSync/exec strings, any call with `shell:`), or a
//     command assembled at runtime;
//   - the env identifier mutated through ANOTHER alias, or by a function it is passed to; only direct
//     mutation of the declared name is seen;
//   - a call inside a multi-line block comment whose lines do not start with `*`, or inside a string.
// Pure: a list of { rel, text } in, a report out, so it is unit-tested red-first without a clone.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CALL_RE = /(?<![.\w$])(spawnSync|execFileSync|spawn|execFile)\(\s*(['"`])git(?:\.exe)?\2/g;

function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

// `//` earlier on the same line, or a block-comment `*` line: the match is inside a comment.
function inComment(text, idx) {
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  const before = text.slice(lineStart, idx);
  return before.includes('//') || /^\s*\*/.test(before);
}

// Index of the character that closes the bracket at `open`, string- and escape-aware; -1 if unbalanced.
function closeOf(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

// The `env:` expression text of a call (or the `env` shorthand), null when the call has none.
function envExpr(callText) {
  const m = /[{,]\s*env\s*(:\s*|(?=[,}]))/.exec(callText);
  if (!m) return null;
  if (m[1] === '') return 'env'; // shorthand { env }
  const start = m.index + m[0].length;
  let depth = 0;
  for (let i = start; i < callText.length; i++) {
    const c = callText[i];
    if (c === "'" || c === '"' || c === '`') { for (i++; i < callText.length && callText[i] !== c; i++) if (callText[i] === '\\') i++; continue; }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) { if (depth === 0) return callText.slice(start, i).trim(); depth--; }
    else if (c === ',' && depth === 0) return callText.slice(start, i).trim();
  }
  return callText.slice(start).trim();
}

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// This room has TWO helpers that clean the environment, and a git spawn may use either ALONE: gitTestEnv()
// (scripts/lib/git-test-env.mjs: deletes every GIT_* key, then sets GIT_CEILING_DIRECTORIES; R5 0a614ae) and
// gitEnv() (scripts/secret-gate.mjs's own, byte-equal to the published-code template: keeps only GIT_INDEX_FILE).
const HELPER_RE = /^(?:gitEnv|gitTestEnv)\(/;
function isGitEnvCall(expr) {
  if (!HELPER_RE.test(expr)) return false;
  return closeOf(expr, expr.indexOf('(')) === expr.length - 1;
}

function safeIdentifier(name, text) {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
  const decl = new RegExp(String.raw`(?:const|let|var)\s+${esc(name)}\s*=\s*((?:gitEnv|gitTestEnv)\([^;\n]*\))\s*;`).exec(text);
  if (!decl || !isGitEnvCall(decl[1])) return false;
  const rest = text.replace(decl[0], '');
  const n = esc(name);
  return !new RegExp(String.raw`delete\s+${n}\b|Object\s*\.\s*(?:assign|defineProperty|defineProperties)\(\s*${n}\b|\b${n}\s*(?:\.|\[)[^=;\n]*=(?!=)|\b${n}\s*=(?!=)`).test(rest);
}

// R14 / CWK-174 -- the house secret scan arrives as byte-equal copies of the published-code template (SERIES-CANON
// "Secret scan": a parity check measures it), so this room cannot route their git spawns through gitEnv() without
// breaking that parity. The two TEST files below spawn git with no cleaned environment (secret-scan.test.mjs) or with a
// spread around gitEnv() (secret-gate.test.mjs). Each is exempt ONLY while its content is exactly the pinned blob: any
// edit, or a template re-sync that changes it, makes the entry a finding again ("re-derive"), so the exemption cannot
// widen or outlive its reason silently. The pin is a git blob id (git hash-object <file>) against the .github canon
// (published-code/scripts for the scanner pair, overlay-coal-skill/scripts for the release pair). The real fix belongs to
// the canon (the .github deputy).
//
// 05a: the overlay's release-notes.mjs and its test (.github c9b0550, UMB-443 ruling 2) now build their git env as an
// EXPLICIT ALLOWLIST (PATH and the few keys git needs, plus GIT_CONFIG_NOSYSTEM / a sandbox HOME; the script reads
// --local config only), which is stronger than gitEnv() but is not a shape this textual census recognises (it accepts the
// two helpers by name). So the pins track the NEW blobs instead of dropping out: dropping a pin needs the census taught
// that shape, a redesign this unit does not make (named in the return).
export const EXEMPT_CARRIERS = {
  'scripts/secret-scan.test.mjs': 'a9cb7145e31139ec3c490dd7714df8fa7dc6cf86',
  'scripts/secret-gate.test.mjs': 'f61a33e75a3a420e0de0116f45d2b1fd44936a50',
  'scripts/release-notes.mjs': '674592e0ff25dbdc14a8a4e21e6a598953b90eaa',
  'scripts/release-notes.test.mjs': 'a8f3ba69d6229b571ce89b4373362e93f074fb7b',
};

// The git blob id of `text`, as `git hash-object` prints it for a file holding exactly these bytes.
export function blobId(text) {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + body.length + String.fromCharCode(0)), body])).digest('hex');
}

export function censusGitSpawns(files, exempt = EXEMPT_CARRIERS) {
  const findings = [];
  let spawns = 0;
  for (const { rel, text } of files) {
    if (Object.hasOwn(exempt, rel)) {
      const id = blobId(text);
      if (id === exempt[rel]) continue;
      findings.push(`${rel} is an exempt byte-equal org carrier but its blob id is ${id}, not the pinned ${exempt[rel]} -- re-derive it from .github/templates/published-code/scripts/ (CWK-174)`);
      continue;
    }
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(text))) {
      if (inComment(text, m.index)) continue;
      spawns++;
      const open = text.indexOf('(', m.index);
      const close = closeOf(text, open);
      const where = `${rel}:${lineOf(text, m.index)}`;
      if (close === -1) { findings.push(`${where} unbalanced parens scanning a ${m[1]}('git', ...) call -- census cannot verify it`); continue; }
      const expr = envExpr(text.slice(open, close + 1));
      if (expr === null) findings.push(`${where} ${m[1]}('git', ...) carries no 'env:' -- it inherits the ambient GIT_* family (CWK-133)`);
      else if (/process\s*\.\s*env/.test(expr)) findings.push(`${where} ${m[1]}('git', ...) takes env from process.env -- route it through gitTestEnv() (CWK-136)`);
      else if (!isGitEnvCall(expr) && !safeIdentifier(expr, text)) findings.push(`${where} ${m[1]}('git', ...) env is not gitTestEnv(...) or gitEnv(...) alone (got: ${expr.slice(0, 60)}) -- an expression that merely contains it is refused (CWK-136)`);
    }
  }
  return { findings, spawns, files: files.length };
}

// Real filesystem walk of scripts/**/*.mjs and hooks/*.js, `rel` relative to `repo`.
export function collectSources(repo) {
  const files = [];
  const walk = (d, test) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'fixtures' && e.name !== 'node_modules') walk(p, test); }
      else if (test(e.name)) files.push({ rel: path.relative(repo, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') });
    }
  };
  walk(path.join(repo, 'scripts'), (n) => n.endsWith('.mjs'));
  walk(path.join(repo, 'hooks'), (n) => n.endsWith('.js'));
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}
