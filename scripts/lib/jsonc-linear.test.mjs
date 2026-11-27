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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripJsonc } from './jsonc.mjs';
import { testChildEnv } from './test-child-env.mjs';

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
// 29sj t218-a (the reviewer's row 9): the claim is TERMINATION, not a wall clock. Each shape of 1 MiB runs in its own child with a heap cap
// and a timeout that kills it; a child the timeout kills fails the leg. The super-linear regex from before the fix (f71f720) never finishes
// on this input, so the leg is red on it. The child builds its shape itself: a 1 MiB argument would not fit a Windows command line.
const TERMINATION_TIMEOUT_MS = 30000;
const CHILD_HEAP_MB = 2048;
const MEGABYTE = 1024 * 1024;
const CHILD_SRC = `import { pathToFileURL } from 'node:url';
const { stripJsonc } = await import(pathToFileURL(process.argv[2]).href);
const n = Number(process.argv[4]);
const shapes = {
  unclosedBlockOpeners: '/* a'.repeat(n / 4),
  unclosedStringEscapes: '"' + '\\\\"'.repeat(Math.floor(n / 3)),
  danglingBackslash: '"\\\\'.repeat(n / 2),
};
stripJsonc(shapes[process.argv[3]]);
`;

test('config comment stripping terminates on 1 MiB of unclosed input, checked by a child that a timeout kills (no clock)', (t) => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'cf-strip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const child = path.join(dir, 'strip-child.mjs');
  fs.writeFileSync(child, CHILD_SRC);
  for (const name of Object.keys(SHAPES)) {
    const r = spawnSync(process.execPath, [child, JSONC, name, String(MEGABYTE)], {
      encoding: 'utf8',
      timeout: TERMINATION_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: { ...testChildEnv(), NODE_OPTIONS: `--max-old-space-size=${CHILD_HEAP_MB}` },
    });
    assert.equal(r.error, undefined, `${name}: the strip did not finish within ${TERMINATION_TIMEOUT_MS} ms (${r.error ? r.error.code : 'no error'})`);
    assert.equal(r.status, 0, `${name}: the child exited ${r.status}: ${r.stderr}`);
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
