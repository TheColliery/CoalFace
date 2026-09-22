#!/usr/bin/env node
// CoalFace configurator — edit .coalface.json from the command line.
// Flags, parsing, validation, and help all come from one table
// (scripts/lib/config-schema.mjs, shared with verify.mjs): a key added there
// is automatically settable, validated, and documented here.
//
// r31 UNIT 3 (CWK-023, owner-signed ใบ D — configure.mjs is a flock standard: config
// must be CLI-settable, not merely documented, per the 5-standard-systems requirement).
// Exemplars read BOTH: CoalLedger's scripts/configure.mjs (94e994f, the ADOPTER shape)
// and CoalMine's original. CoalLedger's GATED shape taken as the pattern; adaptations
// from it, named:
//   - THE IMPORT RAIL IS THE SHARP ONE HERE, and it is a DIFFERENT split from
//     CoalLedger's: CoalLedger built its own ESM scripts/lib/config-load.mjs because its
//     script and lib are both ESM. This room's config WALK lives in
//     hooks/coalface-conductor.js, which is CJS (node/runtime.md §3 — a CJS file cannot
//     be `require()`d from ESM the way an ESM one can, and the extension IS the module
//     system). Building a second, ESM copy of the walk would be a second source of
//     truth for the same logic — the exact defect config-load.mjs's own header warns
//     against, one level over. So the walk is IMPORTED across the CJS/ESM boundary via
//     the SAME bridge scripts/verify.mjs already crosses for AGENT_DIR_ORDER
//     (`await import(pathToFileURL(...).href)`, cjs-module-lexer resolving
//     `module.exports` into real named exports) — `findProjectCfg` is now exported
//     alongside it for exactly this. No local re-walk of candidate dirs here.
//   - parse via OUR parseJsonc(content) (jsonc.mjs), which already carries the
//     proto-pollution guard verify.mjs's own config check relies on — the same file,
//     not a second implementation.
//   - `parseValue` covers ONLY 'int' and 'enum' (config-schema.mjs's own two live
//     types) — no 'bool'/'number'/'strArr' branches ported: this room's schema has
//     never had those types, and porting dead cases would be migrating a type space
//     this room never had (the same "no legacy-key migration block" reasoning
//     CoalLedger's own header gives for skipping CoalMine's rename-migration branch).
//   - no legacy-key migration block, same reason: `git log -p --follow -- scripts/lib/
//     config-schema.mjs` shows every removed line is a `help:` reword, never a rename
//     or a deletion.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG_SCHEMA, validateValue } from './lib/config-schema.mjs';
import { parseJsonc } from './lib/jsonc.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp() {
  const lines = [
    'CoalFace Configurator Utility',
    'Usage: node scripts/configure.mjs [options]',
    '',
    'Options:',
  ];
  for (const spec of CONFIG_SCHEMA) {
    const flags = [`--${spec.key}`, ...(spec.flags || [])].join(', ');
    lines.push(`  ${flags.padEnd(24)} ${spec.help}`);
  }
  lines.push(`  ${'--global'.padEnd(24)} Write ~/.claude/.coalface.json (the global layer) instead of the project config`);
  lines.push(`  ${'--help, -h'.padEnd(24)} Show this help message`);
  lines.push('');
  lines.push('Examples:');
  lines.push('  node scripts/configure.mjs --coalfaceMode on --bandwidth 50');
  lines.push('  node scripts/configure.mjs --language th');
  lines.push('  node scripts/configure.mjs --global --updateMode auto');
  console.log(lines.join('\n'));
}

