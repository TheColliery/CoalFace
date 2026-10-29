// JSONC comment stripper — ported verbatim from CoalHearth/CoalTipple's
// scripts/lib/jsonc.mjs (the CM #12 string-vs-comment fix: a value ending in a literal
// backslash, e.g. "C:\\", must terminate its string correctly instead of leaking escape
// state into the next token). Shared by verify.mjs.

// An unclosed string, a dangling backslash or an unclosed block comment is kept to the end of the
// input in one match, so the strip stays linear and a malformed config still fails JSON.parse.
export function stripJsonc(content) {
  return content.replace(/"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|\/\/.*|\/\*[\s\S]*?(\*\/|$)/g, (m, close) => (m[0] === '"' || (m[1] === '*' && close !== '*/') ? m : ''));
}

// Prototype-pollution guard (OWASP Node.js): a poisoned project .coalface.json (e.g.
// shipped by an untrusted cloned repo) with a `__proto__` / `constructor` / `prototype`
// key would pollute Object.prototype through an Object.assign merge. Drop those keys at
// parse (the reviver runs over the tree before anything uses it). Series-consistent with
// CoalBoard v1.5.2 / CoalHearth. stripJsonc stays exported for verify.mjs.
const PROTO_GUARD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function parseJsonc(content) {
  return JSON.parse(stripJsonc(content), (k, v) => (PROTO_GUARD_KEYS.has(k) ? undefined : v));
}
