#!/usr/bin/env node
// CoalFace verify gate — fail LOUD if the factory config drifts from the schema,
// required files are missing/malformed, the dist is stale, or a version pin rots.
// Wrapped per-check so one bad input yields a clean FAIL line, not a stack trace.
// (scripts-quality.md: CLI = fail loud; hooks = the opposite discipline.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateConfig } from './lib/config-schema.mjs';
import { stripJsonc } from './lib/jsonc.mjs';
import { DESC_CAP, descriptionCapCheck } from './lib/desc-cap.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };

console.log('files:');
for (const [label, p] of [
  ['skills/coalface/SKILL.md', path.join(repo, 'skills', 'coalface', 'SKILL.md')],
  ['skills/coalface/references/contract-template.md', path.join(repo, 'skills', 'coalface', 'references', 'contract-template.md')],
  ['skills/coalface/references/taxonomy.md', path.join(repo, 'skills', 'coalface', 'references', 'taxonomy.md')],
  ['skills/coalface/references/receipt.md', path.join(repo, 'skills', 'coalface', 'references', 'receipt.md')],
  ['skills/coalface/references/admission-control.md', path.join(repo, 'skills', 'coalface', 'references', 'admission-control.md')],
  ['hooks/coalface-conductor.js', path.join(repo, 'hooks', 'coalface-conductor.js')],
  ['hooks/ag-conductor.js', path.join(repo, 'hooks', 'ag-conductor.js')],
  ['hooks/hooks.json', path.join(repo, 'hooks', 'hooks.json')],
  ['commands/update.md', path.join(repo, 'commands', 'update.md')],
  ['.claude-plugin/plugin.json', path.join(repo, '.claude-plugin', 'plugin.json')],
  ['.claude-plugin/marketplace.json', path.join(repo, '.claude-plugin', 'marketplace.json')],
  ['platform-configs/.coalface.json', path.join(repo, 'platform-configs', '.coalface.json')],
  ['platform-configs/hooks.json', path.join(repo, 'platform-configs', 'hooks.json')],
]) { try { fs.existsSync(p) ? ok(label) : fail(`${label} missing`); } catch (e) { fail(`${label}: ${e.message}`); } }

console.log('plugin manifest:');
try {
  const pj = JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'utf8'));
  if (pj.name === 'coalface') ok("plugin.json name = 'coalface'"); else fail(`plugin.json name = '${pj.name}' (want 'coalface')`);
  // Semver ACCEPTING a pre-release suffix — a strict x.y.z once rejected a beta tag at release time.
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pj.version || '')) ok(`plugin.json version '${pj.version}' is semver`);
  else fail(`plugin.json version '${pj.version}' not semver`);
  const hj = fs.readFileSync(path.join(repo, 'hooks', 'hooks.json'), 'utf8');
  if (hj.includes('${CLAUDE_PLUGIN_ROOT}/hooks/coalface-conductor.js')) ok('hooks.json wires SessionStart via ${CLAUDE_PLUGIN_ROOT}/hooks');
  else fail('hooks.json does not wire the conductor under ${CLAUDE_PLUGIN_ROOT}/hooks');
} catch (e) { fail(`plugin manifest: ${e.message}`); }

console.log('marketplace.json:');
try {
  const mj = JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (mj.plugins?.[0]?.source === './plugin') ok('marketplace.json points at ./plugin');
  else fail(`marketplace.json plugins[0].source = '${mj.plugins?.[0]?.source}' (want './plugin')`);
} catch (e) { fail(`marketplace.json: ${e.message}`); }

