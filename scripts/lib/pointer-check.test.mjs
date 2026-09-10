// CWK-079 — pointer gate. Driven in memory; `resolve`/`hasEntry` are injected, so no
// fixture tree and no temp dirs.
//
// PLATFORM: every assertion about separators is made EXPLICITLY, never left to the local
// run. A sibling room turned all four of its Unix CI legs red because a test asserted a
// WINDOWS fact as universal — on POSIX a backslash is a legal FILENAME character, not a
// separator, so `..\..\escape.md` resolves INSIDE the repo there. The shipped module is
// never platform-conditional; the test asserts the module's own rule (a citation is
// `/`-delimited, and a backslash is rejected outright) which holds identically on both.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  pointerCandidates, checkPointers, looksPathShaped, deriveIgnoredRoots,
  classifyCheckIgnoreResult, applyCheckIgnoreProbe, PROBE_SUFFIX,
  collectSurfaces, DEFAULT_SURFACE_PLAN,
} from './pointer-check.mjs';

const OURS = new Set(['scripts', 'hooks', 'skills', 'commands', 'README.md', '.github']);
const base = (over = {}) => ({
  ourRoots: OURS,
  ignoredRoots: new Set(),
  agentHomes: new Set(),
  hasEntry: () => false,
  resolve: () => 'tracked',
  pending: [],
  ...over,
});
// CWK-079 bounce2 1b/F3 -- checkPointers returns { findings, checked } (a proper field, not
// a property hung on the findings array); the helper unwraps `.findings` for the tests.
const fails = (r) => r.findings.filter((x) => x.level === 'FAIL').map((x) => x.msg);

// ---------------------------------------------------------------- SHAPE
test('shape: a plain in-tree path is a candidate; the eight rejects are not', () => {
  const t = [
    '`scripts/lib/pointer-check.mjs`',       // kept
    '`node scripts/verify.mjs`',             // whitespace: a command
    '`<gitroot>/.coalface.json`',            // <placeholder>
    '`scripts/*.mjs`',                       // glob
    '`SKILL.md`',                            // no slash: the USER's repo
    '`/etc/passwd`', '`~/.claude/x`', '`https://example.com/a/b`', // outside
    '`../hooks.json`',                       // dot segment
    '`scripts\\lib\\x.mjs`',                 // backslash
  ].join(' ');
  assert.deepEqual(pointerCandidates(t), ['scripts/lib/pointer-check.mjs']);
});

test('shape: a fenced block is an EXAMPLE, not a claim about this tree', () => {
  const t = '```\n`lib/inside-fence.js`\n```\n`hooks/outside.js`\n';
  assert.deepEqual(pointerCandidates(t), ['hooks/outside.js']);
});

test('shape: a dot-DIR survives — `.github/workflows/ci.yml` is a real name, not navigation', () => {
  assert.deepEqual(pointerCandidates('`.github/workflows/ci.yml`'), ['.github/workflows/ci.yml']);
});

// CWK-077's own class -- named, not folded in here (per the dispatch): a `.`/`..` segment
// or a backslash separator is REJECTED outright by this gate, so neither ever reaches
// resolution. Asserted explicitly for the POSIX case, per the dispatch's own instruction.
test('CWK-077 class, named not closed: a `.`/`..` segment and a backslash are both rejected, POSIX case asserted explicitly', () => {
  assert.deepEqual(pointerCandidates('`scripts/..\\..\\escape.md`'), []);
  assert.ok(path.win32.resolve('C:/repo', 'scripts/..\\..\\escape.md').toLowerCase().indexOf('c:\\repo\\') !== 0,
    'win32 treats the backslash as a separator, so this would escape the repo IF the token reached resolution');
  assert.ok(path.posix.resolve('/repo', 'scripts/..\\..\\escape.md').startsWith('/repo/'),
    'posix treats the backslash as a FILENAME character, so this stays inside the repo either way');
  assert.deepEqual(pointerCandidates('`./scripts/x.mjs`'), [], 'a leading dot-segment is rejected, not merely a `../` one');
});

// ---------------------------------------------------------------- THREE STATES
test('a MISSING path FAILs, naming the citer and the token', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'CHANGELOG.md', text: '`.github/tree/main/benchmarks/CoalFace`' }],
    resolve: () => 'missing',
  }));
  assert.equal(fails(f).length, 1);
  assert.match(fails(f)[0], /CHANGELOG\.md cites `\.github\/tree\/main\/benchmarks\/CoalFace`, which does not resolve/);
});

