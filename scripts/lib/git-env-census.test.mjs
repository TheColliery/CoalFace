import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { censusGitSpawns, collectSources, blobId, EXEMPT_CARRIERS, TRUSTED_DEFINERS } from './git-env-census.mjs';
import { VECTORS, P_FILES, P_BLOBS } from './git-env-census.vectors.mjs';

// Fixture source text is BUILT, never written as a literal call: this file is itself scanned by the census
// (scripts/**/*.mjs), and a literal git spawn inside a string would be read as a real one.
const here = path.dirname(fileURLToPath(import.meta.url));
const GIT = "'git'";
const call = (opts, fn = 'spawnSync') => fn + '(' + GIT + ", ['status'], " + opts + ');';
const files = (text, rel = 'scripts/x.mjs') => [{ rel, text }];
const refused = (text) => censusGitSpawns(files(text)).findings;

test('RED-FIRST CWK-136: env: process.env on a git spawn is REFUSED (the hole the presence census passes)', () => {
  const r = refused(call('{ cwd: d, env: process.env }'));
  assert.equal(r.length, 1);
  assert.match(r[0], /process\.env/);
  assert.match(r[0], /scripts\/x\.mjs:1/);
});

test('a spread of process.env beside other keys is refused, and a missing env: is refused', () => {
  assert.equal(refused(call("{ env: { ...process.env, X: '1' } }", 'execFileSync')).length, 1);
  const none = refused(call('{ cwd: d }'));
  assert.equal(none.length, 1);
  assert.match(none[0], /no 'env:'/);
});

test('gitEnv(...) alone passes, with and without a ceiling, and across a multi-line call', () => {
  assert.deepEqual(refused(call('{ cwd: d, env: gitEnv(path.dirname(d)) }')), []);
  assert.deepEqual(refused(call('{\n  cwd: d,\n  env: gitEnv(),\n}', 'execFileSync')), []);
});

test('an identifier passes only when declared const X = gitEnv(...) and never mutated', () => {
  const use = call('{ env: E }');
  assert.deepEqual(refused('const E = gitEnv();\n' + use), []);
  assert.equal(refused('const E = { ...process.env };\n' + use).length, 1, 'declared from process.env');
  assert.equal(refused("const E = gitEnv();\nE.GIT_DIR = 'x';\n" + use).length, 1, 'mutated after');
  assert.equal(refused('const E = gitEnv();\ndelete E.GIT_CEILING_DIRECTORIES;\n' + use).length, 1, 'deleted from');
  assert.equal(refused(call('{ env: someUndeclared }')).length, 1, 'no declaration at all');
});

test('an expression that merely CONTAINS gitEnv( is refused: presence of the helper is not the property', () => {
  assert.equal(refused(call('{ env: base || gitEnv() }')).length, 1);
  assert.equal(refused(call('{ env: Object.assign(gitEnv(), extra) }')).length, 1);
  assert.equal(refused(call("{ env: { ...gitEnv(), X: '1' } }")).length, 1);
});

// r12 findings-back L-5: CALL_RE took only ' and " as the quote around git, so a quote-less template literal
// spawn was unseen AND not named open. The backtick is built (String.fromCharCode) so this file stays clean
// of a literal call the census would read.
const BT = String.fromCharCode(96);
const btCall = (opts, fn = 'spawnSync') => fn + '(' + BT + 'git' + BT + ", ['status'], " + opts + ');';
test('L-5: a backtick-quoted git command is SEEN and refused without gitEnv, and passes with it', () => {
  const bad = censusGitSpawns(files(btCall('{ cwd: d, env: process.env }')));
  assert.equal(bad.spawns, 1, 'the census must count the backtick-quoted spawn');
  assert.equal(bad.findings.length, 1);
  assert.match(bad.findings[0], /process\.env/);
  assert.equal(refused(btCall('{ cwd: d }', 'execFileSync')).length, 1, 'a missing env: is refused too');
  const ok = censusGitSpawns(files(btCall('{ cwd: d, env: gitEnv() }')));
  assert.equal(ok.spawns, 1);
  assert.deepEqual(ok.findings, []);
});

