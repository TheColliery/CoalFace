import { test } from 'node:test';
import assert from 'node:assert';
import { checkConfigKeys } from './config-keys.mjs';

// A minimal in-memory surface set. `read` is injected, so no test touches disk.
// Every locator gets a NON-EMPTY, clean base surface: since INSPECT F1 an empty
// surface list is itself a FAIL, so a test that means to exercise one locator must
// still hand the other three something real. A test overriding a list replaces it.
const BASE_FILES = {
  'base.md': ['## Configure', '| Key | Default |', '| `coalfaceMode` | `auto` |', ''].join('\n'),
  'base.js': "const m = '[CoalFace] hello';",
  'base.json': '// a base comment',
};
const mk = (files) => (f) => {
  const all = { ...BASE_FILES, ...files };
  if (!(f in all)) throw new Error('ENOENT ' + f);
  return all[f];
};
const fails = (fs_) => fs_.filter((f) => f.level === 'FAIL').map((f) => f.msg);
const skips = (fs_) => fs_.filter((f) => f.level === 'SKIP').map((f) => f.msg);

const BASE = {
  schemaKeys: ['coalfaceMode', 'autoFanoutFloor'],
  pending: {}, notConfig: {}, blind: {},
  mdFiles: ['base.md'],
  keyTables: [{ file: 'base.md', heading: 'Configure' }],
  hookFiles: ['base.js'],
  templateFiles: ['base.json'],
};

test('a named key that does not resolve FAILs, naming the token and the file', () => {
  const out = checkConfigKeys({
    ...BASE,
    mdFiles: ['d.md'],
    read: mk({ 'd.md': 'set the `swarmTimeout` config key' }),
  });
  assert.equal(fails(out).length, 1);
  assert.match(fails(out)[0], /swarmTimeout/);
  assert.match(fails(out)[0], /d\.md/);
});

test('the same-line config marker is REQUIRED — a backticked camelCase token with no marker is not a candidate', () => {
  const out = checkConfigKeys({
    ...BASE,
    mdFiles: ['d.md'],
    read: mk({ 'd.md': 'the `someHelper` returns a value' }), // no config marker on the line
  });
  assert.equal(fails(out).length, 0);
});

test('a resolving key passes', () => {
  const out = checkConfigKeys({
    ...BASE, mdFiles: ['d.md'], read: mk({ 'd.md': 'the `coalfaceMode` config key' }),
  });
  assert.equal(fails(out).length, 0);
});

// ---- BLIND_KEYS: the hard gate and all four expiry paths ----

test('BLIND: an undeclared schema key the shape rule cannot see is a HARD FAIL', () => {
  const out = checkConfigKeys({ ...BASE, schemaKeys: ['coalfaceMode', 'bandwidth'], read: mk({}) });
  assert.equal(fails(out).length, 1);
  assert.match(fails(out)[0], /bandwidth cannot be detected/);
});

test('BLIND: a DECLARED blind key does not fail, and still DISCLOSES via SKIP', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode', 'bandwidth'], blind: { bandwidth: 'lowercase' },
    // bandwidth's row MUST be present for F1's coverage check to pass — this fixture
    // predates F1 and originally omitted it, which the F1 check now (correctly) catches;
    // the test's own intent is the SKIP disclosure, not the coverage check, so the row is
    // added here rather than exempted.
    read: mk({ 'base.md': ['## Configure', '| Key | Default |', '| `coalfaceMode` | `auto` |', '| `bandwidth` | `25` |', ''].join('\n') }),
  });
  assert.equal(fails(out).length, 0);
  assert.match(skips(out).join(' '), /blind to 1 DECLARED schema key/);
});

// ---- F1 (INSPECT bounce, r29): BLIND_KEYS' coverage claim is PROVEN, never merely asserted ----

test('F1: a declared blind key whose row is ABSENT from the key table FAILs, naming the coverage gap', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode', 'bandwidth'], blind: { bandwidth: 'lowercase' },
    keyTables: [{ file: 'r.md', heading: 'Configure' }],
    read: mk({ 'r.md': '## Configure\n| Key | Default |\n| `coalfaceMode` | `auto` |\n' }), // bandwidth's row missing
  });
  assert.match(fails(out).join(' '), /BLIND_KEYS declares bandwidth as covered by the L2 key-table pass, but no scanned key table row names it/);
});