// Parse one raw CLI value against a spec. Returns { value } or { error }. Only 'int'
// and 'enum' — config-schema.mjs's own two live types (see the file header for why
// no other case is ported).
function parseValue(spec, raw) {
  switch (spec.type) {
    case 'int': {
      // Number(), not parseInt — a float ("5.9") or a garbage tail ("50abc") is
      // REJECTED outright rather than silently truncated. validateValue then runs the
      // SAME int+range contract verify.mjs enforces on the JSON value, so the CLI
      // parser and the JSON validator cannot drift apart.
      const n = Number(raw);
      const err = validateValue(spec, n);
      if (err) return { error: `${spec.key} ${err}` };
      return { value: n };
    }
    case 'enum': {
      const v = (raw || '').toLowerCase();
      if (!spec.values.includes(v)) {
        return { error: `${spec.key} must be one of: ${spec.values.join(', ')}` };
      }
      return { value: v };
    }
    default:
      return { error: `internal: unknown spec type '${spec.type}'` };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // The bridge (see the file header): this room's config WALK is not re-implemented
  // here. `findProjectCfg('claude')` is the IDENTICAL search hooks/coalface-conductor.js
  // itself runs for `readCfg('claude')` — own agent dir first, then the fixed
  // AGENT_DIR_ORDER fallback, then the LEGACY root dotfile, stopping at home. Running
  // configure.mjs under Claude Code is the only supported entry today (same assumption
  // the hook's own `main()` makes at its one call site), so 'claude' is hardcoded here
  // exactly as it is there.
  const { findProjectCfg, AGENT_DIR_ORDER } = await import(pathToFileURL(path.join(repo, 'hooks', 'coalface-conductor.js')).href);

  // --global targets ~/.claude/.coalface.json (readCfg's own hardcoded global home);
  // default targets the project config. The hook merges the two per key
  // (SAFER_ENUM-clamped for consent-bearing keys) — this tool edits exactly ONE layer
  // per invocation, never the merged view.
  const globalIdx = args.indexOf('--global');
  const isGlobal = globalIdx !== -1;
  if (isGlobal) args.splice(globalIdx, 1);

  const cwd = process.cwd();
  const legacyPath = path.join(cwd, '.coalface.json');
  const globalPath = path.join(os.homedir(), '.claude', '.coalface.json');
  const foundProjectPath = isGlobal ? null : findProjectCfg('claude');
  const readPath = isGlobal ? globalPath : foundProjectPath;
  // Both LEGACY shapes the hook reads at this level (UMB-133): the root dotfile and the
  // nested `.<agent>/.coalface.json`. A config found at either migrates on this write.
  const legacyPaths = [legacyPath, ...AGENT_DIR_ORDER.map((d) => path.join(cwd, '.' + d, '.coalface.json'))];
  const readIsLegacy = !isGlobal && readPath !== null && legacyPaths.includes(readPath);
  // WRITE goes back to wherever the config was found, EXCEPT a config found at a
  // LEGACY shape (root dotfile or nested) migrates on this write — to the FIRST agent dir the project
  // ALREADY HAS on disk (never a bare .claude planted into a project that only uses
  // .agents/.gemini), falling back to .claude only when the project has none of the
  // three (move-on-CONFIG-WRITE-only, Phoenix #5 — a hook never performs this move on
  // a mere read; this is a CLI script the user/agent explicitly runs).
  const writePath = isGlobal
    ? globalPath
    : (readPath === null || readIsLegacy) ? ownDirDefault(cwd, AGENT_DIR_ORDER) : readPath;

  let cfg = {};
  let hadComments = false;
  let rawConfig = null;
  if (readPath !== null) {
    try {
      let content = fs.readFileSync(readPath, 'utf8');
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      rawConfig = content;
    } catch {}
  }
  if (rawConfig !== null) {
    try {
      hadComments = rawConfig.includes('//');
      const parsed = parseJsonc(rawConfig);
      // CWK-120 ride-along (a), THE CONFIG-PARSE CLASS: `parsed || {}` alone lets a
      // top-level array/string/number config body through unguarded -- `[] || {}` and
      // `"x" || {}` and `42 || {}` are all truthy, so cfg would become the array/string/
      // number itself. Every downstream `cfg[spec.key] = parsed.value` (below) then
      // silently no-ops on it (arrays only keep index keys, primitives take none in
      // non-strict mode), and JSON.stringify(cfg) writes back the ORIGINAL malformed
      // body with every --flag the user passed dropped, exit 0, no error. Route the
      // same non-object shape into the existing malformed-config path (backup + warn +
      // rebuild from {}) instead of a silent, undetectable no-op.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`config must be a JSON object, got ${Array.isArray(parsed) ? 'an array' : typeof parsed}`);
      }
      cfg = parsed;
    } catch (e) {
      // Fail loud (scripts-quality §1): a malformed config we silently overwrite is a
      // partial failure the user must notice — flag the non-zero exit even though the
      // run continues from defaults (the old config is backed up where possible).
      process.exitCode = 1;
      try {
        fs.copyFileSync(readPath, readPath + '.bak');
        console.warn(`Warning: existing config is malformed — backed it up to ${readPath}.bak and rebuilding.`);
      } catch {
        console.warn('Warning: existing config is malformed. Overwriting.');
      }
    }
  }

  const flagMap = new Map();
  for (const spec of CONFIG_SCHEMA) {
    flagMap.set(`--${spec.key}`, spec);
    for (const f of spec.flags || []) flagMap.set(f, spec);
  }

  for (let i = 0; i < args.length; i++) {
    const spec = flagMap.get(args[i]);
    if (!spec) {
      console.error(`Error: Unrecognized option '${args[i]}'`);
      printHelp();
      process.exitCode = 1;
      return;
    }
    const parsed = parseValue(spec, args[++i]);
    if (parsed.error) {
      console.error(`Error: ${parsed.error}`);
      process.exitCode = 1;
      return;
    }
    cfg[spec.key] = parsed.value;
  }

  try {
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    // Move-on-CONFIG-WRITE-only (no-old-version-leftover): the legacy file (root or
    // nested) is removed only AFTER the new-home write above succeeded, and only when this write
    // actually migrated it. Best-effort — a failed delete here still leaves a
    // correctly-written new config; the stray legacy file is simply not cleaned up
    // this run.
    if (readIsLegacy && writePath !== readPath) {
      try { fs.rmSync(readPath, { force: true }); } catch {}
      console.log(`Migrated the project config from ${readPath} to ${writePath}.`);
    }
    if (hadComments) {
      console.warn('Note: inline comments were stripped (this tool writes plain JSON). Every key stays documented in platform-configs/.coalface.json.');
    }
    console.log(`Successfully updated configuration in: ${writePath}`);
    console.log(JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error(`Error: Failed to write to config file: ${e.message}`);
    process.exitCode = 1;
  }
}

// The FIRST agent dir the project ALREADY HAS on disk (checked in AGENT_DIR_ORDER's own
// order, so a project probes .claude before .agents before .gemini exactly like the
// hook's own read path does) — never a bare `.claude` guess. Falls back to `.claude`
// only when the project has NONE of the three yet, because configure.mjs's one
// supported entry today is Claude Code itself (same assumption as `findProjectCfg`'s
// hardcoded 'claude' above).
function ownDirDefault(root, agentDirOrder) {
  for (const d of agentDirOrder) {
    if (fs.existsSync(path.join(root, '.' + d))) return path.join(root, '.' + d, 'coal', 'coalface.json');
  }
  return path.join(root, '.claude', 'coal', 'coalface.json');
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exitCode = 1; });