test('a comment mention, a node child and a non-git command are not git spawns', () => {
  const text = [
    '// ' + call('{ env: process.env }'),
    '/* a block comment',
    '  * ' + call('{}'),
    '*/',
    'const s = ' + JSON.stringify(call('{}')) + ';',
    'spawnSync(process.execPath, ["a"], { env: process.env });',
    "spawnSync('cmd.exe', ['/c'], {});",
  ].join('\n');
  const r = censusGitSpawns(files(text));
  assert.deepEqual(r.findings, []);
  assert.equal(r.spawns, 0);
});

test('unbalanced parens report as a finding, never a silent pass', () => {
  assert.match(refused('spawnSync(' + GIT + ", ['init'], { env: gitEnv()")[0], /unbalanced/);
});

test("THIS room's own sources pass: every git spawn takes env from gitTestEnv() or gitEnv() alone", () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = censusGitSpawns(collectSources(repo));
  assert.deepEqual(r.findings, []);
  assert.ok(r.spawns >= 6, "the census must actually SEE this room's spawns, saw " + r.spawns);
});

test('R14 CWK-174: an exempt carrier passes ONLY while its content is exactly the pinned blob', () => {
  const rel = 'scripts/carrier.test.mjs';
  const text = call('{ cwd: d }');
  assert.equal(censusGitSpawns(files(text, rel)).findings.length, 1, 'not exempt: the bare spawn is refused');
  const exempt = { [rel]: blobId(text) };
  assert.equal(censusGitSpawns(files(text, rel), exempt).findings.length, 0, 'pinned blob: exempt');
  const edited = censusGitSpawns(files(text + ' // edit', rel), exempt).findings;
  assert.equal(edited.length, 1, 'any edit makes it a finding again');
  assert.match(edited[0], /re-derive/);
  assert.equal(censusGitSpawns(files(text, 'scripts/other.mjs'), exempt).findings.length, 1, 'the exemption names a path, nothing else');
});