test('F1: a declared blind key whose row IS present passes the coverage check', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode', 'bandwidth'], blind: { bandwidth: 'lowercase' },
    keyTables: [{ file: 'r.md', heading: 'Configure' }],
    read: mk({ 'r.md': '## Configure\n| Key | Default |\n| `coalfaceMode` | `auto` |\n| `bandwidth` | `25` |\n' }),
  });
  assert.equal(fails(out).filter((m) => /no scanned key table row names it/.test(m)).length, 0);
});

test('F1: checked against L2\'s OWN matched set, not the global `seen` map — a blind key seen ONLY by a non-L2 locator still FAILs', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode', 'bandwidth'], blind: { bandwidth: 'lowercase' },
    // bandwidth cannot actually appear via L1/L3/L4 (they gate on KEY_SHAPE, which no blind
    // key passes) — this proves the check reads l2Tokens specifically, not `seen`, by
    // asserting the fail fires even though `note()` runs for every locator identically.
    keyTables: [{ file: 'r.md', heading: 'Configure' }],
    read: mk({ 'r.md': '## Configure\n| Key | Default |\n| `coalfaceMode` | `auto` |\n' }),
  });
  assert.match(fails(out).join(' '), /bandwidth as covered by the L2 key-table pass/);
});

test('BLIND expiry 1: a declaration whose key LEFT the schema FAILs', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode'], blind: { gone: 'stale' }, read: mk({}),
  });
  assert.match(fails(out).join(' '), /BLIND_KEYS declares gone, but it is not in the schema/);
});

test('BLIND expiry 2: a declaration whose key the rule CAN now see FAILs', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode'], blind: { coalfaceMode: 'no longer true' }, read: mk({}),
  });
  assert.match(fails(out).join(' '), /now matches the shape rule/);
});

// ---- PENDING_KEYS / NOT_CONFIG self-cleaning ----

test('PENDING expiry: an entry that now resolves in the schema FAILs as implemented', () => {
  const out = checkConfigKeys({
    ...BASE, pending: { coalfaceMode: 'CWK-000' },
    mdFiles: ['d.md'], read: mk({ 'd.md': 'the `coalfaceMode` config key' }),
  });
  assert.match(fails(out).join(' '), /PENDING_KEYS lists coalfaceMode, but it now resolves/);
});

test('NOT_CONFIG expiry: an entry that became a real key FAILs as a lie', () => {
  const out = checkConfigKeys({
    ...BASE, notConfig: { coalfaceMode: 'not a key' },
    mdFiles: ['d.md'], read: mk({ 'd.md': 'the `coalfaceMode` config key' }),
  });
  assert.match(fails(out).join(' '), /NOT_CONFIG lists coalfaceMode .* now resolves/);
});

test('rule 2: a declaration no surface mentions is dead weight and FAILs', () => {
  const out = checkConfigKeys({
    ...BASE, notConfig: { ghostKey: 'nothing references this' },
    mdFiles: ['d.md'], read: mk({ 'd.md': 'nothing here' }),
  });
  assert.match(fails(out).join(' '), /no scanned surface names ghostKey/);
});

test('rule 2 DEGRADES to SKIP on a partial scan — a 0-hit cannot convict when the scope was incomplete', () => {
  const out = checkConfigKeys({
    ...BASE, notConfig: { ghostKey: 'x' },
    mdFiles: ['present.md', 'missing.md'],
    read: mk({ 'present.md': 'nothing' }),
  });
  assert.equal(fails(out).filter((m) => /no scanned surface names/.test(m)).length, 0);
  assert.match(skips(out).join(' '), /declaration-pruning not checked/);
});

// ---- ZERO-MATCH MUST FAIL (the trap that ships green and blind) ----

test('a named surface that cannot be read FAILs INDIVIDUALLY, not just when the whole set is empty', () => {
  const out = checkConfigKeys({
    ...BASE, mdFiles: ['here.md', 'renamed.md'], read: mk({ 'here.md': 'ok' }),
  });
  assert.match(fails(out).join(' '), /named surface renamed\.md could not be read/);
});

test('a key-table locator that matches NO region FAILs rather than passing quietly', () => {
  const out = checkConfigKeys({
    ...BASE, keyTables: [{ file: 'r.md', heading: 'Configure' }],
    read: mk({ 'r.md': '## Something Else\ntext' }),
  });
  assert.match(fails(out).join(' '), /key table locator found NO region/);
});

