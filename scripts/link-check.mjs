#!/usr/bin/env node
// CW-017 — link-check gate. User-/CI-invoked CLI: fail LOUD (scripts-quality.md §1) — any
// file that could not be read, or any finding, exits non-zero; this is the direct opposite
// of doc-structure-style engines that report findings without failing, and it is deliberate
// here (r33 order: "the exit WRAPPED so findings FAIL the job") — the engine's own exit code
// IS the wrap, so the workflow step needs no extra grep to make findings fail the job.
//
// Node builtins only at the top level (node/runtime.md §1 — a GATE's local lib import
// resolves at LINKING time, before the first try/catch exists, so a static one cannot be
// wrapped); the pure checker lives in ./lib/link-check.mjs and is imported dynamically.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);

if (!files.length) {
  console.error('usage: node scripts/link-check.mjs <file.md> [more.md ...]');
  process.exitCode = 1;
} else {
  try {
    const { checkFiles } = await import(pathToFileURL(path.join(here, 'lib', 'link-check.mjs')).href);
    const findings = checkFiles(files, {
      readText: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
      resolveTarget: (fromFile, target) => path.resolve(path.dirname(fromFile), target),
      stat: (p) => {
        try { const s = fs.statSync(p); return { isFile: s.isFile(), isDir: s.isDirectory() }; }
        catch { return null; }
      },
    });
    for (const f of findings) {
      console.log(f.line ? `FAIL ${f.file}:${f.line}: ${f.message}` : `FAIL ${f.file}: ${f.message}`);
    }
    console.log(`${findings.length} finding(s) across ${files.length} file(s)`);
    process.exitCode = findings.length ? 1 : 0;
  } catch (e) {
    console.error(`link-check crashed: ${e.message}`);
    process.exitCode = 1;
  }
}