test('R14 CWK-174: blobId matches git hash-object for a known blob, and the one pin left names the secret-gate test (08d measured every other pin out)', () => {
  assert.equal(blobId(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(blobId('hello' + String.fromCharCode(10)), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.deepEqual(Object.keys(EXEMPT_CARRIERS), ['scripts/secret-gate.test.mjs', 'scripts/secret-scan.test.mjs']);
});

test('R14 CWK-136: gitTestEnv(...) alone passes exactly like gitEnv(...), and the same refusals bind it', () => {
  assert.deepEqual(refused(call('{ cwd: d, env: gitTestEnv(path.dirname(d)) }')), []);
  assert.deepEqual(refused('const E = gitTestEnv(path.dirname(d));\n' + call('{ env: E }')), []);
  assert.equal(refused(call('{ env: { ...gitTestEnv(path.dirname(d)), X: ' + "'1'" + ' } }')).length, 1, 'a spread around it is refused');
  assert.equal(refused(call('{ env: base || gitTestEnv(path.dirname(d)) }')).length, 1, 'an expression that merely contains it is refused');
  assert.equal(refused(call('{ env: { ...process.env, GIT_CEILING_DIRECTORIES: c } }')).length, 1, 'the pre-R5 shape (process.env spread plus a ceiling) is refused');
});

// R14 bounce 1 / L4: a call that MUTATES the declared env object is as bad as an assignment to it.
test('R14 L4: Object.assign(env, ...) and Object.defineProperty(env, ...) on a declared helper env are refused', () => {
  const use = call('{ env: E }');
  assert.deepEqual(refused('const E = gitEnv();\n' + use), [], 'control: untouched passes');
  assert.equal(refused('const E = gitEnv();\nObject.assign(E, process.env);\n' + use).length, 1, 'Object.assign');
  assert.equal(refused('const E = gitTestEnv(d);\nObject.assign( E, extra);\n' + use).length, 1, 'Object.assign, spaced');
  assert.equal(refused("const E = gitEnv();\nObject.defineProperty(E, 'GIT_DIR', { value: x });\n" + use).length, 1, 'Object.defineProperty');
});

// 08c step 3 (main's ruling UMB-456 (2)): the ALLOWLIST env shape. An env built from NAMED keys, that never passes process.env
// unfiltered, carries GIT_CONFIG_NOSYSTEM='1' and sets no other GIT_* key than the narrowing ones, passes without a pin.
const LIST = "const KEEP = ['PATH', 'Path', 'HOME'];\n";
const FILTERED = '...Object.fromEntries(KEEP.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]))';
const useEnv = call('{ env }');
const decl = (body) => LIST + 'const env = { ' + body + ' };\n' + useEnv;
const NOSYS = "GIT_CONFIG_NOSYSTEM: '1'";

test('08c: an allowlist env (a filtered spread of named keys + GIT_CONFIG_NOSYSTEM) passes with NO pin, as an identifier', () => {
  assert.deepEqual(refused(decl(FILTERED + ', ' + NOSYS)), []);
  assert.deepEqual(refused(decl(FILTERED + ", " + NOSYS + ", GIT_TERMINAL_PROMPT: '0', GIT_CEILING_DIRECTORIES: cap")), [], 'the narrowing keys are allowed');
  assert.deepEqual(refused(decl(FILTERED + ', HOME: dir, ' + NOSYS)), [], 'a non-GIT key with a value is allowed');
});

test('08c: a full-line comment inside the allowlist literal is not an entry', () => {
  assert.deepEqual(refused(decl(FILTERED + ',\n  // why HOME is redirected\n  HOME: dir,\n  ' + NOSYS)), []);
});

test('08c: an allowlist env passes inline in the call, and through a helper (arrow or function) that returns the literal', () => {
  assert.deepEqual(refused(LIST + call('{ env: { ' + FILTERED + ', ' + NOSYS + ' } }')), []);
  const arrow = LIST + 'const mkEnv = (dir) => ({ ' + FILTERED + ', HOME: dir, ' + NOSYS + ' });\n' + call('{ env: mkEnv(d) }');
  assert.deepEqual(refused(arrow), []);
  const fn = LIST + 'function mkEnv(dir) { return { ' + FILTERED + ', HOME: dir, ' + NOSYS + ' }; }\n' + call('{ env: mkEnv(d) }');
  assert.deepEqual(refused(fn), []);
});

test('08c: an UNFILTERED process.env spread or Object.assign still FAILS, even with GIT_CONFIG_NOSYSTEM set', () => {
  assert.equal(refused(decl('...process.env, ' + NOSYS)).length, 1, 'spread');
  assert.equal(refused(call("{ env: { ...process.env, " + NOSYS + ' } }')).length, 1, 'inline spread');
  assert.equal(refused("const env = Object.assign({}, process.env, { GIT_CONFIG_NOSYSTEM: '1' });\n" + useEnv).length, 1, 'Object.assign');
  assert.equal(refused(decl('...process.env')).length, 1);
  assert.equal(refused(decl(FILTERED + ', ...process.env, ' + NOSYS)).length, 1, 'a filtered spread does not excuse a second, bare one');
});

test('08c: an allowlist without GIT_CONFIG_NOSYSTEM, or with it not set to 1, FAILS', () => {
  assert.equal(refused(decl(FILTERED)).length, 1, 'missing');
  assert.equal(refused(decl(FILTERED + ", GIT_CONFIG_NOSYSTEM: '0'")).length, 1, 'zero');
  assert.equal(refused(decl(FILTERED + ', GIT_CONFIG_NOSYSTEM: x')).length, 1, 'a variable');
});

test('08c: an allowlist that sets another GIT_* key, or lists one in its named keys, FAILS', () => {
  assert.equal(refused(decl(FILTERED + ', ' + NOSYS + ", GIT_DIR: 'x'")).length, 1, 'GIT_DIR key');
  assert.equal(refused(decl(FILTERED + ', ' + NOSYS + ", GIT_INDEX_FILE: 'x'")).length, 1, 'GIT_INDEX_FILE key');
  assert.equal(refused("const KEEP = ['PATH', 'GIT_DIR'];\nconst env = { " + FILTERED + ', ' + NOSYS + ' };\n' + useEnv).length, 1, 'GIT_DIR in the named list');
  assert.equal(refused('const env = { ' + FILTERED + ', ' + NOSYS + ' };\n' + useEnv).length, 1, 'the named list is not declared in the file');
});

test('08c: an allowlist env mutated afterwards, or built with an unknown spread or computed key, FAILS', () => {
  assert.equal(refused(decl(FILTERED + ', ' + NOSYS) + "env.GIT_DIR = 'x';\n").length, 1, 'mutated');
  assert.equal(refused(decl(FILTERED + ', ' + NOSYS) + 'Object.assign(env, other);\n').length, 1, 'assigned into');
  assert.equal(refused(decl(FILTERED + ', ' + NOSYS + ', ...extra')).length, 1, 'an unknown spread');
  assert.equal(refused(decl(FILTERED + ', ' + NOSYS + ', [k]: 1')).length, 1, 'a computed key');
  assert.equal(refused(LIST + 'const mkEnv = (dir, extra) => ({ ' + FILTERED + ', ...extra, ' + NOSYS + ' });\n' + call('{ env: mkEnv(d) }')).length, 1, 'a helper spreading its parameter');
});

test("08d: the canon release-notes.mjs and (at 7e779ef8) release-notes.test.mjs pass with NO pin; sandboxEnv is one literal of named keys with GIT_CONFIG_NOSYSTEM", () => {
  const read = (rel) => ({ rel, text: fs.readFileSync(path.join(here, '..', '..', rel), 'utf8') });
  const notes = censusGitSpawns([read('scripts/release-notes.mjs')], {});
  assert.deepEqual(notes.findings, []);
  assert.ok(notes.spawns >= 1);
  const tst = censusGitSpawns([read('scripts/release-notes.test.mjs')], {});
  assert.deepEqual(tst.findings, []);
  assert.ok(tst.spawns >= 1);
});

test('08c/08d: with no pin the census walks release-notes.mjs, every source is still visited, a pinned carrier is still COUNTED, and nothing is refused', () => {
  const all = collectSources(path.join(here, '..', '..'));
  const r = censusGitSpawns(all);
  assert.equal(r.files, all.length);
  assert.deepEqual(r.findings, []);
  assert.ok(!Object.hasOwn(EXEMPT_CARRIERS, 'scripts/release-notes.mjs'));
  const unpinned = censusGitSpawns(all, {});
  assert.equal(unpinned.spawns, r.spawns, 'a pin hides no spawn from the count');
  assert.ok(r.pinned >= 1, 'the two byte-equal carriers are pinned and their spawns counted');
});

// ---- 08d: THE WITNESS LIST (the chief's scratchpad/dispatch/08d-census-witness-list.md), one test per vector ----------------------------
// Fixtures live in git-env-census.vectors.mjs (data, so an older recogniser can be run on the same text). F1-F42 and R1-R2 must be refused
// AND counted as a spawn; P1-P6 must read clean AND be counted, with NO pin. A vector that declares const env runs in both call forms.
for (const v of VECTORS) {
  test('witness ' + v.expect + ' ' + v.id, () => {
    const r = censusGitSpawns(v.files, {});
    assert.ok(r.spawns >= 1, 'the census must COUNT the spawn it judges');
    if (v.expect === 'FAIL') assert.ok(r.findings.length >= 1, 'must be a finding: ' + v.files.map((f) => f.text).join('---'));
    else assert.deepEqual(r.findings, []);
  });
}
for (const [id, rel] of Object.entries(P_FILES)) {
  test('witness PASS ' + id + ' the canon ' + rel + ' reads clean with no pin, at its canon blob', () => {
    const text = fs.readFileSync(path.join(here, '..', '..', rel), 'utf8');
    assert.equal(blobId(text), P_BLOBS[id], 'this room copy is not the canon blob any more: re-derive it, then update P_BLOBS');
    const r = censusGitSpawns([{ rel, text }], {});
    assert.deepEqual(r.findings, []);
    assert.ok(r.spawns >= 1);
  });
}

// ---- 08d: the trusted names (F42) and the lexer ------------------------------------------------------------------------------------------
test('08d F42: the trusted definers are pinned to the blobs they hold, and a changed definer is its own finding', () => {
  for (const [rel, d] of Object.entries(TRUSTED_DEFINERS)) {
    const text = fs.readFileSync(path.join(here, '..', '..', rel), 'utf8');
    assert.equal(blobId(text), d.blob, rel + ' changed: read the change, then re-pin it');
  }
  const rel = 'scripts/lib/git-env.mjs';
  const r = censusGitSpawns([{ rel, text: '// edited' + String.fromCharCode(10) }]);
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0], /trusted gitEnv\(\)\/gitTestEnv\(\) definer/);
});

test('08d F42: gitEnv() is trusted when imported (statically or by a dynamic destructuring import) from a trusted definer, in a subfolder too', () => {
  const ok = (rel, head) => censusGitSpawns([{ rel, text: head + call('{ env: gitEnv() }') }]).findings;
  assert.deepEqual(ok('scripts/x.mjs', "import { gitEnv } from './lib/git-env.mjs';\n"), []);
  assert.deepEqual(ok('scripts/lib/y.test.mjs', "import { gitEnv } from './git-env.mjs';\n"), []);
  assert.deepEqual(ok('scripts/verify.mjs', "const { gitEnv } = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'git-env.mjs')).href);\n"), []);
  assert.equal(ok('scripts/x.mjs', "import { gitEnv } from './lib/other.mjs';\n").length, 1, 'not a definer');
  assert.equal(ok('scripts/x.mjs', "import { other as gitEnv } from './lib/git-env.mjs';\n").length, 1, 'a different export under the name');
  assert.equal(ok('scripts/x.mjs', "import { gitEnv } from './lib/git-test-env.mjs';\n").length, 1, 'a definer that does not export that name');
  assert.equal(ok('scripts/x.mjs', "const { gitEnv } = await import(pathToFileURL(path.join(repo, 'elsewhere', 'git-env.mjs')).href);\n").length, 1, 'a dynamic import of another path');
  assert.equal(ok('scripts/x.mjs', "import { gitEnv } from './lib/git-env.mjs';\nfunction gitEnv() { return process.env; }\n").length, 1, 'imported AND defined');
});

test('08d F42: a parameter, an alias or a re-export named gitEnv is a value the census cannot follow, and is refused', () => {
  assert.equal(refused('const f = (gitEnv) => ' + call('{ env: gitEnv() }')).length, 1, 'parameter');
  assert.equal(refused('const g = other;\nconst gitEnv = g;\n' + call('{ env: gitEnv() }')).length, 1, 'alias');
  assert.equal(refused(call('{ env: gitEnv() }') + 'run(gitEnv);\n').length, 1, 'passed as a value');
});

test('08d F41: a file the lexer cannot read whole is a finding for its git spawns, never a silent pass', () => {
  const r = censusGitSpawns(files(call('{ env: gitEnv() }') + 'const s = ' + BT + 'never closed;' + String.fromCharCode(10)));
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0], /cannot be read whole/);
  assert.ok(r.spawns >= 1);
});

