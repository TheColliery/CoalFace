// CWK-133 / CWK-136 -- the git-spawn census. Does every `git` child this room spawns take its environment from a trusted helper
// (gitTestEnv() in scripts/lib/git-test-env.mjs, gitEnv() in scripts/lib/git-env.mjs or scripts/secret-gate.mjs) or from an
// ALLOWLIST env it can read whole, and from nothing else?
//
// It proves SAFETY, not presence. CoalTipple's census (the first exemplar) only tested that an `env:` key existed in the call, which
// passes `env: process.env` -- the exact hole CWK-133 closes: inside a linked worktree a git hook exports an absolute GIT_DIR, and a
// child that inherits it acts on the enclosing repository.
//
// THE RULE (main UMB-456 (2), the chief's 08c ruling D6, extended by the 08d witness list `scratchpad/dispatch/08d-census-witness-list.md`).
// A git spawn's env is SAFE when it is
//   (i)  gitEnv(...) / gitTestEnv(...) ALONE, where the NAME is the trusted helper: the file defines neither name itself, or the
//        file IS one of TRUSTED_DEFINERS at its pinned blob, or it imports the name from one of them. A file-local helper that merely
//        carries the name (F42) is refused; trusting the name is the hole.
//   (ii) an ALLOWLIST: an object literal (inline, in a `const NAME = {...}` declared once and used only in env slots and property
//        reads, or returned by a same-file helper with exactly one `return`) that
//          - reads process.env only one named key at a time (`process.env.X`, or `process.env[k]` inside the one allowed spread
//            `...Object.fromEntries(<named list>.filter(cb)[.map(cb)])`), never the object whole;
//          - carries the literal `GIT_CONFIG_NOSYSTEM: '1'`, once;
//          - names no GIT_* key except GIT_CONFIG_NOSYSTEM, GIT_TERMINAL_PROMPT and GIT_CEILING_DIRECTORIES (each only narrows git),
//            in the exact case, in its keys and in the named list;
//          - has no other spread, no computed key, no shorthand key, no nested object, no duplicate key.
// Anything the census cannot read whole is a FINDING, never a silent pass (fail closed). A NARROWER grammar than the language allows is
// the design: the census refuses what it cannot read.
//
// HOW IT READS (08d). Source text goes through scripts/lib/js-skeleton.mjs first: comments, strings, templates and regex bodies are
// blanked, so brackets, commas and identifiers are found on the skeleton with no quote model of this file's own (F41, a regex holding a
// quote). Literal values are read from the original text at the same index. A file the lexer cannot read whole is a finding.
//
// It is still TEXTUAL, not a parser. What it sees: a direct spawnSync / execFileSync / spawn / execFile call whose first argument is the
// literal 'git' (or 'git.exe') in single, double or backtick quotes, in code (not a comment or a string). NAMED OPEN, on purpose:
//   - a callee reached any other way (an alias `const run = spawnSync`, a property of another object, a wrapper around git defined
//     elsewhere and called by its own name), git through a shell (`sh -c`, execSync/exec strings, `shell:`), a command assembled at runtime;
//   - an options object that is not an object literal in the call (`spawnSync('git', a, opts)` is reported as carrying no `env:`);
//   - a member of a callback parameter that reaches the whole environment by a route this file does not know (`k.constructor...`);
//   - a regex written after `)` or `}`, which the lexer reads as a division.
// Pure: a list of { rel, text } in, a report out, so it is unit-tested red-first without a clone.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { skeleton, closeAt, splitTop, BLANK } from './js-skeleton.mjs';