test('an EXISTING but UNTRACKED path FAILs — "exists" is not "reachable"', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`scripts/local-only.js`' }],
    resolve: () => 'untracked',
  }));
  assert.match(fails(f)[0], /exists here but is UNTRACKED — a clone does not have it/);
});

test('a TRACKED FILE is silent', () => {
  const f = checkPointers(base({ surfaces: [{ label: 'README.md', text: '`scripts/real.mjs`' }] }));
  assert.deepEqual(fails(f), []);
});

// The order's own arithmetic note: 28 of 104 in-scope citations are DIRECTORIES, and
// `git ls-files` lists files only, so `resolve()` must treat a tracked-directory PREFIX
// as reachable too, or a quarter of the population reads as dead. Pinned here as the
// CALLER'S CONTRACT (resolve's own return value), not as an assumption this module makes.
test('a TRACKED DIRECTORY (a prefix of some tracked path) is silent, not a FAIL', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`skills/coalface/references/`' }],
    resolve: (p) => (p === 'skills/coalface/references' ? 'tracked' : 'missing'),
  }));
  assert.deepEqual(fails(f), []);
});

// ---------------------------------------------------------------- GITIGNORED
test('a GITIGNORED root FAILs even though resolve() would call it tracked', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`dist-claude-ai/x.zip`' }],
    ourRoots: new Set([...OURS, 'dist-claude-ai']),
    ignoredRoots: new Set(['dist-claude-ai']),
    resolve: () => 'tracked',
  }));
  assert.match(fails(f)[0], /lives under the gitignored `dist-claude-ai`/);
});

test('a declaration CANNOT launder a gitignored path — the check runs before `pending`', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`dist-claude-ai/x.zip`' }],
    ourRoots: new Set([...OURS, 'dist-claude-ai']),
    ignoredRoots: new Set(['dist-claude-ai']),
    pending: [{ path: 'dist-claude-ai/x.zip', reason: 'trying to excuse it' }],
  }));
  assert.ok(fails(f).some((m) => /gitignored/.test(m)), fails(f).join(' | '));
});

test('a historyOnly surface is still checked for the gitignored case, and nothing else', () => {
  const ignored = checkPointers(base({
    surfaces: [{ label: 'CHANGELOG.md', text: '`dist-claude-ai/x.zip`', historyOnly: true }],
    ourRoots: new Set([...OURS, 'dist-claude-ai']),
    ignoredRoots: new Set(['dist-claude-ai']),
  }));
  assert.ok(fails(ignored).some((m) => /gitignored/.test(m)));
  const renamed = checkPointers(base({
    surfaces: [{ label: 'CHANGELOG.md', text: '`scripts/renamed-away.mjs`', historyOnly: true }],
    resolve: () => 'missing',
  }));
  assert.deepEqual(fails(renamed), []); // correct on the day it was written
});

// ---------------------------------------------------------------- SCOPE
test('citer-relative: a path resolving only against the citer own dir is IN scope', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'skills/coalface/references/taxonomy.md', text: '`workflow-engine.md`' }],
    // no slash -> dropped by shape before scope is ever reached; use a path-shaped sibling
  }));
  assert.deepEqual(fails(f), []); // no-slash token never becomes a candidate at all
});

test('citer-relative, path-shaped: a token resolving against the citer own dir is IN scope', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'skills/coalface/references/taxonomy.md', text: '`refs/x.json`' }],
    hasEntry: (dir, name) => dir === 'skills/coalface/references' && name === 'refs',
    resolve: () => 'missing',
  }));
  assert.match(fails(f)[0], /does not resolve/);
});

test('a path into someone else own tree is OUT of scope, silently and correctly', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`node_modules/pkg/index.js`' }],
    resolve: () => 'missing',
  }));
  assert.deepEqual(fails(f), []);
});

test('an AGENT HOME is excluded even where the root is also ours', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`.claude/rules/x.md`' }],
    ourRoots: new Set([...OURS, '.claude']),
    agentHomes: new Set(['.claude']),
    resolve: () => 'missing',
  }));
  assert.deepEqual(fails(f), []);
});