test('08d: a shebang line is not code, and a spread or a second env: in the options is refused', () => {
  assert.deepEqual(censusGitSpawns(files('#!/usr/bin/env node' + String.fromCharCode(10) + "const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1' };" + String.fromCharCode(10) + call('{ env }'))).findings, []);
  assert.equal(refused(call('{ ...opts, env: gitEnv() }')).length, 1, 'a spread can carry an env');
  assert.equal(refused(call('{ env: gitEnv(), env: other }')).length, 1, 'two env: keys');
  assert.equal(refused('spawnSync(' + GIT + ", ['status'], opts);").length, 1, 'options that are not a literal carry no visible env');
});

test('08d: the allowlist keys are read in their exact case, a duplicate key (any case) is refused, and a shorthand key is refused', () => {
  const lit = (body) => refused('const env = { ' + body + ' };\n' + call('{ env }'));
  assert.deepEqual(lit("GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'"), []);
  assert.equal(lit("GIT_CONFIG_NOSYSTEM: '1', git_terminal_prompt: '0'").length, 1, 'lower-case spelling of an allowed name');
  assert.equal(lit("GIT_CONFIG_NOSYSTEM: '1', Path: a, PATH: b").length, 1, 'duplicate in another case');
  assert.equal(lit("GIT_CONFIG_NOSYSTEM: '1', HOME").length, 1, 'shorthand');
  assert.deepEqual(lit("'GIT_CONFIG_NOSYSTEM': '1', \"HOME\": dir"), [], 'quoted keys');
});

