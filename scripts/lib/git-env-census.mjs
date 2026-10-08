// CWK-133 / CWK-136 -- the git-spawn census. Does every `git` child this room spawns take its
// environment from gitTestEnv() (scripts/lib/git-test-env.mjs) or gitEnv() (scripts/secret-gate.mjs), and only from one of them?
//
// It proves SAFETY, not presence. CoalTipple's census (the first exemplar) only tested that an `env:`
// key existed in the call, which passes `env: process.env` -- the exact hole CWK-133 closes: inside a
// linked worktree a git hook exports an absolute GIT_DIR, and a child that inherits it acts on the
// enclosing repository. A git spawn is refused when
//   (a) it carries no `env:` key at all, or
//   (b) its `env:` text mentions process.env AT ALL (a spread, a bare pass-through, a helper beside it), or
//   (c) its `env:` is anything but gitTestEnv(...), gitEnv(...) ALONE or an ALLOWLIST env (08c, allowlistReason below): the whole expression is one call to it, or a bare
//       identifier declared `const NAME = gitEnv(...)` in the same file and not mutated afterwards. An
//       expression that merely CONTAINS gitEnv( -- `base || gitEnv()`, Object.assign(gitEnv(), ...) -- is
//       refused: the helper's presence is not the property, the absence of everything else is.
// A node child (process.execPath) and any other non-git command is not a git spawn and is left alone.
//
// 08c, the ALLOWLIST shape (UMB-456 (2)): an env object built from named keys passes without a pin. See allowlistReason for the three
// conditions. NAMED OPEN for it: the named list and the literal are found in the SAME file only (an imported list or helper is not
// followed and is refused); only the declared name is checked for mutation; a literal key with a template or computed value is read as
// text, not evaluated; and a helper is recognised as an arrow returning an object literal or a function whose first `return {` is the env.
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

// 08c (main's ruling UMB-456 (2)) -- the ALLOWLIST env shape. An env built from NAMED keys is stronger than gitEnv(): nothing the
// parent holds gets in unless it is on the list. It is accepted when its object literal
//   (1) never passes process.env unfiltered: the only spread allowed is Object.fromEntries(<named list>.filter(...)), and the
//       named list is a string-array literal (inline, or a `const NAME = [...]` in the same file) holding no GIT_* name except
//       GIT_CEILING_DIRECTORIES;
//   (2) carries GIT_CONFIG_NOSYSTEM set to the literal '1';
//   (3) sets no other GIT_* key than GIT_CONFIG_NOSYSTEM, GIT_TERMINAL_PROMPT and GIT_CEILING_DIRECTORIES (the last two only
//       NARROW or silence git; GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and the rest stay refused);
// and it has no other spread and no computed key. The literal is found as the env expression itself, a `const NAME = {...}` (never
// mutated afterwards), or the object a `const NAME = (...) => ({...})` / `function NAME(...) { return {...} }` helper returns.
// Recognised by SHAPE: no file name appears here.
const ALLOWED_GIT_KEYS = new Set(['GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT', 'GIT_CEILING_DIRECTORIES']);

// The top-level comma-separated entries of the text between an object literal's braces.
function splitTop(inner) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "'" || c === '"' || c === '`') { for (i++; i < inner.length && inner[i] !== c; i++) if (inner[i] === '\\') i++; continue; }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  const last = inner.slice(start).trim();
  if (last) out.push(last);
  return out;
}