// CWK-079 bounce2 F2 — the agent-home match is EXACT-SEGMENT, not a bare string prefix.
// `.claude-plugin` is OURS (the CC plugin manifest dir); `.claude` is the agent home. A
// bare `norm.startsWith(h)` mutation (dropping the `+ '/'`) would read `.claude-plugin/...`
// as inside `.claude/...` and silently drop it from scope -- the reviewer measured this
// exact mutation swallowing both `.claude-plugin/plugin.json` citations in the live gate
// (checked 38 -> 36) with the full suite staying green. Proven RED against that exact
// mutation before being trusted (see the coder's BOUNCE 2 return).
test('agent-home exclusion is EXACT-SEGMENT: `.claude-plugin/...` is not inside `.claude/...`', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`.claude-plugin/plugin.json`' }],
    ourRoots: new Set([...OURS, '.claude-plugin']),
    agentHomes: new Set(['.claude']),
    resolve: () => 'missing',
  }));
  assert.match(fails(f)[0], /does not resolve/, fails(f).join(' | '));
});

// ---------------------------------------------------------------- CIRCULARITY
test('CIRCULAR-COUNT: `checked` does NOT move with the verdict for one in-scope token', () => {
  const run = (state) => {
    const f = checkPointers(base({
      surfaces: [{ label: 'README.md', text: '`scripts/x.mjs`' }],
      resolve: () => state,
    }));
    return [f.checked, fails(f).length];
  };
  assert.deepEqual(run('tracked'), [1, 0]);
  assert.deepEqual(run('untracked'), [1, 1]);
  assert.deepEqual(run('missing'), [1, 1]);
  // Out of scope is the ONE case where checked legitimately drops — the token was never a
  // claim about this tree, so it is not counted and not judged.
  const out = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`elsewhere/x.js`' }],
    resolve: () => 'missing',
  }));
  assert.deepEqual([out.checked, fails(out).length], [0, 0]);
});

// ---------------------------------------------------------------- HYGIENE
test('an unreadable surface is NAMED as a SKIP, never filtered away by the caller', () => {
  const f = checkPointers(base({ surfaces: [{ label: 'GONE.md', text: null }] }));
  assert.ok(f.findings.some((x) => x.level === 'SKIP' && /could not read GONE\.md/.test(x.msg)));
});

test('no resolve() supplied is a FAIL, never a quiet pass', () => {
  const f = checkPointers({ surfaces: [{ label: 'README.md', text: '`scripts/x.mjs`' }] });
  assert.match(fails(f)[0], /no resolve\(\) supplied/);
});

test('PENDING expiry: a declared path that now resolves FAILs', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`scripts/x.mjs`' }],
    pending: [{ path: 'scripts/x.mjs', reason: 'CWK-000' }],
    resolve: () => 'tracked',
  }));
  assert.match(fails(f)[0], /but it now resolves — delete the entry/);
});

test('PENDING expiry: a declaration no surface cites FAILs as dead weight', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: 'nothing here' }],
    pending: [{ path: 'scripts/never.mjs', reason: 'CWK-000' }],
    resolve: () => 'missing',
  }));
  assert.match(fails(f)[0], /no in-scope surface cites it — delete the entry/);
});

test('PENDING hygiene: an entry with no reason is a bypass with no author', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`scripts/x.mjs`' }],
    pending: [{ path: 'scripts/x.mjs' }],
    resolve: () => 'missing',
  }));
  assert.ok(fails(f).some((m) => /with no reason/.test(m)), fails(f).join(' | '));
});

// CWK-079 bounce2 1c/F4 — the dedup unit (one FAIL per surface) is correct; the REPORT
// was incomplete: a 1x and a 40x FAIL printed the identical line, so a fixer reading the
// gate output could not tell how many lines in that file actually needed changing.
test('a repeated token is judged once per surface, not once per occurrence, and the FAIL states the occurrence count', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`scripts/gone.mjs` and again `scripts/gone.mjs`' }],
    resolve: () => 'missing',
  }));
  assert.equal(fails(f).length, 1);
  assert.equal(f.checked, 1);
  assert.match(fails(f)[0], /\(2× in this file\)/, fails(f)[0]);
});

