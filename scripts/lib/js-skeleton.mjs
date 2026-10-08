// 08d -- a small JavaScript SKELETON lexer for the git-spawn census (scripts/lib/git-env-census.mjs).
//
// The census used to find brackets and commas with a quote model of its own, and a regex literal that holds a quote (/'/g), or a
// template literal, desynchronised it so a GIT_DIR entry after them hid inside a "string" (witness F41, found by three rooms'
// reviewers). This module reads the source the way the language does, once, and hands back a SKELETON: the same text, the same length,
// with every comment and every string, template and regex BODY replaced by BLANK. A caller then matches brackets, commas and
// identifiers on the skeleton with no quote model of its own, and reads literal values from the original text at the same indices.
//
// What it keeps: the quote characters around a string (so 'x' is still a visible literal), the backticks and the `${ ... }` code inside a
// template (that code is real code and is lexed as code), a regex literal's slashes and flags. What it blanks: comment text (newlines
// stay, so line numbers hold), string, template-text and regex bodies.
//
// NAMED OPEN, on purpose: a `/` after `)` or `}` is read as division, never as a regex start (`if (x) /re/.test(y)` is misread, and the
// lexer then may mistake the regex for code); an unterminated string, template, regex or comment, or unbalanced brackets, make the
// result NOT ok, and the census turns that into a finding for the file instead of guessing.
export const BLANK = String.fromCharCode(1);

// After these words a `/` starts a regex; after any other word, a number, a string or a closing bracket it is a division.
const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'do', 'else', 'instanceof', 'yield', 'await']);
const isIdStart = (c) => /[A-Za-z_$]/.test(c) || c > '\u007f';
const isIdPart = (c) => /[\w$]/.test(c) || c > '\u007f';

export function skeleton(text) {
  const n = text.length;
  const out = text.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = BLANK; };
  const stack = []; // 'b' = a plain {, 't' = the { of a ${ inside a template
  const fail = (why, at) => ({ ok: false, why, at, skel: out.join('') });
  // The text part of a template, from `start` to the closing backtick (expr false) or to a `${` (expr true).
  const templateText = (start) => {
    for (let k = start; k < n; k++) {
      const c = text[k];
      if (c === '\\') { k++; continue; }
      if (c === '`') { blank(start, k); return { end: k + 1, expr: false }; }
      if (c === '$' && text[k + 1] === '{') { blank(start, k); return { end: k + 2, expr: true }; }
    }
    return null;
  };
  let i = 0;
  if (text.startsWith('#!')) { // a shebang line is not code
    const eol = text.indexOf(String.fromCharCode(10));
    i = eol === -1 ? n : eol;
    blank(0, i);
  }
  let prevValue = false; // the last significant token ends a value (identifier, number, string, closing bracket): a `/` is then a division
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') {
      let e = text.indexOf('\n', i);
      if (e === -1) e = n;
      blank(i, e); i = e; continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      if (e === -1) return fail('unterminated block comment', i);
      blank(i, e + 2); i = e + 2; continue;
    }
    if (c === "'" || c === '"') {
      let k = i + 1;
      while (k < n && text[k] !== c) {
        if (text[k] === '\\') k++;
        else if (text[k] === '\n') return fail('unterminated string', i);
        k++;
      }
      if (k >= n) return fail('unterminated string', i);
      blank(i + 1, k); i = k + 1; prevValue = true; continue;
    }
    if (c === '`' || (c === '}' && stack[stack.length - 1] === 't')) {
      if (c === '}') stack.pop();
      const r = templateText(i + 1);
      if (!r) return fail('unterminated template literal', i);
      i = r.end;
      if (r.expr) { stack.push('t'); prevValue = false; } else prevValue = true;
      continue;
    }
    if (c === '{') { stack.push('b'); i++; prevValue = false; continue; }
    if (c === '}') {
      if (stack.pop() === undefined) return fail('unbalanced }', i);
      i++; prevValue = true; continue;
    }
    if (c === '/') {
      if (prevValue) { i++; prevValue = false; continue; }
      let k = i + 1;
      let inClass = false;
      for (; k < n; k++) {
        const d = text[k];
        if (d === '\\') { k++; continue; }
        if (d === '\n') return fail('unterminated regular expression', i);
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
      }
      if (k >= n) return fail('unterminated regular expression', i);
      blank(i + 1, k); i = k + 1;
      while (i < n && /[a-z]/.test(text[i])) i++;
      prevValue = true; continue;
    }
    if (isIdStart(c)) {
      let k = i + 1;
      while (k < n && isIdPart(text[k])) k++;
      prevValue = !REGEX_AFTER.has(text.slice(i, k));
      i = k; continue;
    }
    if (/[0-9]/.test(c)) {
      let k = i + 1;
      while (k < n && /[\w.]/.test(text[k])) k++;
      i = k; prevValue = true; continue;
    }
    prevValue = c === ')' || c === ']';
    i++;
  }
  if (stack.length) return fail('unbalanced {', n);
  return { ok: true, skel: out.join('') };
}

// Index of the bracket that closes the one at `open` in a SKELETON, or -1 (unbalanced or crossed).
export function closeAt(skel, open) {
  const want = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < skel.length; i++) {
    const c = skel[i];
    if (want[c]) stack.push(want[c]);
    else if (c === ')' || c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

// The [from, to) ranges of the top-level comma-separated entries between `from` and `to` of a SKELETON (empty entries dropped).
export function splitTop(skel, from, to) {
  const out = [];
  let depth = 0;
  let start = from;
  const push = (a, b) => { if (skel.slice(a, b).replace(/[\s\u0001]/g, '') !== '') out.push([a, b]); };
  for (let i = from; i < to; i++) {
    const c = skel[i];
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { push(start, i); start = i + 1; }
  }
  push(start, to);
  return out;
}
