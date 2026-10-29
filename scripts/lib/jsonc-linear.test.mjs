// config comment stripping stays linear on unclosed input; config reads are size-bounded.
// An unclosed string, a dangling backslash or an unclosed block comment is consumed to the end of
// the input in one match and kept as it was, so a malformed config still fails JSON.parse, and a
// well-formed one parses to the same value byte for byte. Every reader refuses a config larger than
// MAX_CONFIG_BYTES before it parses anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJsonc } from './jsonc.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSONC = path.join(repo, 'scripts', 'lib', 'jsonc.mjs');
const REPO_FS = path.join(repo, 'scripts', 'lib', 'repo-fs.mjs');
const HOOK = path.join(repo, 'hooks', 'coalface-conductor.js');
const PLUGIN_HOOK = path.join(repo, 'plugin', 'hooks', 'coalface-conductor.js');

// The regex as it stood before this change, kept as the reference for the differential test.
const OLD_RE = /"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g;
const oldStrip = (c) => c.replace(OLD_RE, (m) => (m[0] === '"' ? m : ''));

const SIZE = 48 * 1024;
// Neither shape closes: the block openers never meet a star-slash, and the escaped quotes never meet an unescaped one.
const SHAPES = {
  unclosedBlockOpeners: '/* a'.repeat(SIZE / 4),
  unclosedStringEscapes: '"' + '\\"'.repeat(SIZE / 3),
  // A string opener whose body ends in a lone backslash: the string branch fails there and restarts two characters on.
  danglingBackslash: '"\\'.repeat(SIZE / 2),
};
const BUDGET_MS = 50;

test('config comment stripping stays under 50 ms on 48 KB of unclosed input (best of 3 runs)', () => {
  for (const [name, input] of Object.entries(SHAPES)) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = process.hrtime.bigint();
      stripJsonc(input);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    assert.ok(Math.min(...times) < BUDGET_MS, `${name}: best of 3 = ${Math.min(...times).toFixed(1)} ms, budget ${BUDGET_MS} ms`);
  }
});

test('unclosed input comes back unchanged, so a malformed config still fails JSON.parse', () => {
  for (const [name, input] of Object.entries(SHAPES)) {
    assert.equal(stripJsonc(input), input, `${name}: the unclosed text is emitted unchanged`);
  }
  assert.throws(() => JSON.parse(stripJsonc('{"a":1} /* never closed')));
  assert.throws(() => JSON.parse(stripJsonc('{"a":"never closed')));
});

test('well-formed JSON with comments strips byte for byte as before', () => {
  const fixtures = [
    '',
    '{}',
    '{"url":"http://example.com","mode":"auto"}',
    '{"p":"C:\\\\","x":"a//b"}',
    '{"q":"he said \\"hi\\""}',
    '{\n  "a": "keep", // line comment with "quotes" inside\n  "b": "x" /* block */\n}',
    '{"s":"/* not a comment */","t":"// not either"} // trailing',
    '{"a":1 /**/ , "b":2 /* a */ /* b */}',
    '{"a":"x\\\\"} /* after an escaped-backslash value */',
    '/* header */ {"k": [1, 2, 3]} // footer */',
    '{"w":"a/*b","v":"c*/d"}',
  ];
  for (const f of fixtures) {
    assert.equal(stripJsonc(f), oldStrip(f), `differs on ${JSON.stringify(f)}`);
  }
});

// The strip call is one line in each of three files: the library, the hook and the hook's plugin
// copy. The regex and its callback must be byte-equal from the opening slash to the end of the line,
// and the hook's size bound must equal the library's export.
const STRIP_START = '/"(?:';
function stripCall(file) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.includes(STRIP_START));
  assert.ok(line, `${path.relative(repo, file)} holds the strip call`);
  return line.slice(line.indexOf(STRIP_START));
}
function sizeBound(file) {
  const m = fs.readFileSync(file, 'utf8').match(/MAX_CONFIG_BYTES = ([^;]+);/);
  assert.ok(m, `${path.relative(repo, file)} declares MAX_CONFIG_BYTES`);
  return m[1];
}

test('the library, the hook and the hook plugin copy carry one strip call and one size bound', () => {
  assert.equal(stripCall(HOOK), stripCall(JSONC), 'the hook strip call matches the library');
  assert.equal(stripCall(PLUGIN_HOOK), stripCall(HOOK), 'the plugin copy matches the hook');
  assert.equal(sizeBound(HOOK), sizeBound(REPO_FS), 'the hook size bound matches the repo-fs export');
});

test('a config file over the size bound is refused, and one at the bound is read', async (t) => {
  const { readConfigBounded, MAX_CONFIG_BYTES } = await import('./repo-fs.mjs');
  const dir = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'cf-bound-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const over = path.join(dir, 'over.json');
  fs.writeFileSync(over, 'x'.repeat(MAX_CONFIG_BYTES + 1));
  assert.throws(() => readConfigBounded(over), (e) => e.code === 'ECONFIGTOOLARGE' && e.message.includes('over.json'));
  const at = path.join(dir, 'at.json');
  fs.writeFileSync(at, '{}'.padEnd(MAX_CONFIG_BYTES, ' '));
  assert.equal(readConfigBounded(at).length, MAX_CONFIG_BYTES);
});