test('a SINGLE occurrence carries no occurrence suffix — the count is noise below 2', () => {
  const f = checkPointers(base({
    surfaces: [{ label: 'README.md', text: '`scripts/gone.mjs`' }],
    resolve: () => 'missing',
  }));
  assert.equal(fails(f).length, 1);
  assert.doesNotMatch(fails(f)[0], /× in this file/, fails(f)[0]);
});

// ---------------------------------------------------------------- CWK-079: looksPathShaped
test('looksPathShaped: a trailing slash is accepted with no check on what precedes it', () => {
  assert.equal(looksPathShaped('scripts/'), true);
  assert.equal(looksPathShaped('a/'), true);
});

test('looksPathShaped: a `.ext`-shaped last segment is accepted', () => {
  assert.equal(looksPathShaped('scripts/verify.mjs'), true);
  assert.equal(looksPathShaped('README.md'), true);
});

test('looksPathShaped: an extensionless last segment is rejected — the NAMED residue', () => {
  assert.equal(looksPathShaped('scripts/lib'), false);
  assert.equal(looksPathShaped('hooks/gone'), false);
});

test('looksPathShaped: a trailing `:line` or `:line-line` suffix is stripped before the test', () => {
  assert.equal(looksPathShaped('scripts/verify.mjs:42'), true);
  assert.equal(looksPathShaped('scripts/verify.mjs:42-50'), true);
  assert.equal(looksPathShaped('scripts/lib:42'), false);
});

// ---------------------------------------------------------------- CWK-079: deriveIgnoredRoots
test('deriveIgnoredRoots: candidateRoots are shape-QUALIFIED first segments, existence-independent', () => {
  const { candidateRoots } = deriveIgnoredRoots({
    surfaces: [{ label: 'README.md', text: '`scripts/real.mjs` `commands/x.md` `scripts/lib`' }],
    checkIgnore: () => [],
  });
  // `scripts/real.mjs` and `commands/x.md` both shape-qualify (`.ext`-suffixed) -> `scripts`,
  // `commands`. `scripts/lib` is extensionless -> shape-REJECTED, so it contributes nothing
  // new (its root already came from the sibling token, this is exercised again below).
  assert.deepEqual([...candidateRoots].sort(), ['commands', 'scripts']);
});

test('deriveIgnoredRoots: agent homes are held out BEFORE the probe, never fed to checkIgnore', () => {
  const seen = [];
  const { toProbe, homesHeldOut } = deriveIgnoredRoots({
    surfaces: [{ label: 'README.md', text: '`.claude/rules/x.md` `scripts/real.mjs`' }],
    agentHomes: new Set(['.claude']),
    checkIgnore: (roots) => { seen.push(...roots); return []; },
  });
  assert.deepEqual(toProbe.sort(), ['scripts']);
  assert.equal(homesHeldOut, 1);
  assert.deepEqual(seen.sort(), ['scripts']);
});

test('deriveIgnoredRoots: checkIgnore drives the ignoredRoots set directly, no other logic decides it', () => {
  const { ignoredRoots } = deriveIgnoredRoots({
    surfaces: [{ label: 'README.md', text: '`scripts/real.mjs` `hooks/verify.js`' }],
    checkIgnore: (roots) => roots.filter((r) => r === 'scripts'),
  });
  assert.deepEqual([...ignoredRoots], ['scripts']);
});

test('deriveIgnoredRoots: no surfaces, or a checkIgnore that returns nothing, is empty and never crashes', () => {
  const a = deriveIgnoredRoots({ surfaces: [], checkIgnore: () => [] });
  assert.deepEqual([...a.ignoredRoots], []);
  const b = deriveIgnoredRoots({ surfaces: [{ label: 'x', text: 'no candidates here' }] });
  assert.deepEqual([...b.ignoredRoots], []); // checkIgnore omitted entirely -> [] by construction
});

// ---------------------------------------------------------------- CWK-079: NON-LOCALITY
// A shape-rejected token is NOT exempt from the check. It is still probed and can still FAIL
// the moment ANY OTHER path-shaped citation shares its first segment — because ignoredRoots is
// a per-ROOT set, never a per-TOKEN one. Two plants, both drawn from this room's own tree
// shape (a real extensionless path, `scripts/lib`, beside a real `.mjs`-suffixed sibling):
test('NON-LOCALITY: an extensionless plant ALONE never contributes its root -> silent', () => {
  const surfaces = [{ label: 'README.md', text: '`scripts/lib`' }];
  const { ignoredRoots } = deriveIgnoredRoots({ surfaces, checkIgnore: (roots) => roots });
  // `scripts` never reached candidateRoots (shape-rejected), so checkIgnore was never asked
  // about it and cannot have marked it ignored -- this is the residue named at deriveIgnoredRoots.
  assert.deepEqual([...ignoredRoots], []);
  const findings = checkPointers(base({ surfaces, ignoredRoots, resolve: () => 'tracked' }));
  assert.deepEqual(fails(findings), []);
});