test('a hook notice locator that finds ZERO sites FAILs rather than scanning nothing and reporting clean', () => {
  const out = checkConfigKeys({
    ...BASE, hookFiles: ['h.js'], read: mk({ 'h.js': 'const x = 1;' }),
  });
  assert.match(fails(out).join(' '), /found ZERO sites carrying/);
});

test('a template locator that finds ZERO comment lines FAILs', () => {
  const out = checkConfigKeys({
    ...BASE, templateFiles: ['t.json'], read: mk({ 't.json': '{ "a": 1 }' }),
  });
  assert.match(fails(out).join(' '), /found ZERO comment lines/);
});

// ---- the structured pass sees what the shape rule cannot ----

test('the key table is SHAPE-FREE — it catches a lowercase key the prose rule is blind to', () => {
  const out = checkConfigKeys({
    ...BASE,
    keyTables: [{ file: 'r.md', heading: 'Configure' }],
    read: mk({ 'r.md': '## Configure\n| Key | Default |\n| `nosuchkey` | `0` |\n' }),
  });
  assert.match(fails(out).join(' '), /documents nosuchkey/);
});

test('a table row naming a REAL key passes, and covers a declared blind key by structure', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['bandwidth'], blind: { bandwidth: 'lowercase' },
    keyTables: [{ file: 'r.md', heading: 'Configure' }],
    read: mk({ 'r.md': '## Configure\n| Key | Default |\n| `bandwidth` | `25` |\n' }),
  });
  assert.equal(fails(out).length, 0);
});

// ---- the ${} interpolation strip (a helper CALL inside a notice is not ship-text) ----

test('a ${...} interpolation inside a notice is stripped — the helper name is not convicted', () => {
  const out = checkConfigKeys({
    ...BASE, hookFiles: ['h.js'],
    read: mk({ 'h.js': "return `[CoalFace] floor is ${floorOf(cfg)} units`;" }),
  });
  assert.equal(fails(out).length, 0);
});

test('a real key named in a notice OUTSIDE an interpolation is still seen', () => {
  const out = checkConfigKeys({
    ...BASE, hookFiles: ['h.js'],
    read: mk({ 'h.js': "return '[CoalFace] set nosuchKey to tune it';" }),
  });
  assert.match(fails(out).join(' '), /nosuchKey/);
});

test('a COMMENT mentioning the notice prefix is not itself a notice site', () => {
  const out = checkConfigKeys({
    ...BASE, hookFiles: ['h.js'],
    read: mk({ 'h.js': "// the [CoalFace] nosuchKey note\nconst x = '[CoalFace] real';" }),
  });
  assert.equal(fails(out).filter((m) => /nosuchKey/.test(m)).length, 0);
});

// ---- INSPECT F1: an EMPTY surface list is itself a zero-match ----

test('F1: an undeclared EMPTY locator list FAILs — scanning nothing is not clean', () => {
  const out = checkConfigKeys({ ...BASE, mdFiles: [], read: mk({}) });
  assert.match(fails(out).join(' '), /locator mdFiles has an EMPTY surface list/);
});

test('F1: every one of the four locators is covered, not just the two with count guards', () => {
  const out = checkConfigKeys({
    ...BASE, mdFiles: [], keyTables: [], hookFiles: [], templateFiles: [], read: mk({}),
  });
  for (const n of ['mdFiles', 'keyTables', 'hookFiles', 'templateFiles']) {
    assert.match(fails(out).join(' '), new RegExp('locator ' + n + ' has an EMPTY'));
  }
});

test('F1: a DECLARED absent locator is accepted silently — a room may genuinely lack one', () => {
  const out = checkConfigKeys({
    ...BASE, mdFiles: ['d.md'], keyTables: [{ file: 'd.md', heading: 'Configure' }],
    hookFiles: ['h.js'], templateFiles: [],
    absentLocators: { templateFiles: 'this room ships no config template' },
    read: mk({ 'd.md': '## Configure\n| `coalfaceMode` | `auto` |\n', 'h.js': "'[CoalFace] hi'" }),
  });
  assert.equal(fails(out).filter((m) => /EMPTY surface list/.test(m)).length, 0);
});

test('F1: a BLIND_KEYS declaration citing key-table coverage FAILs when no key table runs', () => {
  const out = checkConfigKeys({
    ...BASE, schemaKeys: ['coalfaceMode', 'bandwidth'], blind: { bandwidth: 'lowercase' },
    keyTables: [], read: mk({}),
  });
  assert.match(fails(out).join(' '), /cites coverage that does not exist/);
});