// ---- 08d: one test per rule clause, so a recogniser that loses a clause is caught by name (the mutant table kills each of these) --------------
const KEYS = "const keep = ['PATH', 'HOME'];\n";
const PICK = '...Object.fromEntries(keep.filter((k) => k in process.env).map((k) => [k, process.env[k]]))';
const lit = (body) => refused(KEYS + 'const env = { ' + body + ' };\n' + call('{ env }'));

test('08d tail check: nothing may follow the closing parenthesis of the allowed spread', () => {
  assert.deepEqual(lit(PICK + ", GIT_CONFIG_NOSYSTEM: '1'"), []);
  assert.equal(lit(PICK.slice(0, -1) + ').x' + ", GIT_CONFIG_NOSYSTEM: '1'").length, 1);
  assert.equal(lit('...Object.fromEntries(keep.filter((k) => k in process.env)).x' + ", GIT_CONFIG_NOSYSTEM: '1'").length, 1);
});

test('08d named-key read: a callback or a value may read process.env only one named key at a time', () => {
  const nosys = ", GIT_CONFIG_NOSYSTEM: '1'";
  assert.equal(lit('...Object.fromEntries(keep.filter((k) => process.env).map((k) => [k, process.env[k]]))' + nosys).length, 1, 'filter callback returns the whole env');
  assert.equal(lit('...Object.fromEntries(keep.filter((k) => k in process.env).map((k) => [k, process.env]))' + nosys).length, 1, 'map callback keeps the whole env');
  assert.equal(lit("PATH: process['env'].PATH" + nosys).length, 1, 'process reached by an index');
  assert.equal(lit('all: process.env' + nosys).length, 1, 'a value that is the whole env');
  assert.deepEqual(lit('PATH: process.env.PATH, OS: process.platform' + nosys), [], 'a named key and process.platform are fine');
});

