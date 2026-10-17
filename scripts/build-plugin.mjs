#!/usr/bin/env node
// CoalFace dist build — assemble a CLEAN `plugin/` from source so the Claude Code
// marketplace serves ONLY the plugin (skills + hooks + commands + manifest), never the
// repo's scripts/, docs, or design files. Mirrors the CoalHearth/CoalBoard plugin/ dist;
// marketplace.json `source` points at ./plugin. Run after editing skills/hooks/commands/
// plugin.json — verify.mjs FAILs on drift. Node built-ins only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'plugin');

// EXACTLY what a Claude Code plugin loads — nothing the marketplace clone carries
// that a CC user does not need.
export const DIST_ITEMS = [
  path.join('.claude-plugin', 'plugin.json'),
  'skills',
  'hooks',
  'commands',
];

// TEXT_EXTS grounded in what actually ships under DIST_ITEMS today (skills/hooks/
// commands: .js — CJS throughout; .md; .claude-plugin/plugin.json). No .mjs/.cjs
// ships under DIST_ITEMS in this room. Non-text/unlisted extensions stay strict
// byte-compare — the mechanism must not silently normalize a future binary asset.
const TEXT_EXTS = new Set(['.js', '.json', '.md']);

// Byte-compare two files, EOL-agnostic on TEXT_EXTS only (board #47's
// `.gitattributes` eol=lf conform can still leave a stale core.autocrlf checkout
// with CRLF bytes for byte-identical content, false-flagging it "stale in
// plugin/"). Never a blanket \r strip — a LONE bare \r (not followed by \n) is
// real content, not a line-ending artifact, and must still cause a mismatch.
export function filesMatch(a, b) {
  const bufA = fs.readFileSync(a);
  const bufB = fs.readFileSync(b);
  if (bufA.compare(bufB) === 0) return true;
  const ext = path.extname(a);
  if (ext !== path.extname(b) || !TEXT_EXTS.has(ext)) return false;
  // latin1, not utf8: utf8 maps every INVALID byte to U+FFFD, so two files
  // differing only in invalid-UTF-8 bytes would decode to the SAME string and
  // report a false match — exactly the corruption class this gate exists to
  // catch. latin1 is a lossless 1:1 byte<->char mapping (no byte class ever
  // collapses); CRLF bytes normalize identically to utf8 for the ASCII range.
  const crlfToLf = (buf) => buf.toString('latin1').replace(/\r\n/g, '\n');
  return crlfToLf(bufA) === crlfToLf(bufB);
}

export function buildDist(distRoot = dist) {
  fs.rmSync(distRoot, { recursive: true, force: true });
  for (const rel of DIST_ITEMS) {
    const src = path.join(repo, rel);
    const dst = path.join(distRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true, filter: (s) => !/\.test\.[cm]?js$/.test(s) }); // recursive always; EXCLUDE *.test.* — dev-only tests never ship in the clean plugin/ dist
  }
}

// Every source file under DIST_ITEMS must exist in distRoot AND match per filesMatch()
// (byte-exact, or EOL-normalized on a shared TEXT_EXTS extension — board #59),
// distRoot must hold nothing under those items without a source (orphan), and no
// top-level entry may exist that no DIST_ITEM accounts for. Returns [] when in sync.
export function checkDist(distRoot = dist) {
  const out = [];
  // CWK-120 finding #4: excluding *.test.* on BOTH traversals meant a test file
  // committed directly into plugin/ (bypassing the build's own cpSync filter --
  // a stray manual edit or a bad merge) was invisible to the orphan check, so
  // checkDist would report clean while the packaging step (build-claude-ai-zips
  // / the marketplace clone) still shipped it. Excluded on the SOURCE side only
  // (tests never belong in the dist by design); reported as a FORBIDDEN finding
  // on the distRoot side, ahead of the orphan check it would otherwise silently
  // pass (a test file has no source counterpart, so it would read as an orphan
  // -- the forbidden message names what it actually is).
  const filesUnder = (root, rel, excludeTests) => {
    if (excludeTests && /\.test\.[cm]?js$/.test(rel)) return [];
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return [];
    if (fs.statSync(abs).isDirectory()) return fs.readdirSync(abs).flatMap((n) => filesUnder(root, path.join(rel, n), excludeTests));
    return [rel];
  };
  for (const item of DIST_ITEMS) {
    for (const rel of filesUnder(repo, item, true)) {
      const d = path.join(distRoot, rel);
      if (!fs.existsSync(d)) out.push(`missing in plugin/: ${rel}`);
      else if (!filesMatch(path.join(repo, rel), d)) out.push(`stale in plugin/: ${rel}`);
    }
    for (const rel of filesUnder(distRoot, item, false)) {
      if (/\.test\.[cm]?js$/.test(rel)) out.push(`forbidden test file in plugin/: ${rel}`);
      else if (!fs.existsSync(path.join(repo, rel))) out.push(`orphan in plugin/ (no source): ${rel}`);
    }
  }
  const allowedTops = new Set(DIST_ITEMS.map((rel) => rel.split(path.sep)[0]));
  if (fs.existsSync(distRoot)) {
    for (const name of fs.readdirSync(distRoot)) {
      if (!allowedTops.has(name)) out.push(`orphan top-level in plugin/ (no DIST_ITEM): ${name}`);
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) {
    const f = checkDist();
    // CWK-071 bounce2 F6: a fifth process.exit() the chief's own rider enumeration did not
    // carry, found by this room's own INSPECT and guarding the largest pending write of the
    // five. process.exitCode + a natural fall-through, per node/runtime.md §7 -- moved the
    // "in sync" log into an else branch so it never prints alongside an OUT OF SYNC report
    // now that nothing exits early to prevent that.
    if (f.length) { console.error('plugin/ dist OUT OF SYNC:\n' + f.map((x) => '  ' + x).join('\n') + '\n-> run: node scripts/build-plugin.mjs'); process.exitCode = 1; }
    else console.log('plugin/ dist in sync with source.');
  } else {
    buildDist();
    console.log('plugin/ dist built (skills + hooks + commands + plugin.json) from source.');
  }
}
