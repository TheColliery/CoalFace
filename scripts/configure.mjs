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
//     `module.exports` into real named exports) — `findProjectHit` is now exported
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
import { mkdirRepoParents, writeFileAtomic, RepoWriteRefused } from './lib/repo-fs.mjs';

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
  // here. `findProjectHit('claude')` is the IDENTICAL search hooks/coalface-conductor.js
  // itself runs for `readCfg('claude')` — own agent dir first, then the fixed
  // AGENT_DIR_ORDER fallback, then the LEGACY root dotfile, stopping at home. Running
  // configure.mjs under Claude Code is the only supported entry today (same assumption
  // the hook's own `main()` makes at its one call site), so 'claude' is hardcoded here
  // exactly as it is there.
  const { findProjectHit, containedWriteTarget, refusalReason, NOT_FOLDER_REASON, AGENT_DIR_ORDER, physical } = await import(pathToFileURL(path.join(repo, 'hooks', 'coalface-conductor.js')).href);

  // --global targets ~/.claude/.coalface.json (readCfg's own hardcoded global home);
  // default targets the project config. The hook merges the two per key
  // (SAFER_ENUM-clamped for consent-bearing keys) — this tool edits exactly ONE layer
  // per invocation, never the merged view.
  const globalIdx = args.indexOf('--global');
  const isGlobal = globalIdx !== -1;
  if (isGlobal) args.splice(globalIdx, 1);

  // The ONE spelling of cwd for this whole run (CWK-125): findProjectHit returns paths built from physical(startDir)
  // (the .native spelling), and the write level is built from it, so a raw process.cwd()
  // spelled as a Windows 8.3 alias (the runner profile path, RUNNER~1) never matched and a legacy config was written back IN
  // PLACE, never migrated (CoalBoard 5733c20: a CI red on a runner whose username is long enough to alias).
  const cwd = physical(process.cwd());
  const globalPath = path.join(os.homedir(), '.claude', '.coalface.json');
  const hit = isGlobal ? null : findProjectHit('claude'); // the walk the hook reads with, plus the level the file sits at
  const foundProjectPath = hit ? hit.file : null;
  const readPath = isGlobal ? globalPath : foundProjectPath;
  // Both LEGACY shapes the hook reads at this level (UMB-133): the root dotfile and the
  // nested `.<agent>/.coalface.json`. A config found at either migrates on this write.
  // 16e R7: read from the walk's own verdict (hit.legacy), so a legacy config found at a PARENT level migrates at that level too, not only one at cwd.
  const readIsLegacy = !isGlobal && !!hit && hit.file !== null && hit.legacy;
  // WRITE goes back to wherever the config was found, EXCEPT a config found at a
  // LEGACY shape (root dotfile or nested) migrates on this write — to the FIRST agent dir the project
  // ALREADY HAS on disk (never a bare .claude planted into a project that only uses
  // .agents/.gemini), falling back to .claude only when the project has none of the
  // three (move-on-CONFIG-WRITE-only, Phoenix #5 — a hook never performs this move on
  // a mere read; this is a CLI script the user/agent explicitly runs).
  const writePath = isGlobal
    ? globalPath
    : readPath === null ? ownDirDefault(cwd, AGENT_DIR_ORDER) : readIsLegacy ? ownDirDefault(hit.dir, AGENT_DIR_ORDER) : readPath;

  // 14a unit 1 (E2-4 class): the project config sits in a folder a cloned repo supplies, so a link planted at the file or at a folder above it would send the read, the .bak
  // copy and the write outside the project. Every project path this run touches is pinned to its literal location BEFORE anything is read or written (the check lives in
  // hooks/coalface-conductor.js beside the read-side twin): the config found by the walk is checked against the level the walk found it at, the write target against the level it
  // will be created under (cwd for a new config, the found level for a migrated one). A refused path writes nothing, removes nothing, and ends the run with one clean FAIL line. The global file is the
  // user's own and is not a project path. Residue, named: check and use are two acts, so a link swapped in between is not caught (microseconds).
  // 17c (a): the reason comes from the conductor's refusalReason, the one place that names it (a file in the chain is not "a link").
  const refuse = (p) => {
    const why = refusalReason(p);
    const text = why === NOT_FOLDER_REASON
      ? `${NOT_FOLDER_REASON} -- make that path a real folder inside the project (remove the file that sits there) and re-run`
      : why === 'unreadable'
        ? 'it could not be inspected (permission denied) -- fix the permissions on that path and re-run'
        : 'it resolves outside its folder (a link at the file or at a folder above it)';
    console.error(`FAIL ${p}: ${text}; nothing was written`);
    process.exitCode = 1;
  };
  const writeLvl = readPath === null ? cwd : (hit && hit.dir);
  if (!isGlobal) {
    if (readPath !== null && !containedWriteTarget(hit.dir, readPath)) return refuse(readPath);
    if (!containedWriteTarget(writeLvl, writePath)) return refuse(writePath);
  }

  // 17c (b): a DIRECTORY at the config path (the file it would write, or the legacy file it found) is refused with a reason, never a raw EISDIR. A link is the pin's, above.
  if (!isGlobal) {
    for (const p of new Set([writePath, readPath])) {
      let st = null;
      try { st = p === null ? null : fs.lstatSync(p); } catch {}
      if (st && st.isDirectory()) {
        console.error(`FAIL ${p}: it is a folder, not a config file -- remove or rename that folder and re-run; nothing was written`);
        process.exitCode = 1;
        return;
      }
    }
  }

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
      if (!isGlobal && !containedWriteTarget(hit.dir, readPath + '.bak')) return refuse(readPath + '.bak'); // the backup is a write too (it sits beside the found file): a link at .bak must not carry it outside
      try {
        // 17c (d): the backup goes through the same temp-then-rename route as the config (writeFileAtomic), never a copyFileSync that follows a link at the destination after the pin.
        writeFileAtomic(readPath + '.bak', fs.readFileSync(readPath), readPath); // the backup takes the mode of the config it copies, as copyFileSync did
        console.warn(`Warning: existing config is malformed — backed it up to ${readPath}.bak and rebuilding.`);
      } catch (e) {
        // 17c bounce LOW-2: a config we cannot back up is NOT overwritten. The malformed original may be the only copy the user can repair, so the run refuses, writes nothing and
        // leaves the original byte for byte; the FAIL line names the backup path and how to recover.
        const why = e instanceof RepoWriteRefused ? e.message : `${readPath}.bak: the backup could not be written (${e && e.code ? e.code : e.message}) -- free that path and re-run`;
        console.error(`FAIL ${why}; the malformed config ${readPath} was left untouched and nothing was written`);
        return;
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
    // CWK2-042: the parent folder is made only after the chain from the write root is judged (a link or a file on the way is refused with a sentence, nothing is made beyond a
    // checked component). The user-global config has no project root and keeps the plain recursive make.
    try { mkdirRepoParents(path.dirname(writePath), isGlobal ? null : writeLvl); } catch (e) {
      if (!(e instanceof RepoWriteRefused)) throw e;
      console.error(`FAIL ${e.message}`);
      process.exitCode = 1;
      return;
    }
    try { writeFileAtomic(writePath, JSON.stringify(cfg, null, 2) + '\n'); } catch (e) {
      if (!(e instanceof RepoWriteRefused)) throw e;
      console.error(`FAIL ${e.message}`);
      process.exitCode = 1;
      return;
    }
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
// supported entry today is Claude Code itself (same assumption as `findProjectHit`'s
// hardcoded 'claude' above).
function ownDirDefault(root, agentDirOrder) {
  for (const d of agentDirOrder) {
    if (fs.existsSync(path.join(root, '.' + d))) return path.join(root, '.' + d, 'coal', 'coalface.json');
  }
  return path.join(root, '.claude', 'coal', 'coalface.json');
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exitCode = 1; });
