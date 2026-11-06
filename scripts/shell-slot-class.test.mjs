// 29ch CLASS TEST: no shipped instruction line hands a config value, or an unquoted install path, to a shell.
// The class: a code span that runs node on a shipped script and carries a placeholder named after a CONFIG_SCHEMA key
// (the agent would substitute the cloned repo's value into the line), or a bare <skill dir> (a space in the install
// path splits the argument). Scans what an AGENT reads as instruction: the .md files of skills/ and commands/, and the
// hooks/ .js files whose strings are injected into the agent's context. Scripts' own comments (.mjs) are developer text,
// not instruction, and are out of scope by design. The checker is exercised on a dirty and a clean fixture first: a
// checker that cannot fail proves nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_SCHEMA } from './lib/config-schema.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['skills', 'commands', 'hooks'];
// Which files, by folder: markdown instruction everywhere it sits; the conductor's injected strings in hooks/.
const scanned = (rel) => {
  const ext = path.extname(rel);
  if (ext === '.md') return true;
  return ext === '.js' && rel.split(path.sep)[0] === 'hooks';
};
const KEYS = new Set(CONFIG_SCHEMA.map((s) => s.key));

// Code spans on one line: `...`. A span is a RUNNER when it runs node on a script.
const RUNNER = /\b(?:node|npx|bash|sh|zsh|pwsh|powershell|python3?|uvx?|rtk)(?:\.exe)?\s/;

// Violations in one span. Returns the list (empty = clean).
export function spanViolations(span) {
  const out = [];
  if (!RUNNER.test(span)) return out;
  for (const k of KEYS) if (new RegExp(`[<{$%]\\{?${k}\\b`).test(span)) out.push(`config key ${k} on the command line`);
  if (/--(?:cpu-max|mem-min)\b/.test(span)) out.push('a threshold flag on the command line');
  for (const m of span.matchAll(/<skill dir>/g)) {
    if (span[m.index - 1] !== '"') out.push('<skill dir> not quoted');
  }
  return out;
}

// Violations in a text: each code span, its line number, and the reasons. Also counts the runner spans it judged,
// so a caller can refuse a scan that judged nothing.
export function textViolations(text) {
  const out = [];
  let runners = 0;
  let fenced = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    const spans = fenced ? [line] : [...line.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
    for (const span of spans) {
      if (!RUNNER.test(span)) continue;
      runners += 1;
      for (const why of spanViolations(span)) out.push({ line: i + 1, why, span });
    }
  });
  return { violations: out, runners };
}

function shippedFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (scanned(path.relative(repo, p))) files.push(p);
    }
  };
  for (const d of SCAN_DIRS) {
    const abs = path.join(repo, d);
    if (fs.existsSync(abs)) walk(abs);
  }
  return files;
}

test('the checker fails a dirty span and passes a clean one (it can fail)', () => {
  const dirty = 'node <skill dir>/scripts/machine-reading.mjs --cpu-max <admitCpuBusyMaxPct>';
  const unquoted = 'node <skill dir>/scripts/admission.mjs';
  const clean = 'node "<skill dir>/scripts/admission.mjs" [--running <n>] [--json]';
  assert.equal(spanViolations(dirty).length, 3, 'a config-key slot, a threshold flag and an unquoted path are all caught');
  assert.equal(spanViolations('node "x.mjs" --cpu-max $CPU').length, 1, 'a threshold flag with a shell variable is caught');
  assert.equal(spanViolations('python x.py {admitMemFreeMinPct}').length, 1, 'another runner and a brace slot are caught');
  assert.equal(textViolations('```bash\nnode x.mjs <admitCpuBusyMaxPct>\n```').violations.length, 1, 'a fenced block is judged');
  assert.equal(spanViolations(unquoted).length, 1, 'an unquoted path alone is caught');
  assert.deepEqual(spanViolations(clean), [], 'a quoted path and a non-key placeholder pass');
  assert.deepEqual(spanViolations('plain prose <admitCpuBusyMaxPct> with no runner'), [], 'a span that runs nothing is not judged');
});

test('no shipped instruction hands a config key or an unquoted install path to a runner', () => {
  const files = shippedFiles();
  assert.ok(files.length > 0, 'the scan found no shipped text: the walk is broken, not the rule');
  let runners = 0;
  const bad = [];
  for (const f of files) {
    const r = textViolations(fs.readFileSync(f, 'utf8'));
    runners += r.runners;
    for (const v of r.violations) bad.push(`${path.relative(repo, f)}:${v.line}: ${v.why} :: ${v.span}`);
  }
  assert.ok(runners > 0, 'no runner span was judged: a rename of the runner would pass this test vacuously');
  assert.deepEqual(bad, [], `shipped lines that put a value or an unquoted path on a shell line:\n${bad.join('\n')}`);
});
