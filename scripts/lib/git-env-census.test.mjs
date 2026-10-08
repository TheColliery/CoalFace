import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { censusGitSpawns, collectSources, blobId, EXEMPT_CARRIERS } from './git-env-census.mjs';

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
    '  * ' + call('{}'),
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

test('R14 CWK-174: blobId matches git hash-object for a known blob, and the pins name only the canon carriers (the scanner pair, the secret-gate test and the release-notes test)', () => {
  assert.equal(blobId(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(blobId('hello' + String.fromCharCode(10)), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.deepEqual(Object.keys(EXEMPT_CARRIERS).sort(), ['scripts/release-notes.test.mjs', 'scripts/secret-gate.test.mjs', 'scripts/secret-scan.test.mjs']);
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

test("08c: the canon release-notes.mjs passes with NO pin; its test's sandboxEnv has no GIT_CONFIG_NOSYSTEM, so it keeps its pin", () => {
  const read = (rel) => ({ rel, text: fs.readFileSync(path.join(here, '..', '..', rel), 'utf8') });
  const notes = censusGitSpawns([read('scripts/release-notes.mjs')], {});
  assert.deepEqual(notes.findings, []);
  assert.ok(notes.spawns >= 1);
  const tst = censusGitSpawns([read('scripts/release-notes.test.mjs')], {});
  assert.ok(tst.findings.length >= 1 && /sandboxEnv/.test(tst.findings[0]), tst.findings.join(' | '));
});

test('08c: with the release-notes.mjs pin gone the census walks that file (the spawn count rose), every source is still visited, and nothing is refused', () => {
  const all = collectSources(path.join(here, '..', '..'));
  const r = censusGitSpawns(all);
  const withOldPin = censusGitSpawns(all, { ...EXEMPT_CARRIERS, 'scripts/release-notes.mjs': blobId(all.find((f) => f.rel === 'scripts/release-notes.mjs').text) });
  assert.equal(r.files, all.length);
  assert.equal(r.spawns, withOldPin.spawns + 1, 'the pinned copy skipped its one spawn; unpinned it is walked and passes by shape');
  assert.deepEqual(r.findings, []);
  assert.ok(!Object.hasOwn(EXEMPT_CARRIERS, 'scripts/release-notes.mjs'));
});