console.log('description length cap (skills + commands):');
// Skill-listing description cap: gate at 1024 = cross-platform-safe (agentskills.io / agnix);
// CC's own listing truncation is 1536 chars combined description+when_to_use
// (code.claude.com/docs/en/skills, verified 2026-07-16). USER standard 2026-07-16: never exceed.
// DESC_CAP + descriptionCapCheck now live in ./lib/desc-cap.mjs, and this gate CALLS
// descriptionCapCheck rather than re-deriving its arithmetic (fixback F1, board #40's own
// INSPECT: the first extraction moved frontmatterField but left this loop hand-rolling the
// cap-check logic inline — same numbers today, but a fix to descriptionCapCheck would have
// silently never reached this gate. build-claude-ai-zips.mjs reads the SAME implementation.
// Dynamic scan (skills/*/SKILL.md for any dir that has one, commands/*.md) so a
// new skill/command is covered without editing this gate.
const descTargets = [];
const skillsDir = path.join(repo, 'skills');
if (fs.existsSync(skillsDir)) {
  for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const smd = path.join(skillsDir, d.name, 'SKILL.md');
    if (fs.existsSync(smd)) descTargets.push([`skills/${d.name}/SKILL.md`, smd, true]);
  }
}
const commandsDir = path.join(repo, 'commands');
if (fs.existsSync(commandsDir)) {
  for (const f of fs.readdirSync(commandsDir)) {
    if (f.endsWith('.md')) descTargets.push([`commands/${f}`, path.join(commandsDir, f), false]);
  }
}
for (const [label, p, isSkill] of descTargets) {
  try {
    const text = fs.readFileSync(p, 'utf8');
    const { len, over } = descriptionCapCheck(text);
    if (isSkill && len === 0) fail(`${label}: frontmatter description missing/unparsed`);
    else if (over) fail(`${label}: description+when_to_use ${len} chars exceeds the ${DESC_CAP}-char cap`);
    else ok(`${label}: ${len} chars (cap ${DESC_CAP})`);
  } catch (e) { fail(`${label} description check: ${e.message}`); }
}
// board #64: this gate covered skill/command FRONTMATTER only, so .claude-plugin/plugin.json's
// OWN description (the string a marketplace listing renders) could silently exceed the cap —
// CoalLedger shipped one at 1067 before a human eye caught it. plugin.json is plain JSON, not
// frontmatter, so read the field directly; same DESC_CAP constant, never redefined.
try {
  let pjRaw = fs.readFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'utf8');
  if (pjRaw.charCodeAt(0) === 0xFEFF) pjRaw = pjRaw.slice(1);
  const pj = JSON.parse(pjRaw);
  const len = typeof pj.description === 'string' ? pj.description.length : 0;
  if (!pj.description) fail('.claude-plugin/plugin.json: description missing');
  else if (len > DESC_CAP) fail(`.claude-plugin/plugin.json: description ${len} chars exceeds the ${DESC_CAP}-char cap`);
  else ok(`.claude-plugin/plugin.json: ${len} chars (cap ${DESC_CAP})`);
} catch (e) { fail(`.claude-plugin/plugin.json description check: ${e.message}`); }

console.log('config (factory vs schema):');
try {
  let c = fs.readFileSync(path.join(repo, 'platform-configs', '.coalface.json'), 'utf8');
  if (c.charCodeAt(0) === 0xFEFF) c = c.slice(1);
  const cfg = JSON.parse(stripJsonc(c));
  const errors = validateConfig(cfg);
  if (!errors.length) ok('factory .coalface.json valid against schema');
  else errors.forEach(fail);
} catch (e) { fail(`factory config: ${e.message}`); }

console.log('libs (import check):');
for (const lib of ['config-schema.mjs', 'jsonc.mjs', 'admission-control.mjs', 'desc-cap.mjs', 'claude-ai-trim.mjs']) {
  try { await import(pathToFileURL(path.join(repo, 'scripts', 'lib', lib)).href); ok(`${lib} imports`); }
  catch (e) { fail(`${lib}: ${e.message}`); }
}

console.log('plugin/ dist (the clean CC plugin vs source SSoT):');
try {
  const { checkDist } = await import(pathToFileURL(path.join(repo, 'scripts', 'build-plugin.mjs')).href);
  const drift = checkDist();
  if (!drift.length) ok('plugin/ matches source (skills + hooks + commands + manifest); nothing else leaked');
  else for (const d of drift) fail(d);
} catch (e) { fail(`plugin/ dist check: ${e.message}`); }