const CALL_RE = /(?<![.\w$])(spawnSync|execFileSync|spawn|execFile)\(\s*(['"`])git(?:\.exe)?\2/g;
const WS = '[\\s' + BLANK + ']';
const re = (src, flags = '') => new RegExp(src.replaceAll('~', WS), flags); // `~` in a pattern is whitespace-or-BLANK
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const ALLOWED_GIT_KEYS = new Set(['GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT', 'GIT_CEILING_DIRECTORIES']);
const LIST_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const VALUE_FORBIDDEN = new Set(['Object', 'Reflect', 'globalThis', 'require', 'import', 'eval', 'Function']);
const CB_WORDS = new Set(['undefined', 'null', 'true', 'false', 'in', 'typeof', 'Boolean', 'String', 'length', 'startsWith', 'endsWith', 'includes', 'test', 'toUpperCase', 'toLowerCase']);
const NOT_A_CALLEE = new Set(['function', 'if', 'for', 'while', 'switch', 'catch', 'return']);

// 08d F42: the files that DEFINE the trusted helpers. A call to gitEnv()/gitTestEnv() is trusted only when the file defining the name
// is one of these at its pinned blob, or the file imports the name from one of them. Editing one of them is a deliberate step: re-pin it
// here in the same commit (the census reports the mismatch as its own finding). `names` says which helper each file may export.
export const TRUSTED_DEFINERS = {
  'scripts/lib/git-env.mjs': { blob: 'fae8cf9b210719e017369343633522cfda6433af', names: ['gitEnv'] },
  'scripts/lib/git-test-env.mjs': { blob: '7e12506c6ce1dc89868cafc07f75f1f6315b4f05', names: ['gitTestEnv'] },
  'scripts/secret-gate.mjs': { blob: '856956a1cca6f716e5507f6c23ac90ed34cbbe5f', names: ['gitEnv'] },
};

// ---------------------------------------------------------------------------------------------------------------- skeleton helpers
const isWs = (ch) => ch === undefined || /[\s\u0001]/.test(ch);
function prevSig(S, i) { let p = i - 1; while (p >= 0 && isWs(S[p])) p--; return p; }
function nextSig(S, i) { let p = i; while (p < S.length && isWs(S[p])) p++; return p; }
function trimRange(S, a, b) { let x = a; let y = b; while (x < y && isWs(S[x])) x++; while (y > x && isWs(S[y - 1])) y--; return [x, y]; }
function occurrences(S, name) {
  const out = [];
  const r = new RegExp('(?<![\\w$])' + esc(name) + '(?![\\w$])', 'g');
  let m;
  while ((m = r.exec(S))) out.push(m.index);
  return out;
}
const isMember = (S, i) => { const p = prevSig(S, i); return S[p] === '.' && S.slice(Math.max(0, p - 2), p + 1) !== '...'; };
const isKey = (S, i, len) => { const p = prevSig(S, i); const n = nextSig(S, i + len); return (S[p] === '{' || S[p] === ',') && S[n] === ':'; };
// The brackets still open at `pos` (indices, outermost first).
function openStack(S, pos) {
  const stack = [];
  for (let i = 0; i < pos; i++) {
    const c = S[i];
    if ('({['.includes(c)) stack.push(i);
    else if (')}]'.includes(c)) stack.pop();
  }
  return stack;
}
const enclosing = (S, pos) => { const st = openStack(S, pos); return st.length ? st[st.length - 1] : -1; };
// The brace block a declaration at `pos` lives in: [start, end] of the innermost enclosing { }, or the whole file.
function blockOf(S, pos) {
  const o = [...openStack(S, pos)].reverse().find((k) => S[k] === '{');
  return o === undefined ? [0, S.length] : [o, closeAt(S, o)];
}
const importSpec = (T, q) => T.slice(q, T.indexOf(T[q - 1], q));

// Facts about a file the checks share: the names that mean `process`, the names bound to the whole process.env.
function fileFacts(S, T) {
  const procNames = new Set(['process']);
  const envAliases = new Set();
  const importRe = /\bimport\b([^;'"`]*?)\bfrom\b[\s\u0001]*(['"])/g;
  let m;
  while ((m = importRe.exec(S))) {
    const spec = importSpec(T, m.index + m[0].length);
    if (spec !== 'node:process' && spec !== 'process') continue;
    const clause = m[1];
    const def = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (def) procNames.add(def[1]);
    const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) procNames.add(ns[1]);
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) for (const part of named[1].split(',')) { const mm = /^\s*env(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(part); if (mm) envAliases.add(mm[1] ?? 'env'); }
  }
  const procAlt = [...procNames].map(esc).join('|');
  const viaDot = re(String.raw`(?:const|let|var)~+([A-Za-z_$][\w$]*)~*=~*(?:globalThis~*\.~*)?(?:${procAlt})~*(?:\.~*env|\[~*(['"])~*env~*\2~*\]|\?\.~*env)(?![\w$])`, 'g');
  while ((m = viaDot.exec(S))) envAliases.add(m[1]);
  const destructured = re(String.raw`(?:const|let|var)~*\{([^}]*)\}~*=~*(?:${procAlt})(?![\w$.])`, 'g');
  while ((m = destructured.exec(S))) for (const part of m[1].split(',')) { const mm = /^\s*env(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part); if (mm) envAliases.add(mm[1] ?? 'env'); }
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of [...envAliases]) {
      const chain = re(String.raw`(?:const|let|var)~+([A-Za-z_$][\w$]*)~*=~*${esc(a)}~*(?:[;,\n]|$)`, 'g');
      while ((m = chain.exec(S))) if (!envAliases.has(m[1])) { envAliases.add(m[1]); grew = true; }
    }
  }
  return { procNames, envAliases };
}

// ---------------------------------------------------------------------------------------------------------------- the trusted names (F42)
function resolveSpec(rel, spec) {
  if (!spec.startsWith('.')) return null;
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const out = [];
  for (const part of (dir ? dir + '/' + spec : spec).split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}
// null = `name` as this file uses it is the trusted helper (or is not declared at all, so a call to it cannot run); a string = why not.
// ponytail: 59 lines at declaration -- the import scan, the definition scan and the verdict read the same occurrence list; split they would each rescan the file.
function untrustedName(c, name) {
  const { S, T, rel, definers } = c;
  const imports = [];
  const spans = [];
  const importRe = /\bimport\b([^;'"`]*?)\bfrom\b[\s\u0001]*(['"])/g;
  let m;
  while ((m = importRe.exec(S))) {
    const q = m.index + m[0].length;
    spans.push([m.index, q]);
    const spec = importSpec(T, q);
    const named = /\{([^}]*)\}/.exec(m[1]);
    if (named) for (const part of named[1].split(',')) {
      const mm = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (mm && (mm[2] ?? mm[1]) === name) imports.push({ imported: mm[1], spec });
    }
    if (new RegExp('(?:^|[\\s,*]|as\\s)' + esc(name) + '(?![\\w$])').test(m[1].replace(/\{[^}]*\}/, ''))) imports.push({ imported: '*', spec });
  }
  // A gate entry imports its libs dynamically (node/runtime.md section 1): `const { gitEnv } = await import(<path built from literal segments>)`.
  // The segments are read from the original text and joined; the import names the trusted definer when they end in its path.
  const dynRe = re(String.raw`(?:const|let|var)~*\{([^}]*)\}~*=~*await~+import~*\(`, 'g');
  while ((m = dynRe.exec(S))) {
    const open = m.index + m[0].length - 1;
    const close = closeAt(S, open);
    if (close === -1) continue;
    spans.push([m.index, open]);
    const segs = [...T.slice(open, close).matchAll(/(['"])([^'"\\\n]*)\1/g)].map((x) => x[2]);
    const spec = segs.join('/');
    for (const part of m[1].split(',')) {
      const mm = /^\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (mm && (mm[2] ?? mm[1]) === name) imports.push({ imported: mm[1], spec, dynamic: true });
    }
  }
  let defs = 0;
  let other = false;
  for (const i of occurrences(S, name)) {
    if (spans.some(([a, b]) => i >= a && i < b)) continue;
    if (isMember(S, i) || isKey(S, i, name.length)) continue;
    if (re(String.raw`(?:function~*\*?~*|(?:const|let|var|class)~+)$`).test(S.slice(0, i))) { defs++; continue; }
    const n = nextSig(S, i + name.length);
    if (S[n] === '(') continue; // a call
    if (S[n] === '=' && S[n + 1] !== '=' && S[n + 1] !== '>') { defs++; continue; }
    other = true;
  }
  if (other) return `${name} is used as a value, so it may be a parameter, an alias or a destructured binding the census cannot follow`;
  if (defs + imports.length > 1) return `${name} is defined or imported more than once in this file`;
  if (defs === 1) {
    const d = definers[rel];
    if (d && d.names.includes(name) && d.blob === blobId(T)) return null;
    return `this file defines its own ${name}(), which is not the trusted helper (a file-local helper carrying the name is refused: trusting the name is the hole)`;
  }
  if (imports.length === 1) {
    const { imported, spec, dynamic } = imports[0];
    const target = dynamic ? Object.keys(definers).find((k) => spec === k) : resolveSpec(rel, spec);
    const d = target && definers[target];
    if (imported === name && d && d.names.includes(name)) return null;
    return `${name} is imported from ${spec}, which is not a trusted definer`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- the allowlist literal
const STRING_ENTRY = new RegExp('^([\'"])' + BLANK + '*\\1$');
// Reasons a string-array interior [a, b) is not a plain list of quoted names; [] when it is.
function listElementReasons(c, a, b) {
  const why = [];
  for (const [x, y] of splitTop(c.S, a, b)) {
    const [s, e] = trimRange(c.S, x, y);
    if (!STRING_ENTRY.test(c.S.slice(s, e))) { why.push('a named-key list entry that is not one plain quoted name'); continue; }
    const name = c.T.slice(s + 1, e - 1);
    if (/^GIT_/i.test(name) && name !== 'GIT_CEILING_DIRECTORIES') why.push(`the named list holds ${name}`);
  }
  return why;
}
// The interior [a, b) of the array behind a list reference (an inline [..] at `refA`, or a `const NAME = [..]` declared once and never
// mutated), or { reasons } when it cannot be read.
function listInterior(c, ref, refA) {
  const { S } = c;
  if (ref.startsWith('[')) return { a: refA + 1, b: refA + ref.length - 1, reasons: [] };
  const decls = [];
  for (const i of occurrences(S, ref)) {
    if (isMember(S, i) || isKey(S, i, ref.length)) continue;
    const n = nextSig(S, i + ref.length);
    if (re(String.raw`(?:const|let|var)~+$`).test(S.slice(0, i)) && S[n] === '=' && S[n + 1] !== '=') { decls.push(i); continue; }
    const dot = S[n] === '.' ? /^\.[\s\u0001]*([A-Za-z_$][\w$]*)/.exec(S.slice(n)) : null;
    if (dot && !LIST_MUTATORS.has(dot[1])) continue;
    if (S[n] === '[') {
      const e = closeAt(S, n);
      if (e !== -1 && !re('^~*(?:=(?!=)|[-+*/%&|^]=|\\+\\+|--)').test(S.slice(e + 1))) continue;
    }
    return { reasons: [`the named list ${ref} is used in a way the census cannot read (a mutation, an alias or an argument)`] };
  }
  if (decls.length !== 1) return { reasons: [decls.length ? `the named list ${ref} is declared more than once` : `the named list ${ref} is not declared in this file`] };
  const open = nextSig(S, nextSig(S, decls[0] + ref.length) + 1);
  if (S[open] !== '[') return { reasons: [`the named list ${ref} is not an array literal`] };
  const close = closeAt(S, open);
  if (close === -1) return { reasons: ['unbalanced list'] };
  return { a: open + 1, b: close, reasons: [] };
}
// A spread entry [a, b): only ...Object.fromEntries(<list>.filter(cb)[.map(cb)]) with nothing after the closing parenthesis.
function spreadReasons(c, a, b) {
  const { S } = c;
  const m = re('^\\.\\.\\.~*Object~*\\.~*fromEntries~*\\(').exec(S.slice(a, b));
  if (!m) return ['a spread that is not Object.fromEntries(<named list>.filter(...))'];
  const p = a + m[0].length - 1;
  const q = closeAt(S, p);
  if (q === -1 || q !== b - 1) return ['something follows the closing parenthesis of the spread, or it is unbalanced'];
  const [s0, e] = trimRange(S, p + 1, q);
  let s = s0;
  let ref;
  if (S[s] === '[') {
    const cl = closeAt(S, s);
    if (cl === -1 || cl >= e) return ['unbalanced list in the spread'];
    ref = S.slice(s, cl + 1);
    s = cl + 1;
  } else {
    const id = /^[A-Za-z_$][\w$]*/.exec(S.slice(s, e));
    if (!id) return ['the spread does not start from a named list'];
    ref = id[0];
    s += ref.length;
  }
  const why = [];
  const li = listInterior(c, ref, s0);
  why.push(...li.reasons);
  if (!li.reasons.length) why.push(...listElementReasons(c, li.a, li.b));
  const chain = [];
  while (s < e) {
    const mm = re('^~*\\.~*(filter|map)~*\\(').exec(S.slice(s, e));
    if (!mm) { why.push('the spread chains something other than .filter(...) and .map(...)'); break; }
    const po = s + mm[0].length - 1;
    const pc = closeAt(S, po);
    if (pc === -1 || pc >= e) { why.push('unbalanced callback'); break; }
    chain.push(mm[1]);
    why.push(...callbackReasons(c, po + 1, pc));
    s = pc + 1;
  }
  if (!why.length && chain.join() !== 'filter' && chain.join() !== 'filter,map') why.push('the spread chain is not .filter(...) or .filter(...).map(...)');
  return why;
}
// A callback inside the spread may read process.env only as process.env[param], process.env.NAME or `param in process.env`.
function callbackReasons(c, a, b) {
  const { S } = c;
  const body = S.slice(a, b);
  const params = new Set();
  for (const m of body.matchAll(/\(([^()]*)\)[\s\u0001]*=>|([A-Za-z_$][\w$]*)[\s\u0001]*=>/g)) {
    const list = m[1] ?? m[2];
    if (list.includes('=')) return ['a callback parameter with a default value'];
    for (const id of list.matchAll(/[A-Za-z_$][\w$]*/g)) params.add(id[0]);
  }
  if (body.includes('{')) return ['an object or block inside a callback'];
  const why = [];
  for (const m of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)/g)) {
    const t = m[1];
    const at = a + m.index;
    if (c.facts.procNames.has(t)) {
      const rest = S.slice(at + t.length);
      const keyed = re(String.raw`^~*\.~*env~*(?:\[~*([A-Za-z_$][\w$]*)~*\]|\.~*[A-Za-z_$])`).exec(rest);
      const inForm = re(String.raw`^~*\.~*env(?![\w$])`).test(rest) && re(String.raw`(?<![\w$])in~+$`).test(S.slice(0, at));
      if ((keyed && (keyed[1] === undefined || params.has(keyed[1]))) || inForm) continue;
      why.push('process.env read other than one named key at a time');
    } else if (c.facts.envAliases.has(t)) why.push(`${t} is the whole process.env`);
    else if (!params.has(t) && !CB_WORDS.has(t)) why.push(`a callback uses ${t}`);
  }
  return why;
}
// A plain `key: value` entry's value [a, b): no nested object, spread, forbidden global, or whole process.env.
function valueReasons(c, a, b) {
  const { S } = c;
  const body = S.slice(a, b);
  if (/[{]|\.\.\./.test(body)) return ['a value that is an object or a spread'];
  const why = [];
  for (const m of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)/g)) {
    const t = m[1];
    const rest = S.slice(a + m.index + t.length);
    if (c.facts.procNames.has(t)) {
      if (re('^~*\\.~*env(?![\\w$])').test(rest)) {
        if (!re(String.raw`^~*\.~*env~*(?:\.~*[A-Za-z_$]|\[~*[A-Za-z_$][\w$]*~*\])`).test(rest)) why.push('a value that is process.env itself');
      } else if (re('^~*(?:\\[|\\?\\.)').test(rest)) why.push('process reached by an index or an optional chain');
    } else if (c.facts.envAliases.has(t)) why.push(`a value that is ${t}, the whole process.env`);
    else if (VALUE_FORBIDDEN.has(t)) why.push(`a value that uses ${t}`);
  }
  return why;
}
// One `key: value` / shorthand entry [a, b) of an object literal, the key read from the original text; null for anything else.
function parseEntry(c, a, b) {
  const [s, e] = trimRange(c.S, a, b);
  const m = /^(?:(['"])([^'"\\\n]*)\1|([A-Za-z_$][\w$]*))\s*:/.exec(c.T.slice(s, e));
  if (m) return { key: m[2] ?? m[3], valA: s + m[0].length, valB: e };
  const bare = /^[A-Za-z_$][\w$]*$/.exec(c.T.slice(s, e));
  if (bare && c.S.slice(s, e) === bare[0]) return { key: bare[0], shorthand: true, valA: s, valB: e };
  return null;
}
// Reasons the object literal at [a, b] (S[a] is its {, S[b] its }) is not an acceptable allowlist; [] when it is.
function literalReasons(c, a, b) {
  const { S, T } = c;
  if (S[a] !== '{' || closeAt(S, a) !== b) return ['not an object literal'];
  const why = [];
  const seen = new Set();
  let nosystem = false;
  for (const [x, y] of splitTop(S, a + 1, b)) {
    const [s, e] = trimRange(S, x, y);
    if (S.startsWith('...', s)) { why.push(...spreadReasons(c, s, e)); continue; }
    const ent = parseEntry(c, x, y);
    if (!ent || ent.shorthand) { why.push('a computed key or a shorthand'); continue; }
    const lower = ent.key.toLowerCase();
    if (seen.has(lower)) why.push(`${ent.key} is set twice`);
    seen.add(lower);
    if (/^GIT_/i.test(ent.key) && !ALLOWED_GIT_KEYS.has(ent.key)) why.push(`sets ${ent.key}`);
    if (ent.key === 'GIT_CONFIG_NOSYSTEM') {
      const v = T.slice(ent.valA, ent.valB).trim();
      if ((v === "'1'" || v === '"1"') && S.slice(ent.valA, ent.valB).trim() === v[0] + BLANK + v[0]) nosystem = true;
      else why.push('GIT_CONFIG_NOSYSTEM is not the literal 1');
    }
    why.push(...valueReasons(c, ent.valA, ent.valB));
  }
  if (!nosystem && !why.some((w) => w.startsWith('GIT_CONFIG_NOSYSTEM'))) why.push('carries no GIT_CONFIG_NOSYSTEM');
  return [...new Set(why)];
}

// ---------------------------------------------------------------------------------------------------------------- env expressions
// A same-file helper `name(...)` that returns one object literal: { a, b } of the literal, or { reason }.
function helperLiteral(c, name) {
  const { S } = c;
  let defs = 0;
  let defAt = -1;
  for (const i of occurrences(S, name)) {
    if (isMember(S, i) || isKey(S, i, name.length)) continue;
    const n = nextSig(S, i + name.length);
    if (re(String.raw`(?:function~*\*?~*|(?:const|let|var|class)~+)$`).test(S.slice(0, i)) || (S[n] === '=' && S[n + 1] !== '=' && S[n + 1] !== '>')) { defs++; defAt = i; }
  }
  if (defs !== 1) return { reason: defs ? `${name}() is defined more than once in this file` : `${name}() is a call the census cannot follow (not defined in this file: define it here or pin the file)` };
  let p = nextSig(S, defAt + name.length);
  let bodyA;
  if (S[p] === '=') {
    p = nextSig(S, p + 1);
    if (S.startsWith('async', p)) p = nextSig(S, p + 5);
    if (S[p] !== '(') return { reason: `${name} is not a function with a parameter list` };
    const pc = closeAt(S, p);
    const arrow = pc === -1 ? null : re('^~*=>~*').exec(S.slice(pc + 1));
    if (!arrow) return { reason: `${name} is not an arrow function` };
    bodyA = pc + 1 + arrow[0].length;
    if (S[bodyA] === '(') {
      const inner = nextSig(S, bodyA + 1);
      const ic = S[inner] === '{' ? closeAt(S, inner) : -1;
      if (ic === -1 || nextSig(S, ic + 1) !== closeAt(S, bodyA)) return { reason: `${name} returns something other than one object literal` };
      return { a: inner, b: ic };
    }
  } else {
    if (S[p] !== '(') return { reason: `${name} is not a function` };
    const pc = closeAt(S, p);
    bodyA = pc === -1 ? -1 : nextSig(S, pc + 1);
  }
  if (bodyA === -1 || S[bodyA] !== '{') return { reason: `${name} has no block or literal body` };
  const bodyB = closeAt(S, bodyA);
  const returns = bodyB === -1 ? [] : [...S.slice(bodyA, bodyB).matchAll(/(?<![\w$.])return(?![\w$])/g)];
  if (returns.length !== 1) return { reason: `${name}() has ${returns.length} return statements (it must have exactly one, returning the literal)` };
  const lit = nextSig(S, bodyA + returns[0].index + 6);
  const lc = S[lit] === '{' ? closeAt(S, lit) : -1;
  if (lc === -1) return { reason: `${name}() does not return an object literal` };
  return { a: lit, b: lc };
}
// Why an identifier used as a spawn's env is not safe, or null. EVERY occurrence of the name in the file is read.
function identifierReason(c, name, at) {
  const { S } = c;
  if (c.facts.envAliases.has(name)) return `${name} is the whole process.env`;
  let decl = -1;
  let decls = 0;
  for (const i of occurrences(S, name)) {
    if (isMember(S, i) || isKey(S, i, name.length)) continue; // `.name`, or a property KEY `{ name: ... }`
    const n = nextSig(S, i + name.length);
    const before = S.slice(0, i);
    if (re(String.raw`(?:const|let|var)~+$`).test(before) && S[n] === '=' && S[n + 1] !== '=') { decls++; decl = i; continue; }
    if (re(String.raw`[{,]~*env~*:~*$`).test(before)) continue; // the env: slot
    const p = prevSig(S, i);
    if (name === 'env' && (S[p] === '{' || S[p] === ',') && (S[n] === ',' || S[n] === '}')) {
      // the shorthand slot `{ env }`: only inside a CALL's argument object, never a destructuring or a parameter pattern
      const o = enclosing(S, i);
      const cl = o !== -1 && S[o] === '{' ? closeAt(S, o) : -1;
      const pp = cl === -1 ? -1 : enclosing(S, o);
      const calleeEnd = pp !== -1 && S[pp] === '(' ? prevSig(S, pp) : -1;
      const callee = calleeEnd === -1 ? null : /[A-Za-z_$][\w$]*$/.exec(S.slice(0, calleeEnd + 1));
      const afterObj = cl === -1 ? '' : S.slice(cl + 1);
      const afterCall = pp === -1 || closeAt(S, pp) === -1 ? '' : S.slice(closeAt(S, pp) + 1);
      const pattern = re('^~*=(?!=)').test(afterObj) || re(String.raw`(?:const|let|var)~*$`).test(S.slice(0, o)) || re('^~*(?:=>|\\{)').test(afterCall);
      if (callee && !NOT_A_CALLEE.has(callee[0]) && !pattern) continue;
      return `${name} appears in a destructuring or a parameter list`;
    }
    if (re(String.raw`(?:delete|\+\+|--|\.\.\.)~*$`).test(before)) return `${name} is deleted, incremented or spread`;
    const read = /^[\s\u0001]*(?:\.[\s\u0001]*[A-Za-z_$][\w$]*|\[[^\]]*\])/.exec(S.slice(i + name.length));
    if (read) {
      if (!re('^~*(?:\\(|=(?!=)|[-+*/%&|^]=|\\*\\*=|<<=|>>>?=|\\+\\+|--|\\?\\?=|&&=|\\|\\|=)').test(S.slice(i + name.length + read[0].length))) continue; // a property read
      return `${name} is assigned to, mutated or called as a method`;
    }
    return `${name} is used outside an env: slot or a property read (an alias, an argument, a parameter, a destructuring or an assignment)`;
  }
  if (decls !== 1) return decls ? `${name} is declared more than once in this file` : `${name} is not declared in this file`;
  const [bs, be] = blockOf(S, decl);
  if (!(decl < at && at > bs && at < be)) return `${name} is declared in a block the spawn is not inside, or after it`;
  const s = nextSig(S, nextSig(S, decl + name.length) + 1);
  const call = re('^[A-Za-z_$][\\w$]*~*\\(').exec(S.slice(s));
  const e = S[s] === '{' ? closeAt(S, s) : call ? closeAt(S, s + call[0].length - 1) : -1;
  if (e === -1) return `the declaration of ${name} is not a literal or a helper call`;
  const tail = /^[ \t\u0001]*(.)?/.exec(S.slice(e + 1));
  if (tail[1] && !/[;\r\n}]/.test(tail[1])) return `the declaration of ${name} has a tail after its value`;
  return exprReason(c, s, e + 1, at);
}
// Why the env expression [a0, b0) is not safe, or null. `at` is where the spawn is.
function exprReason(c, a0, b0, at) {
  const { S } = c;
  const [a, b] = trimRange(S, a0, b0);
  const text = S.slice(a, b);
  const looksLike = (who, why) => `${who} looks like an allowlist but ${why.join('; ')} -- an unfiltered process.env or a stray GIT_* key is refused (CWK-136)`;
  if (S[a] === '{') {
    const why = literalReasons(c, a, b - 1);
    return why.length ? looksLike('env', why) : null;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(text)) {
    const why = identifierReason(c, text, at);
    return why ? `env identifier ${text}: ${why} (CWK-136)` : null;
  }
  const call = re('^([A-Za-z_$][\\w$]*)~*\\(').exec(text);
  if (call && closeAt(S, a + call[0].length - 1) === b - 1) {
    const name = call[1];
    if (name === 'gitEnv' || name === 'gitTestEnv') {
      const why = untrustedName(c, name);
      return why ? `env is ${name}(...) but ${why} (CWK-136)` : null;
    }
    const h = helperLiteral(c, name);
    if (h.reason) return `env is ${name}(...): ${h.reason} (CWK-136)`;
    const why = literalReasons(c, h.a, h.b);
    return why.length ? looksLike(`env (${name}(...))`, why) : null;
  }
  if (/(?<![\w$.])process[\s\u0001]*(?:\.[\s\u0001]*env|\[)/.test(text) || [...c.facts.envAliases].some((x) => occurrences(text, x).length)) return 'takes env from process.env -- route it through gitTestEnv() (CWK-136)';
  const shown = c.T.slice(a, b).replace(/\s+/g, ' ').slice(0, 60);
  return `env is not gitTestEnv(...) or gitEnv(...) alone (got: ${shown}) -- an expression that merely contains it is refused (CWK-136)`;
}

// ---------------------------------------------------------------------------------------------------------------- the pins
// R14 / CWK-174 -- the house secret scan arrives as byte-equal copies of the published-code template (SERIES-CANON "Secret scan": a
// parity check measures it), so this room cannot rewrite their git spawns without breaking that parity. A carrier is exempt ONLY while its
// content is exactly the pinned blob: any edit, or a template re-sync that changes it, makes the entry a finding again ("re-derive"), so
// the exemption cannot widen or outlive its reason silently. The pin is a git blob id (git hash-object <file>).
// 08d measured every pin by dropping it and reading the census (.github d31a091, Bankfire 6dd3c8e8):
//   - scripts/secret-gate.test.mjs (71452210): PINNED. Line 40, `env: { ...gitEnv(), ...extra }`, is a spread around the name and not an
//     allowlist; lines 200 and 225 call a gitEnv() the file defines for itself, which F42 refuses by name.
//   - scripts/secret-scan.test.mjs (d0db994d): PINNED. It defines its own gitEnv() (`({ ...withoutGit(), TEMP: SANDBOX, ... })`, a whole-env
//     filter), which F42 refuses by name on lines 547, 548, 715, 820 and 825: a helper that copies the whole environment is not a
//     named-key allowlist, whatever it strips. Its decoy call (the 6dd3c8e8 fix) is not what is refused.
//   - scripts/release-notes.test.mjs (7e779ef8), scripts/verify-release-shape.test.mjs (fa8a730d), scripts/release-notes.mjs (f8d998d8):
//     NO pin; each reads clean by shape (sandboxEnv / the env const are named-key literals with GIT_CONFIG_NOSYSTEM).
export const EXEMPT_CARRIERS = {
  'scripts/secret-gate.test.mjs': '71452210d6a6f793895bc502557fce7e1f3e890c',
  'scripts/secret-scan.test.mjs': 'd0db994df855ccd647f3ded878a6867bb198e196',
};

// The git blob id of `text`, as `git hash-object` prints it for a file holding exactly these bytes.
export function blobId(text) {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + body.length + String.fromCharCode(0)), body])).digest('hex');
}

// ponytail: 57 lines at declaration -- one loop over files and one over calls, each with its own named finding; extracting the call body would pass eight locals around.
export function censusGitSpawns(files, exempt = EXEMPT_CARRIERS, definers = TRUSTED_DEFINERS) {
  const findings = [];
  let spawns = 0;
  let pinned = 0;
  for (const { rel, text } of files) {
    const pin = definers[rel];
    if (pin && blobId(text) !== pin.blob) findings.push(`${rel} is a trusted gitEnv()/gitTestEnv() definer but its blob id is ${blobId(text)}, not the pinned ${pin.blob} -- read the change, then re-pin it in TRUSTED_DEFINERS (08d F42)`);
    if (Object.hasOwn(exempt, rel)) {
      const id = blobId(text);
      if (id === exempt[rel]) { // pinned: its spawns are still COUNTED, so a pin never hides a drop in what the census sees
        const lx = skeleton(text);
        const n = [...text.matchAll(CALL_RE)].filter((m) => !lx.ok || lx.skel[m.index] === text[m.index]).length;
        spawns += n;
        pinned += n;
        continue;
      }
      findings.push(`${rel} is an exempt byte-equal org carrier but its blob id is ${id}, not the pinned ${exempt[rel]} -- re-derive it from .github/templates/published-code/scripts/ (CWK-174)`);
      continue;
    }
    const calls = [...text.matchAll(CALL_RE)];
    if (!calls.length) continue;
    const lex = skeleton(text);
    if (!lex.ok) {
      spawns += calls.length;
      findings.push(`${rel}:${lineOf(text, lex.at ?? 0)} cannot be read whole by the census (${lex.why}) -- ${calls.length} git spawn(s) in it are unverified (08d, fail closed)`);
      continue;
    }
    const c = { rel, T: text, S: lex.skel, definers, facts: fileFacts(lex.skel, text) };
    for (const m of calls) {
      if (c.S[m.index] !== text[m.index]) continue; // inside a comment or a string
      spawns++;
      const open = m.index + m[0].indexOf('(');
      const close = closeAt(c.S, open);
      const where = `${rel}:${lineOf(text, m.index)}`;
      const callee = `${m[1]}('git', ...)`;
      if (close === -1) { findings.push(`${where} unbalanced parens scanning a ${m[1]}('git', ...) call -- census cannot verify it`); continue; }
      const optArg = splitTop(c.S, open + 1, close).slice(1).reverse().find(([x, y]) => c.S[trimRange(c.S, x, y)[0]] === '{');
      const opts = optArg ? trimRange(c.S, optArg[0], optArg[1]) : null;
      const envs = [];
      let spread = false;
      if (opts) {
        for (const [x, y] of splitTop(c.S, opts[0] + 1, opts[1] - 1)) {
          if (c.S.startsWith('...', trimRange(c.S, x, y)[0])) { spread = true; continue; }
          const ent = parseEntry(c, x, y);
          if (ent && ent.key === 'env') envs.push(ent);
        }
      }
      if (envs.length === 0) { findings.push(`${where} ${callee} carries no 'env:' -- it inherits the ambient GIT_* family (CWK-133)`); continue; }
      if (envs.length > 1) { findings.push(`${where} ${callee} sets env: more than once -- census cannot tell which one wins (CWK-136)`); continue; }
      if (spread) { findings.push(`${where} ${callee} has a spread in its options, which can carry an env the census cannot see (CWK-136)`); continue; }
      const ent = envs[0];
      const reason = ent.shorthand ? (identifierReason(c, 'env', m.index) && `env identifier env: ${identifierReason(c, 'env', m.index)} (CWK-136)`) : exprReason(c, ent.valA, ent.valB, m.index);
      if (reason) findings.push(`${where} ${callee} ${reason}`);
    }
  }
  return { findings, spawns, pinned, files: files.length };
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