// Does a string-array literal (text of `[...]`) hold only quoted names, none a GIT_* name beyond the allowed narrowing one?
function namedKeysOk(arrText) {
  const items = splitTop(arrText.slice(1, -1));
  return items.every((s) => { const m = /^(['"`])([^'"`$]*)\1$/.exec(s); return m && (!/^GIT_/i.test(m[2]) || m[2] === 'GIT_CEILING_DIRECTORIES'); });
}

function listOk(ref, text) {
  if (ref.startsWith('[')) return closeOf(ref, 0) === ref.length - 1 && namedKeysOk(ref);
  if (!/^[A-Za-z_$][\w$]*$/.test(ref)) return false;
  const d = new RegExp(String.raw`(?:const|let|var)\s+${esc(ref)}\s*=\s*\[`).exec(text);
  if (!d) return false;
  const open = d.index + d[0].length - 1;
  const close = closeOf(text, open);
  return close !== -1 && namedKeysOk(text.slice(open, close + 1)) && !mutated(ref, text.replace(text.slice(d.index, close + 1), ''));
}

// Is `name` changed anywhere in `rest` (delete, Object.assign/defineProperty into it, a member or whole assignment, an in-place array method)?
function mutated(name, rest) {
  const n = '(?<![.\\w$])' + esc(name);
  return new RegExp(String.raw`delete\s+${n}\b|Object\s*\.\s*(?:assign|defineProperty|defineProperties)\(\s*${n}\b|${n}\s*(?:\.|\[)[^=;\n]*=(?![=>])|${n}\s*\.\s*(?:push|splice|unshift|pop|shift)\(|${n}\s*=(?!=)`).test(rest);
}

// null when the object literal `objText` ({...}) is an acceptable allowlist, else the reason.
function allowlistReason(objText, text) {
  if (!objText.startsWith('{') || closeOf(objText, 0) !== objText.length - 1) return 'not an object literal';
  let nosystem = false;
  const why = [];
  const inner = objText.slice(1, -1).replace(/^[ \t]*\/\/.*$/gm, '');
  for (const entry of splitTop(inner)) {
    if (entry.startsWith('...')) {
      const m = /^\.\.\.\s*Object\s*\.\s*fromEntries\(\s*(\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*\.\s*filter\(/.exec(entry);
      if (!m || !listOk(m[1], text)) why.push('a spread that is not Object.fromEntries(<named list>.filter(...))');
      continue;
    }
    const kv = /^(?:(['"`])([^'"`]+)\1|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/.exec(entry);
    if (!kv) { why.push('a computed key or a shorthand'); continue; }
    const key = kv[2] ?? kv[3];
    const val = kv[4].trim();
    if (/^GIT_/i.test(key)) {
      if (!ALLOWED_GIT_KEYS.has(key)) why.push('sets ' + key);
      if (key === 'GIT_CONFIG_NOSYSTEM') { if (val !== "'1'" && val !== '"1"') why.push('GIT_CONFIG_NOSYSTEM is not the literal 1'); else nosystem = true; }
    }
    if (/process\s*\.\s*env(?!\s*[.[])/.test(val)) why.push('a value that is process.env itself');
  }
  if (!nosystem && !why.some((w) => w.startsWith('GIT_CONFIG_NOSYSTEM'))) why.push('carries no GIT_CONFIG_NOSYSTEM');
  return why.length ? [...new Set(why)].join('; ') : null;
}

// The object-literal text behind an env expression, or null: the expression itself, a declared identifier (never mutated), or a helper's return.
function envLiteral(expr, text) {
  if (expr.startsWith('{')) return expr;
  const open = (re) => { const d = re.exec(text); return d ? { d, at: d.index + d[0].length - 1 } : null; };
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const o = open(new RegExp(String.raw`(?:const|let|var)\s+${esc(expr)}\s*=\s*\{`));
    if (!o) return null;
    const close = closeOf(text, o.at);
    if (close === -1) return null;
    const rest = text.slice(0, o.d.index) + text.slice(close + 1);
    return mutated(expr, rest) ? null : text.slice(o.at, close + 1);
  }
  const call = /^([A-Za-z_$][\w$]*)\(/.exec(expr);
  if (!call || closeOf(expr, expr.indexOf('(')) !== expr.length - 1) return null;
  const name = esc(call[1]);
  const arrow = open(new RegExp(String.raw`(?:const|let|var)\s+${name}\s*=\s*\(`));
  if (arrow) {
    const pc = closeOf(text, arrow.at);
    const m = pc === -1 ? null : /^\s*=>\s*\(?\s*\{/.exec(text.slice(pc + 1));
    if (!m) return null;
    const at = pc + 1 + m[0].length - 1;
    const close = closeOf(text, at);
    return close === -1 ? null : text.slice(at, close + 1);
  }
  const fn = open(new RegExp(String.raw`function\s+${name}\s*\(`));
  if (fn) {
    const pc = closeOf(text, fn.at);
    const body = pc === -1 ? null : /^\s*\{/.exec(text.slice(pc + 1));
    if (!body) return null;
    const bodyAt = pc + 1 + body[0].length - 1;
    const bodyClose = closeOf(text, bodyAt);
    const ret = bodyClose === -1 ? null : /return\s*\{/.exec(text.slice(bodyAt, bodyClose));
    if (!ret) return null;
    const at = bodyAt + ret.index + ret[0].length - 1;
    const close = closeOf(text, at);
    return close === -1 ? null : text.slice(at, close + 1);
  }
  return null;
}

// null = an acceptable allowlist env; a string = why not (null-literal -> undefined, "not this shape").
function allowlistEnv(expr, text) {
  const lit = envLiteral(expr, text);
  return lit === null ? undefined : allowlistReason(lit, text);
}

// R14 / CWK-174 -- the house secret scan arrives as byte-equal copies of the published-code template (SERIES-CANON
// "Secret scan": a parity check measures it), so this room cannot route their git spawns through gitEnv() without
// breaking that parity. The two TEST files below spawn git with no cleaned environment (secret-scan.test.mjs) or with a
// spread around gitEnv() (secret-gate.test.mjs). Each is exempt ONLY while its content is exactly the pinned blob: any
// edit, or a template re-sync that changes it, makes the entry a finding again ("re-derive"), so the exemption cannot
// widen or outlive its reason silently. The pin is a git blob id (git hash-object <file>) against the .github canon
// (published-code/scripts for the gate test, overlay-coal-skill/scripts for the release pair; the scanner test's SOURCE is Bankfire since
// LWK2-014, the template lags it). 08c re-pinned the scanner pair at 4433fb56 and a17ae233 (measured: with no pin the census still flags
// both: cleanEnv at secret-scan.test.mjs:593, a gitEnv() spread at secret-gate.test.mjs:40). The real fix belongs to
// the canon (the .github deputy).
//
// 05a: the overlay's release-notes.mjs (.github c9b0550, UMB-443 ruling 2) builds its git env as an EXPLICIT ALLOWLIST (PATH
// and the few keys git needs, plus GIT_CONFIG_NOSYSTEM; it reads --local config only), which is stronger than gitEnv() but
// is not a shape this textual census recognises (it accepts the two helpers by name). So it is pinned at its new blob
// (red-proven: without the pin the census names it); dropping the pin needs the census taught that shape, a redesign
// this unit does not make.
//
// 08b + 08c: the 05a hold on scripts/release-notes.test.mjs (canon a8f3ba69 failed on macOS and under coverage) is LIFTED: .github
// 06c099d fixed the child-key assertion, and the canon test (8cf7e5fd) is adopted. scripts/release-notes.mjs needs NO pin any more:
// the census learned the ALLOWLIST env shape (allowlistReason, below), so its named-key env passes by shape. The canon TEST keeps its
// pin on purpose: its sandboxEnv() redirects HOME/USERPROFILE/TEMP but sets no GIT_CONFIG_NOSYSTEM and spreads a conditional object and
// its `extra` parameter, so it is NOT an allowlist by this rule (red-proven: without the pin the census names both spawns).
export const EXEMPT_CARRIERS = {
  'scripts/secret-scan.test.mjs': '4433fb56bc97d1facc3fb27804e1934c0577115f',
  'scripts/secret-gate.test.mjs': 'a17ae233275c05c6d030f7aa7f0654002b310356',
  'scripts/release-notes.test.mjs': '8cf7e5fd58b89d051395efc53cc0a4f6c86848da',
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
      // 08c: an ALLOWLIST env (see allowlistReason) is a third accepted shape: null = accepted, a string = refused with that reason, undefined = not that shape.
      const al = expr === null || isGitEnvCall(expr) || safeIdentifier(expr, text) ? undefined : allowlistEnv(expr, text);
      if (expr === null) findings.push(`${where} ${m[1]}('git', ...) carries no 'env:' -- it inherits the ambient GIT_* family (CWK-133)`);
      else if (al === null) continue;
      else if (al !== undefined) findings.push(`${where} ${m[1]}('git', ...) env (${expr.slice(0, 40)}) looks like an allowlist but ${al} -- an unfiltered process.env or a stray GIT_* key is refused (CWK-136)`);
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
