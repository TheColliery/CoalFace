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
for (const lib of ['config-schema.mjs', 'jsonc.mjs']) {
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

console.log(fails ? `\nVERIFY: FAIL (${fails})` : '\nVERIFY: PASS');
process.exit(fails ? 1 : 0);