console.log('version pins (.github/ISSUE_TEMPLATE):');
// Mirrors the series checkVersionPins (scripts-quality.md doc-transition gate): any
// issue-template line carrying a `version-pin:` marker must quote the CURRENT
// plugin.json version (pre-release accepted).
try {
  let pjRaw = fs.readFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'utf8');
  if (pjRaw.charCodeAt(0) === 0xFEFF) pjRaw = pjRaw.slice(1);
  const version = JSON.parse(pjRaw).version;
  const tplDir = path.join(repo, '.github', 'ISSUE_TEMPLATE');
  let pins = 0;
  for (const name of fs.readdirSync(tplDir).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = fs.readFileSync(path.join(tplDir, name), 'utf8').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('version-pin:')) return;
      pins++;
      const m = line.match(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
      if (!m) fail(`${name}:${i + 1} is marked version-pin but has no vX.Y.Z to check`);
      else if (m[1] !== version) fail(`${name}:${i + 1} pins v${m[1]} but plugin.json is v${version} — bump the pin`);
      else ok(`${name}:${i + 1} pin matches v${version}`);
    });
  }
  if (!pins) fail('no version-pin marker found in .github/ISSUE_TEMPLATE (the bug-report placeholder must carry one)');
} catch (e) { fail(`version pins: ${e.message}`); }

console.log('config-key drift (docs vs schema, CWK-060):');
// Every config key NAMED on a user-facing surface must RESOLVE in the schema, or be
// declared. Ported from CoalMine's CWK-059/061 exemplar; every list and number in
// config-keys.mjs is measured on THIS room's surfaces (see that file's header).
// Dynamic import per node/runtime.md §1 — a GATE's local lib imports resolve at LINKING
// time, before the first try/catch exists, so a static one cannot be wrapped.
try {
  const { checkConfigKeys } = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'config-keys.mjs')).href);
  const { CONFIG_SCHEMA } = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'config-schema.mjs')).href);
  const rel = (...p) => path.join(repo, ...p);
  const findings = checkConfigKeys({
    schemaKeys: CONFIG_SCHEMA.map((s) => s.key),
    // SOURCE ONLY, never the plugin/ twins — verify.mjs's own parity check already
    // enforces they are byte-identical, so scanning both would double every finding
    // without adding one bit of coverage.
    mdFiles: [
      rel('skills', 'coalface', 'SKILL.md'),
      rel('skills', 'coalface', 'references', 'contract-template.md'),
      rel('skills', 'coalface', 'references', 'taxonomy.md'),
      rel('skills', 'coalface', 'references', 'receipt.md'),
      rel('skills', 'coalface', 'references', 'admission-control.md'),
      rel('skills', 'coalface', 'references', 'workflow-engine.md'),
      rel('README.md'),
      rel('commands', 'stats.md'),
      rel('commands', 'update.md'),
    ],
    hookFiles: [rel('hooks', 'coalface-conductor.js'), rel('hooks', 'ag-conductor.js')],
    templateFiles: [rel('platform-configs', '.coalface.json')],
    keyTables: [{ file: rel('README.md'), heading: 'Configure' }],
    read: (f) => fs.readFileSync(f, 'utf8'),
    label: (f) => path.relative(repo, f).split(path.sep).join('/'),
  });
  // SKIP is disclosure, not failure — it must never redden the gate, and it must never
  // be silent either (CoalMine's MEDIUM-1: a stop bought by spending the disclosure).
  for (const f of findings) (f.level === 'FAIL' ? fail : ok)(f.msg);
  if (!findings.some((f) => f.level === 'FAIL')) {
    const blind = findings.some((f) => f.level === 'SKIP' && f.msg.startsWith('blind to'));
    ok(`every ${blind ? 'DETECTABLE ' : ''}config key named on a scanned surface resolves in the schema`);
  }
} catch (e) { fail(`config-key drift: ${e.message}`); }

