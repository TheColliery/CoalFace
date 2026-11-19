#!/usr/bin/env node
// Checks the NVIDIA/SkillEvaluator reusable-workflow pin in a caller workflow: the commit in its uses: line must be the
// commit its own version comment names (or that release's bundle commit), and its image digest must be the digest that
// release's bundle ships. A source that cannot be read fails the check closed, never passes it. Node built-ins only.
// Written to be copied to other repositories as it stands: nothing in it names a repository but the upstream it reads.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gitEnv } from './lib/git-env.mjs';

const REPO = 'NVIDIA/SkillEvaluator';
const DEFAULT_WORKFLOW = '.github/workflows/skill-checks.yml';
const TIMEOUT_MS = 30000;
const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const USES_RE = /^[ \t]*uses:[ \t]*NVIDIA\/SkillEvaluator\/\.github\/workflows\/evaluate-skills\.yml@([^\s#]+)[ \t]*(#[^\r\n]*)?\r?$/m;
const VERSION_COMMENT_RE = /#[ \t]*v(\d+\.\d+\.\d+)[ \t]*$/;
const IMAGE_RE = /^[ \t]*image:[ \t]*ghcr\.io\/nvidia\/skillevaluator-tier1@sha256:([0-9a-f]{64})(?![0-9a-f])/m; // 29iz: anchored as USES_RE is, so a comment never matches, and the digest is exactly 64 hex

const USAGE = [
  'usage: node scripts/skill-evaluator-pin.mjs [workflow.yml]',
  '  Checks the SkillEvaluator reusable-workflow pin of a caller workflow (default ' + DEFAULT_WORKFLOW + ').',
  '  Its uses: commit and image digest must match the release its version comment names. Reads only public upstream files.',
  '  example: node scripts/skill-evaluator-pin.mjs ' + DEFAULT_WORKFLOW,
  '  report a problem at the issue tracker of the repository this script lives in.',
  '',
].join('\n');

const short = (value) => value.slice(0, 12);

function parseUses(text) {
  const m = USES_RE.exec(text);
  if (!m) return { sha: null, version: null };
  const sha = SHA_RE.test(m[1]) ? m[1] : null;
  const c = m[2] ? VERSION_COMMENT_RE.exec(m[2]) : null;
  return { sha, version: c ? c[1] : null };
}

function parseCaller(text) {
  const digest = IMAGE_RE.exec(text);
  return { ...parseUses(text), digest: digest && DIGEST_RE.test(digest[1]) ? digest[1] : null };
}

function parseBundle(text) {
  const digest = IMAGE_RE.exec(text);
  return { sha: parseUses(text).sha, digest: digest && DIGEST_RE.test(digest[1]) ? digest[1] : null };
}

// Pure check. Returns { ok, problems }: ok only when every problem list is empty.
export function checkPin({ workflowText, tagCommit, bundleText }) {
  const problems = [];
  const caller = parseCaller(workflowText);
  if (!caller.sha) problems.push('no uses: line pins NVIDIA/SkillEvaluator evaluate-skills.yml to a 40-hex commit');
  if (!caller.version) problems.push('the uses: line has no same-line "# vX.Y.Z" version comment');
  if (!caller.digest) problems.push('no image: line pins ghcr.io/nvidia/skillevaluator-tier1 to a sha256 digest');
  if (!tagCommit) problems.push('the tag commit could not be read (fail closed)');
  if (!bundleText) problems.push('the release bundle could not be read (fail closed)');
  const bundle = bundleText ? parseBundle(bundleText) : null;
  if (bundle && (!bundle.sha || !bundle.digest)) problems.push('the release bundle names no workflow commit or no image digest (fail closed)');
  if (caller.sha && tagCommit && bundle && bundle.sha && caller.sha !== tagCommit && caller.sha !== bundle.sha) {
    problems.push(`uses: pins ${short(caller.sha)}, but v${caller.version} is ${short(tagCommit)} and its release bundle pins ${short(bundle.sha)}`);
  }
  if (caller.digest && bundle && bundle.digest && caller.digest !== bundle.digest) {
    problems.push(`image digest sha256:${short(caller.digest)}, but v${caller.version} ships sha256:${short(bundle.digest)}`);
  }
  return { ok: problems.length === 0, problems };
}

function readTagCommit(version) {
  try {
    const out = execFileSync('git', ['ls-remote', `https://github.com/${REPO}`, `refs/tags/v${version}`, `refs/tags/v${version}^{}`], {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const rows = out.split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
    const peeled = rows.find(([, ref]) => ref === `refs/tags/v${version}^{}`);
    const plain = rows.find(([, ref]) => ref === `refs/tags/v${version}`);
    const sha = (peeled || plain || [])[0];
    return SHA_RE.test(sha || '') ? sha : null;
  } catch {
    return null;
  }
}

async function readBundle(version) {
  try {
    const url = `https://raw.githubusercontent.com/${REPO}/v${version}/ci/bundles/${version}/skill-checks.yml`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return;
  }
  const unknown = argv.find((a) => a.startsWith('-'));
  if (unknown || argv.length > 1) {
    process.stderr.write(`${unknown ? `unknown option: ${unknown}` : 'one workflow file at most'}\n${USAGE}`);
    process.exitCode = 64;
    return;
  }
  const file = argv[0] || DEFAULT_WORKFLOW;
  let workflowText;
  try {
    workflowText = fs.readFileSync(file, 'utf8');
  } catch {
    process.stdout.write(`FAIL skill-evaluator pin: cannot read ${file}\n`);
    process.exitCode = 1;
    return;
  }
  const caller = parseCaller(workflowText);
  // The version is read from the caller's own comment, and must be X.Y.Z before it reaches a URL or argv.
  const version = caller.version && VERSION_RE.test(caller.version) ? caller.version : null;
  let tagCommit = null;
  let bundleText = null;
  if (version) {
    tagCommit = readTagCommit(version);
    bundleText = await readBundle(version);
  }
  const result = checkPin({ workflowText, tagCommit, bundleText });
  if (result.ok) {
    process.stdout.write(`PASS skill-evaluator pin: v${version} ${short(caller.sha)} ${short(caller.digest)}\n`);
  } else {
    for (const problem of result.problems) process.stdout.write(`FAIL skill-evaluator pin: ${problem}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write('FAIL skill-evaluator pin: the check could not run. Run it again; if it repeats, report it at the issue tracker of the repository this script lives in.\n');
    process.exitCode = 1;
  });
}