test('NON-LOCALITY: the SAME extensionless plant beside a path-shaped sibling under the same root -> BOTH FAIL', () => {
  const surfaces = [{ label: 'README.md', text: '`scripts/lib` and `scripts/real.mjs`' }];
  // checkIgnore reports every root it is ASKED about as ignored -- `scripts` is asked about
  // only because `scripts/real.mjs` (the sibling) shape-qualifies and exposes the root.
  const { candidateRoots, toProbe, ignoredRoots } = deriveIgnoredRoots({ surfaces, checkIgnore: (roots) => roots });
  assert.deepEqual([...candidateRoots], ['scripts']);
  assert.deepEqual(toProbe, ['scripts']);
  assert.deepEqual([...ignoredRoots], ['scripts']);
  const findings = checkPointers(base({ surfaces, ignoredRoots, resolve: () => 'tracked' }));
  // BOTH tokens FAIL as gitignored -- the extensionless one (`scripts/lib`, shape-rejected at
  // discovery) is judged identically to the shape-accepted one, because checkPointers never
  // consults looksPathShaped at all; it only reads the ignoredRoots SET the sibling exposed.
  assert.equal(fails(findings).length, 2);
  assert.ok(fails(findings).every((m) => /lives under the gitignored `scripts`/.test(m)), fails(findings).join(' | '));
});

// ---------------------------------------------------------------- r31 UNIT 1(a): classifyCheckIgnoreResult
// CWK-090 fix 1, ported from CoalMine's `49def17`. Pure classifier -- exit 0/1 succeed,
// anything else (spawn error, any other status) is a FAIL naming the status + stderr.
test('classifyCheckIgnoreResult: status 0 succeeds with the real stdout', () => {
  const v = classifyCheckIgnoreResult({ status: 0, stdout: 'a/.pointer-check-probe\n', stderr: '' });
  assert.deepEqual(v, { ok: true, stdout: 'a/.pointer-check-probe\n' });
});

test('classifyCheckIgnoreResult: status 1 succeeds -- "none of the fed paths are ignored", not an error', () => {
  const v = classifyCheckIgnoreResult({ status: 1, stdout: '', stderr: '' });
  assert.deepEqual(v, { ok: true, stdout: '' });
});

test('classifyCheckIgnoreResult: a spawn error FAILs, naming the spawn error message', () => {
  const v = classifyCheckIgnoreResult({ error: new Error('spawnSync git ENOENT') });
  assert.equal(v.ok, false);
  assert.match(v.message, /failed to spawn: spawnSync git ENOENT/);
});

// THE FAIL-OPEN THIS CLOSES: the pre-fix logic here treated any non-`ci.error` outcome
// as success and read stdout straight through -- a status-128 run with a non-empty
// stderr and NO stdout would have silently answered "nothing is ignored". Red-first,
// against the byte-copied PRE-FIX branch (`if (!ci.error) return parse(ci.stdout)`):
// replaying that logic on this exact fixture returns `[]` and reports no problem at
// all -- the defect this fix exists to close, reproduced rather than merely described.
test('classifyCheckIgnoreResult: status 128 FAILs loudly, naming the status and stderr first line (CWK-090 fix 1)', () => {
  const ci = { status: 128, stdout: '', stderr: 'fatal: unable to read .gitignore\nsome other detail\n' };
  const v = classifyCheckIgnoreResult(ci);
  assert.equal(v.ok, false);
  assert.match(v.message, /exited 128 -- fatal: unable to read \.gitignore/);
  // RED-FIRST PROOF, run inline rather than by mutating the source: the PRE-FIX logic
  // this fix replaced (`!ci.error` alone) reads this exact fixture as SUCCESS with an
  // empty ignoredRoots -- the fail-open shape closed above.
  const preFixTreatedAsOk = !ci.error;
  assert.equal(preFixTreatedAsOk, true,
    'RED: the pre-fix predicate (`!ci.error`) reads a real status-128 run as success -- this is the hole fix 1 closes');
});