console.log('pointer drift (CWK-079):');
// Every PATH this room's ship-text points at must resolve to a TRACKED file or directory.
// Three states, not two — tracked is silent, GITIGNORED and existing-but-UNTRACKED both
// FAIL, because from any other machine "gitignored" and "does not exist" are
// indistinguishable and such a citation was never durable. This room had NO pointer gate
// at all before this unit; mechanism, the measured funnel and the named bounds all live
// in scripts/lib/pointer-check.mjs's own header — not restated here.
//
// SURFACE SET: DATA now (r31 UNIT 1(c), CWK-090 fix 3) — `DEFAULT_SURFACE_PLAN`
// (pointer-check.mjs), walked here with THIS room's own fs IO. `PLATFORM-LIMITS.md` /
// `USAGE-DATA.md` are DELETED from the plan (gitignored, never shipped, per .gitignore
// and bounce2 F1) rather than declared and filtered — but the filter that made F1
// derived-not-hand-kept is NOT lost: it now runs STRUCTURALLY over whatever the plan
// assembles (`tracked.has(label)`, below), so no future row can re-admit an untracked
// file even if nobody remembers to check .gitignore before adding it. The surviving set
// is SHIPPED-AND-TRACKED ship-text, DELIBERATELY WIDER than the CWK-060 config-key
// gate's 9-file set two blocks up — that gate asks "does this doc name a config key",
// this one asks "does this doc point at a real path", and CHANGELOG/SECURITY/
// CONTRIBUTING/PRIVACY cite paths without ever naming a config key, so a narrower set
// here would silently drop real ship-text.
try {
  const { checkPointers, deriveIgnoredRoots, DEFAULT_SURFACE_PLAN, collectSurfaces, applyCheckIgnoreProbe, PROBE_SUFFIX } = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'pointer-check.mjs')).href);
  const { AGENT_DIR_ORDER } = await import(pathToFileURL(path.join(repo, 'hooks', 'coalface-conductor.js')).href);
  const { execFileSync, spawnSync } = await import('node:child_process');

  // GIT IS AN OPTIONAL ENHANCEMENT, NEVER A RUNTIME REQUIREMENT (no-external-assumption).
  // This gate's whole question is "reachable from a CLONE", which only git can answer, so
  // without it the honest answer is a NAMED SKIP — never a FAIL (that would redden a
  // non-git user's gate over a question nobody can ask there) and never a silent pass.
  // This room's OWN verify.test.mjs negative-path fixture copies the tree WITHOUT `.git`,
  // so this degrade path is exercised on every test run, not just a hypothetical.
  let trackedList = null;
  let gitWhy = '';
  try {
    // stderr SWALLOWED, not inherited: without this, `fatal: not a git repository` prints
    // above the gate's own line and reads as a crash rather than a degrade.
    trackedList = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
  } catch (e) {
    // Keyed on e.code per node/runtime.md §7 (error.code is stable, error.message is not).
    gitWhy = e && e.code === 'ENOENT' ? 'git is not installed here' : 'this directory is not a git repository';
    trackedList = null;
  }
  if (trackedList === null) {
    console.log(`  --   pointer drift NOT CHECKED: ${gitWhy}, and "reachable from a clone" is a question only git can answer`);
  } else {
    const tracked = new Set(trackedList);
    // 28 of this room's own 104 in-scope citations are DIRECTORIES, and `git ls-files`
    // lists files only — every ancestor directory of every tracked file is a reachable
    // TARGET too, or a quarter of the population reads as dead (see pointer-check.mjs's
    // own header arithmetic).
    const trackedDirs = new Set();
    for (const f of tracked) { const p = f.split('/'); for (let i = 1; i < p.length; i++) trackedDirs.add(p.slice(0, i).join('/')); }

    // ourRoots — from `git ls-files`, first path segment ONLY (no disk superset): this is
    // exactly the measurement's own derivation (`<scratchpad>/measure-pointers.mjs`,
    // restated here as data per that probe's own chair-ruling — a gitignored path is
    // never a durable citation, so the probe itself is not re-cited by path). CoalTipple
    // hand-kept an equivalent list, missed three tracked dot-dirs, and FAILED a correct
    // `.claude-plugin/plugin.json` citation — this room has 7 in-scope dot-dir citations,
    // so deriving rather than hand-keeping is live here, not hypothetical.
    const ourRoots = new Set();
    for (const f of tracked) ourRoots.add(f.split('/')[0]);

    // agentHomes — DERIVED from hooks/coalface-conductor.js's own AGENT_DIR_ORDER, never
    // hand-copied: a citation rooted in `.claude`/`.agents`/`.gemini` names the SCANNED
    // project this tool writes into, not our own tree.
    const agentHomes = new Set(AGENT_DIR_ORDER.map((d) => '.' + d));

    // WALK the declared plan (pointer-check.mjs), DI'd with this room's own fs IO so the
    // module stays pure. Then FILTER to SHIPPED-AND-TRACKED only (bounce2 F1, made
    // structural per the plan's own header comment) -- this is the ONE place that
    // guarantee lives now, so it protects every row the plan declares, present or future.
    const walkMd = (dir, out = []) => {
      if (!fs.existsSync(dir)) return out;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkMd(p, out);
        else if (e.name.endsWith('.md')) out.push(p);
      }
      return out;
    };
    const readAbs = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
    const rel = (p) => path.relative(repo, p).split(path.sep).join('/');
    const collected = collectSurfaces(repo, DEFAULT_SURFACE_PLAN, { join: path.join, walkMd, read: readAbs, rel });
    // CHANGELOG.md's own historyOnly ruling (BOUNCE 1) lives in the PLAN now, not here --
    // "published history is never fixed forward, so a path correct when the entry was
    // written is not a defect now" -- matching CoalMine's identical treatment. historyOnly
    // SKIPS the non-resolving-citation check ONLY -- it does NOT exempt CHANGELOG.md from
    // the gitignored-root check below: `checkPointers` runs that branch BEFORE it ever
    // consults `s.historyOnly` (see pointer-check.mjs), so a citation to our own
    // gitignored `dist-claude-ai/` in the SAME file still FAILs.
    const surfaces = collected.filter((s) => tracked.has(s.label));

    // IGNORED ROOTS, PATTERN-BASED, EXISTENCE-INDEPENDENT (CWK-079) — mechanism, the
    // ROOT-LEVEL-MASKING bound (real in this room: `.claude`/`.agents` are BOTH agent
    // homes AND genuinely gitignored here) and the NON-LOCALITY property all live at
    // deriveIgnoredRoots' own comment in pointer-check.mjs.
    //
    // r31 UNIT 1(a) / PROBE RECONCILE (CWK-090 fixes 1+2, CoalMine's `49def17`+`210dd96`):
    // the batched call and its FAIL-OPEN closure now live in `applyCheckIgnoreProbe`
    // (pointer-check.mjs), DI'd with a real `spawnSync` closure here so a unit test can
    // drive the exact branch with an injected `runCheckIgnore` instead of mutating this
    // call site and hoping a test notices. `checkIgnoreFailed` is set inside `fail` so the
    // gitignored-root summary line below can tell "0 gitignored, genuinely" from "the
    // probe never ran and this number means nothing" -- a git that cannot run must read
    // as UNKNOWN, never as a clean 0.
    //
    // PROBE FEED, MEASURED live on this box (git 2.55.0.windows.5, this repo's own CRLF
    // `.gitignore` under `core.autocrlf=true`): `git check-ignore -v "<anyNonexistentName>/"`
    // reports a FALSE POSITIVE for EVERY nonexistent trailing-slash argument, matched
    // against a phantom BLANK line in .gitignore -- reproduced against a genuinely
    // non-matching name and root-caused to CRLF line endings in a MINIMAL from-scratch
    // repo (LF-normalizing the same content in place made the false match disappear).
    // `root/<filename>` never triggers it. `PROBE_SUFFIX` (pointer-check.mjs) is the
    // shared literal both sides of the probe use, so this room's own live reproduction and
    // the exemplar's `applyCheckIgnoreProbe` read as ONE mechanism, not two dialects.
    let checkIgnoreFailed = false;
    const { candidateRoots, toProbe, homesHeldOut, ignoredRoots } = deriveIgnoredRoots({
      surfaces,
      agentHomes,
      checkIgnore: (roots) => [...applyCheckIgnoreProbe({
        toProbe: roots,
        probeSuffix: PROBE_SUFFIX,
        fail: (msg) => { checkIgnoreFailed = true; fail(msg); },
        runCheckIgnore: (input) => spawnSync('git', ['check-ignore', '--stdin'], { cwd: repo, encoding: 'utf8', input }),
      })],
    });

    // bounce2 1b/F3: checkPointers returns { findings, checked } (a proper field, never a
    // property hung on the findings ARRAY) — a caller's own .filter() (the `hardP` split
    // below) returns a NEW array with no properties of its own, which is exactly how the
    // resolution-coverage number went missing on every FAIL run before this fix.
    const { findings, checked } = checkPointers({
      surfaces,
      ourRoots,
      ignoredRoots,
      agentHomes,
      hasEntry: (relDir, name) => { try { return fs.existsSync(path.join(repo, relDir, name)); } catch { return false; } },
      resolve: (p) => (tracked.has(p) || trackedDirs.has(p) ? 'tracked'
        : fs.existsSync(path.join(repo, p)) ? 'untracked' : 'missing'),
    });

    // PRINT the derived enumeration, CITED and PROBED as separate numbers — each means
    // exactly one thing. CITED = distinct first segments that survived shape-discovery
    // from ship-text. PROBED = CITED minus agent homes, the ones actually put to git
    // check-ignore. r31 UNIT 1(a): when the probe FAILED, `ignoredRoots.size` is not a
    // count of anything real -- state that honestly rather than print a clean "0
    // gitignored" over a run that answered nothing (the fail-open shape this fix closes).
    console.log(checkIgnoreFailed
      ? `  --   gitignored-root citations: ${candidateRoots.size} distinct shape-qualified first segment(s) cited, ${toProbe.length} probed — check-ignore probe FAILED, see FAIL above; ignoredRoots is UNKNOWN, not zero`
      : `  --   gitignored-root citations: ${candidateRoots.size} distinct shape-qualified first segment(s) cited, ${toProbe.length} probed through one git check-ignore call (${homesHeldOut} of ${agentHomes.size} agent-home root(s) held out) — ${ignoredRoots.size} gitignored`);
    // bounce2 1b/F3: printed UNCONDITIONALLY, on every run — pass OR fail. Previously this
    // number lived only inside the clean-run `ok(...)` line below, so a FAIL run printed no
    // resolution-coverage number at all (proven red-first: a synthetic FAIL made the whole
    // line vanish, not just its wording).
    console.log(`  --   resolution coverage: ${checked} in-scope citation(s) across ${surfaces.length} surface(s)`);
    const hardP = findings.filter((f) => f.level !== 'SKIP');
    for (const f of findings) {
      if (f.level === 'SKIP') console.log('  --   ' + f.msg);
      else fail(f.msg);
    }
    if (!hardP.length) ok('every path this room points at resolves to a TRACKED file — sections and symbols are NOT checked, see scripts/lib/pointer-check.mjs');
  }
} catch (e) { fail(`pointer drift check crashed: ${e.message}`); }

console.log(fails ? `\nVERIFY: FAIL (${fails})` : '\nVERIFY: PASS');
// CWK-071: process.exit() forces the process to exit before pending stdout writes flush
// (node/runtime.md §7); process.exitCode + a natural exit gets the same fail-loud non-zero
// exit this gate has always needed, without that truncation risk. No runtime truncation of
// this line was ever reproduced here — the mechanism is real, applying it to this CLI gate
// is a reading, not a settled ruling.
process.exitCode = fails ? 1 : 0;
