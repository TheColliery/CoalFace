#!/usr/bin/env node
// CoalFace admission (29ch): the thresholds for the machine reading come from the config itself, never from the agent's
// command line. The agent runs THIS script; it reads the two keys, keeps an in-range integer, and runs machine-reading.mjs
// with them as an argv array (no shell, a timeout). A value from a cloned repo's config never becomes shell text.
//   node "<skill dir>/scripts/admission.mjs" [--running <n>] [--json]
// Exit codes are the reader's, passed through: 0 BREATHE · 1 WAIT · 2 could not read · 64 usage.
// Keys: admitCpuBusyMaxPct (1-100, default 80) and admitMemFreeMinPct (0-99, default 10). Anything else is ignored and
// the default stands. A project file may only TIGHTEN: CPU max = min(global-or-default, project); mem min = max(global-or-
// default, project). A link at the config, or at a folder above it under its level, is not read (the containment the hook
// applies: the literal location only).
// The walk is the hook's (hooks/coalface-conductor.js findProjectHit): the same agent-dir order, nearest level first, the
// walk stops at home, the same 1 MiB bound, the same JSONC strip and prototype guard. It is FORKED here because the skill
// folder ships without hooks/ (the claude.ai ZIP, a file-copy install). The parity test in scripts/admission.test.mjs keeps
// both walks on one fixture table.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULTS } from './machine-reading.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const READER = path.join(HERE, 'machine-reading.mjs');
const AGENT_DIRS = ['claude', 'agents', 'gemini']; // the conductor's AGENT_DIR_ORDER, the same three
const KEY_RANGE = { admitCpuBusyMaxPct: [1, 100], admitMemFreeMinPct: [0, 99] };
const MAX_CONFIG_BYTES = 1024 * 1024;
const READER_TIMEOUT_MS = 120000;
const EXIT_ERROR = 2;
const EXIT_USAGE = 64;

// String-aware JSONC strip, the conductor's parseJsonc: a value ending in a backslash before a later // must not desync
// the stripper, and __proto__ / constructor / prototype are dropped on parse. Returns the parsed object, or null.
function parseJsonc(text) {
  try {
    const clean = String(text).replace(/"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|\/\/.*|\/\*[\s\S]*?(\*\/|$)/g, (m, close) => (m[0] === '"' || (m[1] === '*' && close !== '*/') ? m : ''));
    const p = JSON.parse(clean, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch { return null; }
}

// One descriptor: the file type and the size are judged on it, then the same descriptor is read. Unreadable = null.
function readConfig(file) {
  try {
    const fd = fs.openSync(file, 'r');
    let text;
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile() || st.size > MAX_CONFIG_BYTES) return null;
      const buf = Buffer.alloc(st.size);
      let got = 0;
      while (got < st.size) {
        const n = fs.readSync(fd, buf, got, st.size - got, got);
        if (n === 0) break;
        got += n;
      }
      text = buf.subarray(0, got).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
    return parseJsonc(text);
  } catch { return null; }
}

function physical(p) {
  try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
}

// The candidate list for one level, the conductor's order: canonical per agent dir, nested legacy per agent dir, root legacy.
function candidatesFor(dir) {
  return [
    ...AGENT_DIRS.map((d) => path.join(dir, `.${d}`, 'coal', 'coalface.json')),
    ...AGENT_DIRS.map((d) => path.join(dir, `.${d}`, '.coalface.json')),
    path.join(dir, '.coalface.json'),
  ];
}

// Walk up from cwd, nearest level first, stopping at home (home's config is the GLOBAL one). { file, dir } or nulls.
export function findProjectFile({ cwd, home }) {
  const stopAt = physical(home);
  let dir = physical(cwd);
  for (let i = 0; i < 40; i++) {
    if (dir === stopAt) break;
    for (const c of candidatesFor(dir)) if (fs.existsSync(c)) return { file: c, dir };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { file: null, dir: null };
}

// The literal-location pin the hook uses: the candidate's realpath must be exactly the level's realpath joined with the
// candidate's relative path. Only the candidate is canonicalised; the expectation is the hand-joined literal. Fail closed.
export function containedProjectFile(lvl, file) {
  try {
    if (typeof lvl !== 'string' || typeof file !== 'string' || !lvl || !file) return false;
    const rel = path.relative(lvl, file);
    if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return false;
    return fs.realpathSync.native(file) === path.join(fs.realpathSync.native(lvl), rel);
  } catch { return false; }
}

// An integer in range, or undefined (ignored: the default or the other layer stands).
function keyValue(cfg, key) {
  if (!cfg) return undefined;
  const v = cfg[key];
  const [min, max] = KEY_RANGE[key];
  return Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}

// The stricter of the global and the project value. The schema default stands in for an absent global.
export function thresholdsFrom({ globalCfg = null, projectCfg = null } = {}) {
  const cpuG = keyValue(globalCfg, 'admitCpuBusyMaxPct') ?? DEFAULTS.cpuMaxPct;
  const memG = keyValue(globalCfg, 'admitMemFreeMinPct') ?? DEFAULTS.memMinPct;
  const cpuP = keyValue(projectCfg, 'admitCpuBusyMaxPct');
  const memP = keyValue(projectCfg, 'admitMemFreeMinPct');
  return {
    cpuMaxPct: cpuP === undefined ? cpuG : Math.min(cpuG, cpuP),
    memMinPct: memP === undefined ? memG : Math.max(memG, memP),
  };
}

// The whole read: the thresholds the reader will run with, and the project file the walk chose (null when none).
export function readThresholds({ cwd = process.cwd(), home = os.homedir() } = {}) {
  const globalCfg = readConfig(path.join(home, '.claude', '.coalface.json'));
  const hit = findProjectFile({ cwd, home });
  const projectCfg = hit.file && fs.existsSync(hit.file) && containedProjectFile(hit.dir, hit.file) ? readConfig(hit.file) : null;
  return { ...thresholdsFrom({ globalCfg, projectCfg }), file: hit.file };
}

function main(argv) {
  // The thresholds are the engine's to pass, never the caller's: a caller that tries to set them is a usage error.
  if (argv.some((a) => a === '--cpu-max' || a === '--mem-min')) {
    process.stderr.write('admission: --cpu-max and --mem-min come from the config, not the command line (read it: references/admission-control.md)\n');
    process.exitCode = EXIT_USAGE;
    return;
  }
  const t = readThresholds();
  const r = spawnSync(process.execPath, [READER, '--cpu-max', String(t.cpuMaxPct), '--mem-min', String(t.memMinPct), ...argv], {
    encoding: 'utf8', timeout: READER_TIMEOUT_MS, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error || r.status === null) {
    process.stderr.write(`admission: could not run the machine reading (${r.error && r.error.code ? r.error.code : 'no exit code'}). Treat the machine as unmeasured.\n`);
    process.exitCode = EXIT_ERROR;
    return;
  }
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  process.exitCode = r.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`admission: could not read the config or the machine (${e && e.code ? e.code : 'error'}). Treat the machine as unmeasured, one unit at a time.\n`);
    process.exitCode = EXIT_ERROR;
  }
}