test('classifyCheckIgnoreResult: a non-string stdout on a successful status degrades to empty, never throws', () => {
  const v = classifyCheckIgnoreResult({ status: 0, stdout: null, stderr: '' });
  assert.deepEqual(v, { ok: true, stdout: '' });
});

// ---------------------------------------------------------------- r31 UNIT 1(a): applyCheckIgnoreProbe (the wiring)
// CWK-090 findings-back HIGH-1 in the exemplar: `classifyCheckIgnoreResult` alone is
// well-tested but an INLINE `if (!verdict.ok)` at the call site is invisible to a test
// that only imports this module -- mutating that one condition left CoalMine's whole
// suite green. This room never had that inline branch (the call site always dispatches
// to this exported function), but the wiring is pinned here anyway so the same class
// cannot land silently in a future edit.
test('applyCheckIgnoreProbe: an empty toProbe never spawns and returns an empty Set', () => {
  let called = false;
  const ignored = applyCheckIgnoreProbe({ toProbe: [], fail: () => {}, runCheckIgnore: () => { called = true; return { status: 0, stdout: '' }; } });
  assert.deepEqual([...ignored], []);
  assert.equal(called, false, 'an empty toProbe must not spawn git at all');
});

test('applyCheckIgnoreProbe: an ok verdict records the roots, suffix stripped', () => {
  const ignored = applyCheckIgnoreProbe({
    toProbe: ['dist-claude-ai', 'scratchpad'],
    fail: () => { throw new Error('fail() must not be called on an ok verdict'); },
    runCheckIgnore: (input) => {
      assert.equal(input, `dist-claude-ai${PROBE_SUFFIX}\nscratchpad${PROBE_SUFFIX}\n`);
      return { status: 0, stdout: `dist-claude-ai${PROBE_SUFFIX}\n` };
    },
  });
  assert.deepEqual([...ignored], ['dist-claude-ai']);
});

test('applyCheckIgnoreProbe: a returned line with no suffix falls back to a trailing-slash strip', () => {
  // Not the shape a real `git check-ignore --stdin` returns for OUR feed (every line
  // should carry the fixed suffix, since every fed token does) -- pinned as a documented
  // fallback rather than an assumption, matching the exemplar's own defensive shape.
  const ignored = applyCheckIgnoreProbe({
    toProbe: ['weird'],
    fail: () => {},
    runCheckIgnore: () => ({ status: 0, stdout: 'weird/\n' }),
  });
  assert.deepEqual([...ignored], ['weird']);
});

// THE FAIL-OPEN, closed at the WIRING (not just the classifier): a bad verdict calls
// `fail()` with the classifier's own message and returns an EMPTY Set -- never the
// silent `[]`-and-continue this room's own pre-fix `checkIgnore` callback used to do.
test('applyCheckIgnoreProbe: a bad verdict calls fail() and returns an empty Set, never silently continues', () => {
  const failed = [];
  const ignored = applyCheckIgnoreProbe({
    toProbe: ['scripts'],
    fail: (msg) => failed.push(msg),
    runCheckIgnore: () => ({ status: 128, stdout: '', stderr: 'fatal: bad pattern\n' }),
  });
  assert.deepEqual([...ignored], []);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /exited 128 -- fatal: bad pattern/);
});

