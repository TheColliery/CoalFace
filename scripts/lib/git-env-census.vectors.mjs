// 08d -- the census WITNESS LIST as test vectors (the chief's `scratchpad/dispatch/08d-census-witness-list.md`: F1-F42 and R1-R2 must be
// refused, P1-P6 must pass with no pin). Each vector is a set of whole source files (usually one) that a git-spawn census reads; a vector
// that declares `const env` is built in BOTH call forms, `{ env }` and `{ env: env }` (CoalTipple's A1 and A9 were shorthand-only holes).
// This file is DATA, so a census run on an older recogniser (the before table) and the current one read the same fixtures.
//
// Fixture text is BUILT here from named pieces and never written as a literal call: this file is itself scanned by the census.
const GIT = "'git'";
const BT = String.fromCharCode(96);
const NOSYS = "GIT_CONFIG_NOSYSTEM: '1'";
const KEEP = "const keep = ['PATH', 'HOME'];\n";
const PICK = '...Object.fromEntries(keep.filter((k) => k in process.env).map((k) => [k, process.env[k]]))';
const IMPORT = "import { spawnSync } from 'node:child_process';\n";
const spawn = (opts) => 'spawnSync(' + GIT + ", ['status'], " + opts + ');\n';
const CLEAN = '{ PATH: process.env.PATH, ' + NOSYS + ' }';

// Every vector: { id, expect: 'FAIL' | 'PASS', files: [{ rel, text }, ...] }; `forms` expands a vector over both env call forms.
const out = [];
const add = (id, expect, text, rel = 'scripts/probe.mjs') => out.push({ id, expect, files: [{ rel, text: IMPORT + text }] });
// `decl` declares `const env` (or whatever name `name` says); the spawn is added in BOTH forms.
const both = (id, expect, decl, { name = 'env', tail = '', wrap = (s) => s } = {}) => {
  add(id + ' {env}', expect, decl + wrap(spawn(name === 'env' ? '{ env }' : '{ env: ' + name + ' }')) + tail);
  add(id + ' env:env', expect, decl + wrap(spawn('{ env: ' + name + ' }')) + tail);
};