test('08d aliases: a name bound to the whole process.env is refused as a value', () => {
  const nosys = ", GIT_CONFIG_NOSYSTEM: '1'";
  assert.equal(refused("import { env as penv } from 'node:process';\nconst env = { all: penv" + nosys + ' };\n' + call('{ env }')).length, 1, 'imported alias');
  assert.equal(refused('const e = process.env;\nconst env = { all: e' + nosys + ' };\n' + call('{ env }')).length, 1, 'const alias');
  assert.equal(refused('const { env: e } = process;\nconst env = { all: e' + nosys + ' };\n' + call('{ env }')).length, 1, 'destructured alias');
});

test('08d scope binding: an identifier is bound to its one declaration, which must enclose the spawn and precede it', () => {
  const clean = "{ PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1' }";
  assert.equal(refused('function a() { const env = ' + clean + '; return env; }\nfunction b() { ' + call('{ env }') + '}\n').length, 1, 'declared in another function');
  assert.equal(refused(call('{ env }') + 'const env = ' + clean + ';\n').length, 1, 'declared after the spawn');
  assert.deepEqual(refused('function a() { const env = ' + clean + ';\n  return () => { ' + call('{ env }') + ' }; }\n'), [], 'declared in an enclosing block');
  assert.equal(refused('const env = ' + clean + ';\nconst env = ' + clean + ';\n' + call('{ env }')).length, 1, 'declared twice');
});

test('08d helper body: a same-file helper must return ONE literal, and exactly once', () => {
  const nosys = "GIT_CONFIG_NOSYSTEM: '1'";
  assert.deepEqual(refused('function mk(x) { return { PATH: process.env.PATH, ' + nosys + ' }; }\n' + call('{ env: mk(d) }')), []);
  assert.equal(refused('function mk(x) { if (x) return { ' + nosys + ' }; return { ' + nosys + ' }; }\n' + call('{ env: mk(d) }')).length, 1, 'two returns');
  assert.equal(refused('function mk(x) { const e = { ' + nosys + ' }; return e; }\n' + call('{ env: mk(d) }')).length, 1, 'returns an identifier');
  assert.equal(refused('const mk = (x) => process.env;\n' + call('{ env: mk(d) }')).length, 1, 'an arrow whose body is not a literal');
  assert.equal(refused('function mk(x) { return { ' + nosys + ' }; }\nfunction mk(y) { return process.env; }\n' + call('{ env: mk(d) }')).length, 1, 'defined twice');
});

test('08d F42: a trusted definer path with a changed blob that defines its own gitEnv is refused on both counts', () => {
  const rel = 'scripts/secret-gate.mjs';
  const r = censusGitSpawns([{ rel, text: 'const gitEnv = () => ({ ...process.env });' + String.fromCharCode(10) + call('{ env: gitEnv() }') }]);
  assert.equal(r.findings.length, 2);
  assert.match(r.findings.join('|'), /not the pinned/);
  assert.match(r.findings.join('|'), /defines its own gitEnv/);
});