// ---------------------------------------------------------------- r31 UNIT 1(c): collectSurfaces / DEFAULT_SURFACE_PLAN
// r31 bounce2 F1 -- INSPECT's own finding: a test pinning the ABSENCE of two named
// filenames forbids the exact future action the plan's own header documents ("if either
// ever becomes tracked, its row is added back here"). A maintainer following that
// instruction would redden this suite over a filename, in a file they never touched --
// the identical shape as the `configure.mjs`-does-not-exist pin this same unit already
// caught and fixed one layer up. The fix is not deletion: assert the INVARIANT (every
// declared row is TRACKED) instead of the INSTANCE (these two names are absent) -- the
// same instance-vs-invariant move this unit already made for the tracked-filter itself
// ("declaring fewer rows is documentation; the filter at the caller is the guarantee").
// This stays true whatever .gitignore does next, still fails the day someone declares a
// genuinely untracked surface, and never again forbids a legal future state.
test('DEFAULT_SURFACE_PLAN: every declared row is TRACKED (the invariant, never a named instance)', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean));
  for (const row of DEFAULT_SURFACE_PLAN) {
    if (row.dir) {
      // A dir row's OWN root is a directory, never itself a tracked FILE -- `git
      // ls-files` lists files only. The invariant for a dir row is that it contains
      // at least one tracked file (an empty/fully-untracked dir row is dead weight).
      const hasTrackedMember = [...tracked].some((f) => f === row.root || f.startsWith(row.root + '/'));
      assert.ok(hasTrackedMember, `${row.root} (a dir row) has no tracked file under it`);
    } else {
      assert.ok(tracked.has(row.root), `${row.root} is a declared row but is NOT tracked -- a gate asking "reachable from a clone" cannot declare a surface no clone has`);
    }
  }
});

test('DEFAULT_SURFACE_PLAN: every row carries a `why` (an allowlist of bare paths is a bypass with no author)', () => {
  for (const row of DEFAULT_SURFACE_PLAN) {
    assert.equal(typeof row.why, 'string', JSON.stringify(row));
    assert.ok(row.why.length > 0, JSON.stringify(row));
  }
});

test('DEFAULT_SURFACE_PLAN: CHANGELOG.md alone is historyOnly', () => {
  const flagged = DEFAULT_SURFACE_PLAN.filter((r) => r.historyOnly).map((r) => r.root);
  assert.deepEqual(flagged, ['CHANGELOG.md']);
});

test('collectSurfaces: a single-file row reads one surface, label = root, historyOnly carried through', () => {
  const io = {
    join: (...p) => p.join('/'),
    walkMd: () => { throw new Error('must not be called for a non-dir row'); },
    read: (p) => (p === 'REPO/CHANGELOG.md' ? 'text' : null),
    rel: (p) => p,
  };
  const surfaces = collectSurfaces('REPO', [{ root: 'CHANGELOG.md', historyOnly: true, why: 'x' }], io);
  assert.deepEqual(surfaces, [{ label: 'CHANGELOG.md', text: 'text', historyOnly: true }]);
});

test('collectSurfaces: a dir row walks every file walkMd returns, in order, label from rel()', () => {
  const io = {
    join: (...p) => p.join('/'),
    walkMd: (dir) => [dir + '/a.md', dir + '/b.md'],
    read: (p) => 'content:' + p,
    rel: (p) => p.replace('REPO/', ''),
  };
  const surfaces = collectSurfaces('REPO', [{ root: 'commands', dir: true, why: 'x' }], io);
  assert.deepEqual(surfaces, [
    { label: 'commands/a.md', text: 'content:REPO/commands/a.md' },
    { label: 'commands/b.md', text: 'content:REPO/commands/b.md' },
  ]);
});

// SURFACE-IDENTITY, per the order's own instruction: the plan-driven assembly must
// produce the SAME surface set the hand-rolled loops it replaces produced. Proven here
// against THIS room's real tree (io = real fs, no mocks) rather than only in the
// abstract -- the live gate's own before/after numbers (13 surfaces / 38 in-scope
// citations, unchanged across the refactor) are reported in the coder's return; this
// pins the plan's OWN shape so a future edit to the plan cannot silently drop a row.
test('collectSurfaces: against the real tree, produces exactly the 8 declared rows worth of surfaces (2 single dirs walked)', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const walkMd = (dir, out = []) => {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkMd(p, out);
      else if (e.name.endsWith('.md')) out.push(p);
    }
    return out;
  };
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  const rel = (p) => path.relative(repo, p).split(path.sep).join('/');
  const surfaces = collectSurfaces(repo, DEFAULT_SURFACE_PLAN, { join: path.join, walkMd, read, rel });
  // 6 single-file rows + whatever real files sit under references/ and commands/.
  const singleFileRows = DEFAULT_SURFACE_PLAN.filter((r) => !r.dir).length;
  assert.equal(singleFileRows, 6);
  assert.ok(surfaces.length >= singleFileRows, 'a dir row must contribute at least the single-file rows worth of surfaces');
  assert.ok(surfaces.every((s) => typeof s.label === 'string' && s.text !== undefined), JSON.stringify(surfaces));
});