// ---- MUST FAIL -------------------------------------------------------------------------------------------------------------------
both('F1 alias copy, one hop', 'FAIL', 'const base = { ...process.env };\nconst env = { ...base, ' + NOSYS + ' };\n');
both('F1 const extra = process.env (CoalTipple A6)', 'FAIL', 'const extra = process.env;\nconst env = { ...extra, ' + NOSYS + ' };\n');
both('F1 Object.entries of an alias (CoalBoard A1)', 'FAIL', 'const e = process.env;\nconst env = { ...Object.fromEntries(Object.entries(e)), ' + NOSYS + ' };\n');
both('F2 fromEntries(entries(process.env))', 'FAIL', 'const env = { ...Object.fromEntries(Object.entries(process.env)), ' + NOSYS + ' };\n');
both('F3 a filter over the whole env', 'FAIL', 'const env = { ...Object.fromEntries(Object.entries(process.env).filter(() => true)), ' + NOSYS + ' };\n');
both("F4 process['env']", 'FAIL', "const env = { ...process['env'], " + NOSYS + ' };\n');
both('F5 import { env as penv }', 'FAIL', "import { env as penv } from 'node:process';\nconst env = { ...penv, " + NOSYS + ' };\n');
add('F6 {...gitEnv(d), ...process.env}', 'FAIL', spawn('{ env: { ...gitEnv(d), ...process.env } }'));
both('F7 {...gitEnv(d), ...base}', 'FAIL', 'const base = { ...process.env };\nconst env = { ...gitEnv(d), ...base };\n');
both('F8 nested spread', 'FAIL', 'const env = { ' + NOSYS + ', extra: { ...process.env } };\n');
both('F9 concat of Object.entries after an allowed spread', 'FAIL', KEEP + 'const env = { ...Object.fromEntries(keep.filter(Boolean).map((k) => [k, process.env[k]]).concat(Object.entries(process.env))), ' + NOSYS + ' };\n');
both('F10 flatMap over Object.entries', 'FAIL', KEEP + 'const env = { ...Object.fromEntries(keep.filter(Boolean).flatMap(() => Object.entries(process.env))), ' + NOSYS + ' };\n');
both('F11 a value that is process.env', 'FAIL', 'const env = { ' + NOSYS + ', all: process.env };\n');
add('F12 helper returning process.env', 'FAIL', 'function all() { return process.env; }\n' + spawn('{ env: { ...Object.fromEntries(Object.entries(all())), ' + NOSYS + ' } }'));
add('F13 helper with a second path returning process.env', 'FAIL', 'function mk(x) { if (x) return { PATH: process.env.PATH, ' + NOSYS + ' }; return process.env; }\n' + spawn('{ env: mk(d) }'));
add('F14 a helper call defined in another file', 'FAIL', spawn('{ env: sandboxEnv(cwd) }'));
both('F15 Object.assign(env, process.env) after declaration', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + ' };\nObject.assign(env, process.env);\n');
both('F16 for-of copy into env', 'FAIL', 'const env = { ' + NOSYS + ' };\nfor (const k of Object.keys(process.env)) env[k] = process.env[k];\n');
both('F17 env.GIT_DIR = x', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + " };\nenv.GIT_DIR = '/elsewhere/.git';\n");
both('F18 the key list mutated (KEYS.push)', 'FAIL', "const KEYS = ['PATH'];\nKEYS.push('GIT_DIR');\nconst env = { ...Object.fromEntries(KEYS.filter((k) => k in process.env).map((k) => [k, process.env[k]])), " + NOSYS + ' };\n');
both('F19 GIT_DIR in the key list', 'FAIL', "const keep = ['PATH', 'GIT_DIR'];\nconst env = { " + PICK + ', ' + NOSYS + ' };\n');
both('F20 GIT_DIR two consts away', 'FAIL', "const k2 = ['GIT_DIR'];\nconst keep = ['PATH', ...k2];\nconst env = { " + PICK + ', ' + NOSYS + ' };\n');
both('F21 a computed GIT_ name in the key list', 'FAIL', "const keep = ['PATH', 'GIT_' + 'DIR'];\nconst env = { " + PICK + ', ' + NOSYS + ' };\n');
both('F22 a computed property key', 'FAIL', "const env = { " + NOSYS + ", ['GIT' + '_DIR']: process.env['GIT' + '_DIR'] };\n");
both('F23 GIT_CONFIG_NOSYSTEM zero', 'FAIL', "const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '0' };\n");
both('F24 a duplicate GIT_CONFIG_NOSYSTEM, last wins', 'FAIL', "const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_NOSYSTEM: '0' };\n");
both('F25 NOSYSTEM one, then a spread const that sets zero', 'FAIL', KEEP + "const over = { GIT_CONFIG_NOSYSTEM: '0' };\nconst env = { GIT_CONFIG_NOSYSTEM: '1', " + PICK + ', ...over };\n');
both('F26 no GIT_CONFIG_NOSYSTEM at all', 'FAIL', 'const env = { PATH: process.env.PATH };\n');
both('F27 GIT_CONFIG_NOSYSTEM not a literal', 'FAIL', 'const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: flag };\n');
both('F28 the literal only inside a comment', 'FAIL', "const env = { PATH: process.env.PATH, // GIT_CONFIG_NOSYSTEM: '1'\n};\n");
both('F29 a lower-case git_dir key', 'FAIL', 'const env = { ' + NOSYS + ', git_dir: d };\n');
both('F30 an explicit GIT_DIR key', 'FAIL', "const env = { " + NOSYS + ", GIT_DIR: 'x' };\n");
both('F31 clean env in a(), process.env env in b()', 'FAIL',
  'function a() { const env = ' + CLEAN + '; return env; }\nfunction b() {\n  const env = { ...process.env };\n  ', { wrap: (s) => s + '}\n' });
