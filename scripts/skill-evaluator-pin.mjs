#!/usr/bin/env node
// Checks the NVIDIA/SkillEvaluator reusable-workflow pin in a caller workflow: the commit in its uses: line must be the
// commit its own version comment names (or that release's bundle commit), and its image digest must be the digest that
// release's bundle ships. A source that cannot be read fails the check closed, never passes it. Node built-ins only.
// --move (29qo) writes that pin pair from one upstream release, and only when every refusal in planMove passes; it reads
// public upstream files with no token. Written to be copied to other repositories as it stands: nothing in it names a
// repository but the upstream it reads.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gitEnv } from './lib/git-env.mjs';

const REPO = 'NVIDIA/SkillEvaluator';
const DEFAULT_WORKFLOW = '.github/workflows/skill-checks.yml';
const DEPENDABOT_FILE = '.github/dependabot.yml';
const TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 256 * 1024; // 29qo: a body over this is unreadable, so it is never read to the end
const DAY_MS = 86400000;
const USER_AGENT = 'skill-evaluator-pin'; // a generic client name: no house identity goes to an outside service
const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const USES_RE = /^[ \t]*uses:[ \t]*NVIDIA\/SkillEvaluator\/\.github\/workflows\/evaluate-skills\.yml@([^\s#]+)(?:[ \t]+(#[^\r\n]*))?[ \t]*\r?$/m;
const VERSION_COMMENT_RE = /#[ \t]*v(\d+\.\d+\.\d+)[ \t]*$/;
const IMAGE_RE = /^[ \t]*image:[ \t]*ghcr\.io\/nvidia\/skillevaluator-tier1@sha256:([0-9a-f]{64})(?:[ \t]+(#[^\r\n]*))?[ \t]*\r?$/m; // 29iz: anchored as USES_RE is; 29jf: and ends where USES_RE ends; 29jk: a comment needs whitespace before its #, as YAML requires
// 29qo: the same grammar as USES_RE and IMAGE_RE, global, with the whole line captured so --move can rewrite it in place.
const USES_LINE_G = /^([ \t]*uses:[ \t]*NVIDIA\/SkillEvaluator\/\.github\/workflows\/evaluate-skills\.yml@)([^\s#]+)([^\r\n]*)(\r?)$/gm;
const IMAGE_LINE_G = /^([ \t]*image:[ \t]*ghcr\.io\/nvidia\/skillevaluator-tier1@sha256:)([0-9a-f]{64})((?:[ \t]+#[^\r\n]*)?[ \t]*)(\r?)$/gm;
const COOLDOWN_LINE_G = /^[ \t]*default-days:[ \t]*(\d+)[ \t]*\r?$/gm;
const GITHUB_ACTIONS_RE = /package-ecosystem:[ \t]*github-actions[ \t]*\r?$/m;

const USAGE = [
  'usage: node scripts/skill-evaluator-pin.mjs [workflow.yml]',
  '       node scripts/skill-evaluator-pin.mjs --move <vX.Y.Z|X.Y.Z> [workflow.yml]',
  '  Checks the SkillEvaluator reusable-workflow pin of a caller workflow (default ' + DEFAULT_WORKFLOW + ').',
  '  Its uses: commit and image digest must match the release its version comment names. Reads only public upstream files.',
  '  --move writes the uses: commit (the release tag commit) and the image digest (the release bundle) from one release,',
  '  and writes nothing unless every check passes; the cooldown comes from .github/dependabot.yml.',
  '  example: node scripts/skill-evaluator-pin.mjs ' + DEFAULT_WORKFLOW,
  '  example: node scripts/skill-evaluator-pin.mjs --move v1.2.1 ' + DEFAULT_WORKFLOW,
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

// 29qo: the release.json of one bundle. Its workflow_ref is a 40-hex commit; its image is a reference ending in a
// sha256 digest (or the bare digest). Anything else is malformed, and the caller refuses.
export function parseReleaseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const ref = typeof data.workflow_ref === 'string' && SHA_RE.test(data.workflow_ref) ? data.workflow_ref : null;
  const image = typeof data.image === 'string' ? /(?:^|@sha256:)([0-9a-f]{64})$/.exec(data.image) : null;
  return ref && image ? { workflowRef: ref, digest: image[1] } : null;
}

// 29qo: the one default-days value of the github-actions entry; none or two is no reading.
export function parseCooldownDays(text) {
  if (!text || !GITHUB_ACTIONS_RE.test(text)) return null;
  const values = [...text.matchAll(COOLDOWN_LINE_G)].map((m) => Number(m[1]));
  return values.length === 1 ? values[0] : null;
}

// 29qo: a response body read as chunks, refused past its bound. Pure over any async iterable of chunks.
export async function readCapped(chunks, bound = MAX_BODY_BYTES) {
  const parts = [];
  let total = 0;
  for await (const chunk of chunks) {
    total += chunk.byteLength;
    if (total > bound) return null;
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts).toString('utf8');
}

// 29qo: every decision of --move, pure. It refuses (ok false, text null) on any problem, and it returns the planned
// text only when that text itself passes the bare check. Callers pass what they read; nothing here reads a file or a URL.
export function planMove({ workflowText, version, release, bundleText, releaseJsonText, tagCommit, blobAtTag, blobAtRef, cooldownDays, now }) {
  const problems = [];
  if (!VERSION_RE.test(String(version))) problems.push(`version "${version}" is not X.Y.Z`);
  if (problems.length) return { ok: false, text: null, problems };
  const label = `v${version}`;

  // The release: readable, neither a draft nor a prerelease, and past the cooldown.
  const cooldownOk = Number.isInteger(cooldownDays) && cooldownDays >= 0;
  if (!cooldownOk) problems.push('the cooldown is not readable from .github/dependabot.yml (fail closed)');
  if (!release) {
    problems.push(`the release ${label} could not be read (fail closed)`);
  } else if (release.draft === true || release.prerelease === true) {
    problems.push(`${label} is a draft or a prerelease`);
  } else if (release.draft !== false || release.prerelease !== false) {
    problems.push(`${label}'s draft and prerelease flags are not readable as false`);
  } else {
    const published = Date.parse(String(release.published_at));
    if (!Number.isFinite(published)) problems.push(`${label}'s published_at is not a date`);
    else if (cooldownOk && Number.isFinite(now) && now - published < cooldownDays * DAY_MS) {
      problems.push(`${label} was published ${Math.floor((now - published) / DAY_MS)} day(s) ago, under the ${cooldownDays}-day cooldown`);
    }
  }

  // The bundle and release.json must be one release's pair.
  const bundle = bundleText ? parseBundle(bundleText) : null;
  if (!bundleText) problems.push('the release bundle could not be read (fail closed)');
  else if (!bundle.sha || !bundle.digest) problems.push('the release bundle names no workflow commit or no image digest (fail closed)');
  if (!releaseJsonText) problems.push('release.json could not be read (fail closed)');
  const rj = releaseJsonText ? parseReleaseJson(releaseJsonText) : null;
  if (releaseJsonText && !rj) problems.push('release.json is malformed: workflow_ref must be 40 hex and image must end in a sha256 digest');
  if (bundle && bundle.sha && rj && bundle.sha !== rj.workflowRef) {
    problems.push(`the bundle's uses: commit ${short(bundle.sha)} is not release.json's workflow_ref ${short(rj.workflowRef)}`);
  }
  if (bundle && bundle.digest && rj && bundle.digest !== rj.digest) {
    problems.push(`the bundle's image digest sha256:${short(bundle.digest)} is not release.json's image digest sha256:${short(rj.digest)}`);
  }

  // The tag commit, and the evaluate-skills.yml blob at it and at workflow_ref: pinning the tag is safe only when they match.
  if (!tagCommit) problems.push('the tag commit could not be read (fail closed)');
  if (!SHA_RE.test(blobAtTag || '')) problems.push('evaluate-skills.yml could not be read at the tag commit (fail closed)');
  if (!SHA_RE.test(blobAtRef || '')) problems.push('evaluate-skills.yml could not be read at workflow_ref (fail closed)');
  else if (SHA_RE.test(blobAtTag || '') && blobAtTag !== blobAtRef) {
    problems.push(`evaluate-skills.yml differs: blob ${short(blobAtTag)} at the tag commit, ${short(blobAtRef)} at workflow_ref`);
  }

  // The caller: exactly one uses: line and exactly one image: line to rewrite.
  const usesLines = [...workflowText.matchAll(USES_LINE_G)].length;
  const imageLines = [...workflowText.matchAll(IMAGE_LINE_G)].length;
  if (usesLines !== 1) problems.push(`the caller has ${usesLines} uses: line(s) for evaluate-skills.yml; exactly one is needed`);
  if (imageLines !== 1) problems.push(`the caller has ${imageLines} image: line(s) for the tier-1 image; exactly one is needed`);

  if (problems.length) return { ok: false, text: null, problems };

  // One planned text: the uses: commit becomes the tag commit with its version comment, the image digest becomes the
  // bundle's; every other byte, including line endings and the image line's own comment, is kept.
  const text = workflowText
    .replace(USES_LINE_G, (line, head, token, tail, cr) => `${head}${tagCommit} # v${version}${cr}`)
    .replace(IMAGE_LINE_G, (line, head, digest, tail, cr) => `${head}${bundle.digest}${tail}${cr}`);
  const check = checkPin({ workflowText: text, tagCommit, bundleText });
  if (!check.ok) {
    return { ok: false, text: null, problems: check.problems.map((p) => `the planned file would not pass the bare check: ${p}`) };
  }
  return { ok: true, text, problems: [] };
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

// One public GET, bounded and timed. Any failure, including an over-bound body, is null.
async function fetchCapped(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.body) return null;
    return await readCapped(res.body);
  } catch {
    return null;
  }
}

async function readBundle(version) {
  return fetchCapped(`https://raw.githubusercontent.com/${REPO}/v${version}/ci/bundles/${version}/skill-checks.yml`);
}

async function readReleaseJson(version) {
  return fetchCapped(`https://raw.githubusercontent.com/${REPO}/v${version}/ci/bundles/${version}/release.json`);
}

async function readRelease(version) {
  const text = await fetchCapped(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, { Accept: 'application/vnd.github+json' });
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

// The blob sha of evaluate-skills.yml at one commit, read through the contents API.
async function readBlobSha(ref) {
  if (!SHA_RE.test(ref || '')) return null;
  const text = await fetchCapped(`https://api.github.com/repos/${REPO}/contents/.github/workflows/evaluate-skills.yml?ref=${ref}`, { Accept: 'application/vnd.github+json' });
  if (!text) return null;
  try {
    const sha = JSON.parse(text).sha;
    return SHA_RE.test(sha || '') ? sha : null;
  } catch {
    return null;
  }
}

function readCooldownDays() {
  try {
    return parseCooldownDays(fs.readFileSync(DEPENDABOT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function moveMain(args) {
  const unknown = args.find((a) => a.startsWith('-'));
  if (unknown || args.length < 1 || args.length > 2) {
    process.stderr.write(`${unknown ? `unknown option: ${unknown}` : '--move takes one version and at most one workflow file'}\n${USAGE}`);
    process.exitCode = 64;
    return;
  }
  const [rawVersion, file = DEFAULT_WORKFLOW] = args;
  const version = rawVersion.replace(/^v/, '');
  // The version must be X.Y.Z before it reaches a URL or argv.
  if (!VERSION_RE.test(version)) {
    process.stderr.write(`the version must be X.Y.Z or vX.Y.Z, got "${rawVersion}"\n`);
    process.exitCode = 64;
    return;
  }
  let workflowText;
  try {
    workflowText = fs.readFileSync(file, 'utf8');
  } catch {
    process.stdout.write(`FAIL skill-evaluator move: cannot read ${file}\n`);
    process.exitCode = 1;
    return;
  }
  const release = await readRelease(version);
  const bundleText = await readBundle(version);
  const releaseJsonText = await readReleaseJson(version);
  const tagCommit = readTagCommit(version);
  const rj = releaseJsonText ? parseReleaseJson(releaseJsonText) : null;
  const blobAtTag = await readBlobSha(tagCommit);
  const blobAtRef = rj ? await readBlobSha(rj.workflowRef) : null;
  const result = planMove({
    workflowText,
    version,
    release,
    bundleText,
    releaseJsonText,
    tagCommit,
    blobAtTag,
    blobAtRef,
    cooldownDays: readCooldownDays(),
    now: Date.now(),
  });
  if (!result.ok) {
    for (const problem of result.problems) process.stdout.write(`FAIL skill-evaluator move: ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(file, result.text);
  process.stdout.write(`PASS skill-evaluator move: v${version} ${short(tagCommit)} ${short(parseCaller(result.text).digest)} written to ${file}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return;
  }
  if (argv.includes('--move')) {
    await moveMain(argv.filter((a) => a !== '--move'));
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