test('08d F42: a dynamic import counts only when its literal path segments ARE the trusted definer path', () => {
  const head = (segs) => 'const { gitEnv } = await import(pathToFileURL(path.join(repo, ' + segs.map((s) => "'" + s + "'").join(', ') + ')).href);' + String.fromCharCode(10);
  assert.deepEqual(refused(head(['scripts', 'lib', 'git-env.mjs']) + call('{ env: gitEnv() }')), []);
  assert.equal(refused(head(['evil', 'scripts', 'lib', 'git-env.mjs']) + call('{ env: gitEnv() }')).length, 1);
  assert.equal(refused(head(['scripts', 'lib', 'git-env.mjs', 'x']) + call('{ env: gitEnv() }')).length, 1);
});

test('08d recognition: the command as git.exe or as a template literal is a COUNTED spawn with a finding', () => {
  const exe = censusGitSpawns(files('spawnSync(' + "'git.exe'" + ", ['status'], { env: process.env });"));
  assert.equal(exe.spawns, 1);
  assert.equal(exe.findings.length, 1);
  const tpl = censusGitSpawns(files('spawnSync(' + BT + 'git' + BT + ", ['status'], { env: process.env });"));
  assert.equal(tpl.spawns, 1);
  assert.equal(tpl.findings.length, 1);
});

test('08d keys: GIT_* names are read case-insensitively, but only the three narrowing ones in their exact case pass; the list holds only plain quoted names', () => {
  const nosys = ", GIT_CONFIG_NOSYSTEM: '1'";
  assert.equal(lit('git_dir: d' + nosys).length, 1);
  assert.equal(lit('Git_Dir: d' + nosys).length, 1);
  assert.equal(lit('GIT_DIR: d' + nosys).length, 1);
  assert.equal(refused("const keep = ['PATH', 'git_dir'];\nconst env = { " + PICK + nosys + ' };\n' + call('{ env }')).length, 1, 'a lower-case GIT name in the list');
  assert.equal(refused("const keep = ['PATH', x];\nconst env = { " + PICK + nosys + ' };\n' + call('{ env }')).length, 1, 'an identifier in the list');
});

test('08d F14: a helper call with no definition in this file says so (pin the file or define the helper), not some later reason', () => {
  const r = refused(call('{ env: sandboxEnv(cwd) }'));
  assert.equal(r.length, 1);
  assert.match(r[0], /cannot follow/);
});

test('08d shorthand slot: { env } counts only inside a call; in a parameter or destructuring pattern it is refused', () => {
  const clean = "{ PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1' }";
  assert.equal(refused('const env = ' + clean + ';\nfunction f({ env }) { ' + call('{ env }') + ' }\n').length, 1, 'a destructured parameter');
  assert.equal(refused('const env = ' + clean + ';\nconst g = ({ env }) => { ' + call('{ env }') + ' };\n').length, 1, 'a destructured arrow parameter');
  assert.equal(refused('const { env } = opts;\n' + call('{ env }')).length, 1, 'a destructuring declaration');
  assert.deepEqual(refused('const env = ' + clean + ';\nrun(a, { env });\n' + call('{ env }')), [], 'a call argument object');
});

test('08d spread grammar: exactly .filter(cb) or .filter(cb).map(cb) over a named list', () => {
  const nosys = ", GIT_CONFIG_NOSYSTEM: '1'";
  const spread = (chain) => lit('...Object.fromEntries(keep' + chain + ')' + nosys);
  assert.deepEqual(spread('.filter((k) => k in process.env)'), []);
  assert.deepEqual(spread('.filter((k) => k in process.env).map((k) => [k, process.env[k]])'), []);
  assert.equal(spread('.map((k) => [k, process.env[k]])').length, 1, 'map without filter');
  assert.equal(spread('.filter((k) => k in process.env).filter(Boolean)').length, 1, 'two filters');
  assert.equal(spread('.map((k) => [k, process.env[k]]).filter(Boolean)').length, 1, 'map then filter');
  assert.equal(spread('').length, 1, 'the list itself');
});