both('F32 module-level clean env, shadowed by an inner let', 'FAIL', 'const env = ' + CLEAN + ';\nfunction f() {\n  let env = { ...process.env };\n  ', { wrap: (s) => s + '}\n' });
both('F33 env is a parameter, a clean const elsewhere', 'FAIL', 'const env = ' + CLEAN + ';\nfunction f(env) {\n  ', { wrap: (s) => s + '}\n' });
add('F34 two functions each declare e2', 'FAIL', 'function a() { const e2 = ' + CLEAN + '; return e2; }\nfunction b() {\n  const e2 = { ...process.env };\n  ' + spawn('{ env: e2 }') + '}\n');
both('F35 an alias, then a for-in copy', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + ' };\nconst alias = env;\nfor (const k in process.env) alias[k] = process.env[k];\n');
both('F36 the copy moved into a helper', 'FAIL', KEEP + 'function fill(o) { for (const k in process.env) o[k] = process.env[k]; }\nconst env = { ' + PICK + ', ' + NOSYS + ' };\nfill(env);\n');
both('F37 Reflect.set(env, ...)', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + " };\nReflect.set(env, 'GIT_DIR', d);\n");
both('F38 an alias, then alias.GIT_DIR = d', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + ' };\nconst alias = env;\nalias.GIT_DIR = d;\n');
both('F39 Object.assign(Object(env), ...)', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + ' };\nObject.assign(Object(env), { GIT_DIR: d });\n');
both('F40 a method call on env (__defineGetter__)', 'FAIL', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + " };\nenv.__defineGetter__('GIT_DIR', () => d);\n");
add('F41 two regexes holding a single quote hide the GIT_DIR between them', 'FAIL', 'const env = { ' + NOSYS + ", A: /'/.test(x), GIT_DIR: d, B: /'/.test(z) };\n" + spawn('{ env }'));
add('F41 two regexes holding a double quote hide the GIT_DIR between them', 'FAIL', 'const env = { ' + NOSYS + ', A: /"/.test(x), GIT_DIR: d, B: /"/.test(z) };\n' + spawn('{ env }'));
add('F41 two regexes holding a backtick hide the GIT_DIR between them', 'FAIL', 'const env = { ' + NOSYS + ', A: /' + BT + '/.test(x), GIT_DIR: d, B: /' + BT + "/.test(z) };\n" + spawn('{ env }'));
add('F42 a file-local gitEnv arrow returning process.env', 'FAIL', 'const gitEnv = () => ({ ...process.env });\n' + spawn('{ env: gitEnv() }'));
add('F42 a file-local gitEnv function returning process.env', 'FAIL', 'function gitEnv() { return process.env; }\n' + spawn('{ env: gitEnv() }'));
add('F42 a file-local gitTestEnv spreading process.env', 'FAIL', 'const gitTestEnv = (d) => ({ ...process.env, GIT_CEILING_DIRECTORIES: d });\n' + spawn('{ env: gitTestEnv(d) }'));
add('F42 gitEnv imported from a file that is not a trusted definer', 'FAIL', "import { gitEnv } from './evil.mjs';\n" + spawn('{ env: gitEnv() }'));
add('R1 the command as a template literal', 'FAIL', 'spawnSync(' + BT + 'git' + BT + ", ['status'], { env: process.env });\n");
add('R2 the command as git.exe', 'FAIL', "spawnSync('git.exe', ['status'], { env: process.env });\n");

// ---- MUST PASS (no finding, no pin) ----------------------------------------------------------------------------------------------
add('P3 env: gitEnv(d)', 'PASS', spawn('{ env: gitEnv(d) }'));
both('P3 const env = gitEnv(d)', 'PASS', 'const env = gitEnv(d);\n');
add('P3 trusted import of gitEnv', 'PASS', "import { gitEnv } from './lib/git-env.mjs';\n" + spawn('{ env: gitEnv() }'));
add('P3 trusted import of gitTestEnv', 'PASS', "import { gitTestEnv } from './lib/git-test-env.mjs';\n" + spawn('{ env: gitTestEnv(root) }'));
add('P4 an inline allowlist literal', 'PASS', spawn('{ env: { PATH: process.env.PATH, HOME: process.env.HOME, ' + NOSYS + ' } }'));
both('P5 the named-pick form', 'PASS', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + ' };\n');
both('P6 the three allowed names together', 'PASS', KEEP + 'const env = { ' + PICK + ', ' + NOSYS + ", GIT_TERMINAL_PROMPT: '0', GIT_CEILING_DIRECTORIES: d };\n");

export const VECTORS = out;
export const P_FILES = { P1: 'scripts/release-notes.mjs', P2: 'scripts/release-notes.test.mjs' }; // read from the room's byte-equal copies (blobs f8d998d8, 7e779ef8)
export const P_BLOBS = { P1: 'f8d998d8fe14a5972440043123398115d02fc50e', P2: '7e779ef8b224c4c0942e11899ed29da4ee847269' };
