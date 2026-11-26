// Tests for scripts/skill-evaluator-pin.mjs: the pure checkPin() by inline fixtures (no network), and the CLI's
// usage and refusal paths. Every fixture is a plain string; the release values are the ones the pin was read from.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPin } from './skill-evaluator-pin.mjs';
// 29qo: the mover's exports are read through the namespace, so each leg fails on its own until the mode exists.
import * as pin from './skill-evaluator-pin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE = path.join(HERE, 'skill-evaluator-pin.mjs');

// 29iz (F13, hooks-safety §7 and testing.md's hermetic spawns): a CLI child gets a throwaway HOME, USERPROFILE and TEMP, removed after the test. The local shape of hooks.test.mjs's sandbox().
function childEnv(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evaluator-pin-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { ...process.env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home };
}

const TAG = '914c15cb3f31562ccffdc9a7166002a87ed2ce1e';
const BUNDLE_SHA = 'c9369a7811bde083b550f2ac488222e8c388d7fd';
const DIGEST_1 = 'fbff256df8f760019539d442b7cb533d7ec50efab37f4482b7b670e2e4b4189a';
const DIGEST_0 = 'e96e3aaad89bf78c4f3f8c621e88005d18bd7c485b29c0d7945864700e5944e6';
const OTHER_SHA = 'abcdef0123456789abcdef0123456789abcdef01';

function callerYaml({ sha = TAG, comment = 'v1.0.1', digest = DIGEST_1, withImage = true } = {}) {
  const uses = `    uses: NVIDIA/SkillEvaluator/.github/workflows/evaluate-skills.yml@${sha}${comment === null ? '' : ` # ${comment}`}`;
  const image = withImage ? `      image: ghcr.io/nvidia/skillevaluator-tier1@sha256:${digest}` : '';
  return ['name: skill-checks', 'jobs:', '  evaluate:', uses, '    with:', image].join('\n') + '\n';
}

function bundleYaml({ sha = BUNDLE_SHA, digest = DIGEST_1 } = {}) {
  return [
    'name: skill-checks',
    'jobs:',
    '  evaluate:',
    `    uses: NVIDIA/SkillEvaluator/.github/workflows/evaluate-skills.yml@${sha}`,
    '    with:',
    `      image: ghcr.io/nvidia/skillevaluator-tier1@sha256:${digest}`,
  ].join('\n') + '\n';
}

test('passes when the caller pins the release tag commit and the bundle image digest', () => {
  const r = checkPin({ workflowText: callerYaml(), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('passes when the caller pins the workflow commit the release bundle itself names', () => {
  const r = checkPin({ workflowText: callerYaml({ sha: BUNDLE_SHA }), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('fails naming both digests when the image is the previous release digest though the SHA and comment name this release', () => {
  const r = checkPin({ workflowText: callerYaml({ digest: DIGEST_0 }), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false);
  const text = r.problems.join('\n');
  assert.match(text, /e96e3aaad89b/);
  assert.match(text, /fbff256df8f7/);
});

test('fails when the caller SHA is neither the tag commit nor the bundle commit', () => {
  const r = checkPin({ workflowText: callerYaml({ sha: OTHER_SHA }), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /abcdef012345/);
});

test('fails when the uses line has no same-line version comment', () => {
  const r = checkPin({ workflowText: callerYaml({ comment: null }), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /version comment/);
});

test('fails when no image line pins the tier-1 image by sha256 digest', () => {
  const r = checkPin({ workflowText: callerYaml({ withImage: false }), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /sha256 digest/);
});

test('fails when the uses line pins a different repository, which does not count as the SkillEvaluator pin', () => {
  const other = callerYaml().replace('NVIDIA/SkillEvaluator/', 'someone/else/');
  const r = checkPin({ workflowText: other, tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /no uses: line pins NVIDIA\/SkillEvaluator/);
});

test('fails closed when the release bundle could not be read, even though the caller agrees with the tag', () => {
  const r = checkPin({ workflowText: callerYaml(), tagCommit: TAG, bundleText: null });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /release bundle could not be read/);
});

test('fails closed when the tag commit could not be read, even though the caller agrees with the bundle', () => {
  const r = checkPin({ workflowText: callerYaml({ sha: BUNDLE_SHA }), tagCommit: null, bundleText: bundleYaml() });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /tag commit could not be read/);
});

test('fails closed when the bundle is readable but names no image digest', () => {
  const r = checkPin({ workflowText: callerYaml(), tagCommit: TAG, bundleText: bundleYaml().replace(/image:.*\n/, '') });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /names no workflow commit or no image digest/);
});

test('CLI: --help prints the usage on stdout and exits 0 without reading any source', (t) => {
  const r = spawnSync(process.execPath, [MODULE, '--help'], { encoding: 'utf8', timeout: 20000, env: childEnv(t) });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage:/);
  assert.equal(r.stderr, '');
});

test('CLI: an unknown flag is refused with exit 64 and the usage on stderr', (t) => {
  const r = spawnSync(process.execPath, [MODULE, '--bogus'], { encoding: 'utf8', timeout: 20000, env: childEnv(t) });
  assert.equal(r.status, 64);
  assert.match(r.stderr, /usage:/);
  assert.equal(r.stdout, '');
});

test('CLI: a workflow with no version comment fails at once, naming the missing comment, without a network read', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evaluator-pin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'skill-checks.yml');
  fs.writeFileSync(file, callerYaml({ comment: null }));
  const r = spawnSync(process.execPath, [MODULE, file], { encoding: 'utf8', timeout: 20000, env: childEnv(t) });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL skill-evaluator pin: .*version comment/m);
});

// 29iz (F14, CodeRabbit E1 t346): IMAGE_RE had no line anchor, so the text of a commented copy of the image key was matched first, and a longer hex token matched its first 64 characters.
test('a commented image line is not the active pin: a commented bundle digest above a different active digest fails', () => {
  const commented = `      # image: ghcr.io/nvidia/skillevaluator-tier1@sha256:${DIGEST_1}`;
  const active = `      image: ghcr.io/nvidia/skillevaluator-tier1@sha256:${DIGEST_0}`;
  const text = callerYaml({ digest: DIGEST_0 }).replace(/^      image:.*$/m, `${commented}\n${active}`);
  const r = checkPin({ workflowText: text, tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false, JSON.stringify(r.problems));
  assert.match(r.problems.join('\n'), /e96e3aaad89b/);
});

test('a digest token longer than 64 hex characters is no 64-character digest: the image line with 65 hex fails as absent', () => {
  const r = checkPin({ workflowText: callerYaml({ digest: `${DIGEST_1}a` }), tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, false, JSON.stringify(r.problems));
  assert.match(r.problems.join('\n'), /sha256 digest/);
});

// 29jf (F5, CodeRabbit E1 t348): a suffix after the 64-hex digest still matched, so an edited caller whose image token is not the pinned image passed the gate. IMAGE_RE now ends where USES_RE ends.
const imageLine = (tail) => callerYaml().replace(/^      image:.*$/m, `      image: ghcr.io/nvidia/skillevaluator-tier1@sha256:${DIGEST_1}${tail}`);

test('an image token with a suffix after the 64-hex digest fails the pin, whatever the suffix (A, Z, -x, :latest)', () => {
  for (const suffix of ['A', 'Z', '-x', ':latest']) {
    const r = checkPin({ workflowText: imageLine(suffix), tagCommit: TAG, bundleText: bundleYaml() });
    assert.equal(r.ok, false, `suffix "${suffix}" passed: ${JSON.stringify(r.problems)}`);
  }
});

test('the image line still passes with a trailing comment, a tab before it, CRLF, and the real workflow file', () => {
  for (const tail of ['', '  # pinned by the release', '\t# pinned', '\r']) {
    const r = checkPin({ workflowText: imageLine(tail), tagCommit: TAG, bundleText: bundleYaml() });
    assert.equal(r.ok, true, `tail ${JSON.stringify(tail)} failed: ${JSON.stringify(r.problems)}`);
  }
  const real = fs.readFileSync(path.join(HERE, '..', '.github', 'workflows', 'skill-checks.yml'), 'utf8');
  const r = checkPin({ workflowText: real, tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, true, `real workflow failed: ${JSON.stringify(r.problems)}`);
});

// 29jk (E1 t350 #1, the reviewer's 29jf LOW-2): in YAML a `#` with no whitespace before it is part of the value, not a comment, but USES_RE and IMAGE_RE read it as one, so a value that is not the pinned one passed.
test('a # with no whitespace before it is part of the value: uses: or image: directly followed by #x or #v1.0.1 fails the pin', () => {
  for (const attack of [`@${TAG}#v1.0.1`, `@${TAG}#x`]) {
    const r = checkPin({ workflowText: callerYaml().replace(`@${TAG} # v1.0.1`, attack), tagCommit: TAG, bundleText: bundleYaml() });
    assert.equal(r.ok, false, `uses "${attack}" passed: ${JSON.stringify(r.problems)}`);
  }
  for (const attack of ['#x', '#v1']) {
    const r = checkPin({ workflowText: imageLine(attack), tagCommit: TAG, bundleText: bundleYaml() });
    assert.equal(r.ok, false, `image "${attack}" passed: ${JSON.stringify(r.problems)}`);
  }
});

test('a uses: line still passes with a space, two spaces, or a tab before its comment, and with CRLF', () => {
  for (const sep of [' ', '  ', '\t']) {
    const r = checkPin({ workflowText: callerYaml().replace(`@${TAG} # v1.0.1`, `@${TAG}${sep}# v1.0.1`), tagCommit: TAG, bundleText: bundleYaml() });
    assert.equal(r.ok, true, `uses separator ${JSON.stringify(sep)} failed: ${JSON.stringify(r.problems)}`);
  }
  const crlf = callerYaml().replace(`@${TAG} # v1.0.1\n`, `@${TAG} # v1.0.1\r\n`);
  const r = checkPin({ workflowText: crlf, tagCommit: TAG, bundleText: bundleYaml() });
  assert.equal(r.ok, true, `uses CRLF failed: ${JSON.stringify(r.problems)}`);
});

// ---- 29qo: --move, the pin pair written from one upstream release. planMove is pure; nothing here touches the network. ----

const V121 = '1.2.1';
const TAG_121 = 'f7fcd35d79d0506fadbd79f2b3ff384c98bd10f3';
const WORKFLOW_121 = 'fd6852ddc945c49d003a0898edef4933184d8fb3';
const DIGEST_121 = '459f7ab610d3c8a5afff5a3a602ae432fb5644e65a7e3c9a9ca9f89cff723399';
const OTHER_DIGEST = 'a'.repeat(64);
const BLOB = '1fff11ac8e5543d946de6bba9209f6d3bb7a49f8';
const PUBLISHED = '2026-11-25T19:47:04Z';
const PUB_MS = Date.parse(PUBLISHED);
const DAY_MS = 86400000;
const COOLDOWN = 7;

const releaseObj = (over = {}) => ({ published_at: PUBLISHED, draft: false, prerelease: false, ...over });
function releaseJson({ ref = WORKFLOW_121, image = DIGEST_121 } = {}) {
  return JSON.stringify({
    repository: 'NVIDIA/SkillEvaluator',
    workflow_ref: ref,
    image: `ghcr.io/nvidia/skillevaluator-tier1@sha256:${image}`,
    caller_blob: 'f9d614cf015c0800ee87c12800e342f4968a66d7',
  });
}

function moveArgs(over = {}) {
  return {
    workflowText: callerYaml(), // the v1.0.1 caller: TAG and DIGEST_1
    version: V121,
    release: releaseObj(),
    bundleText: bundleYaml({ sha: WORKFLOW_121, digest: DIGEST_121 }),
    releaseJsonText: releaseJson(),
    tagCommit: TAG_121,
    blobAtTag: BLOB,
    blobAtRef: BLOB,
    cooldownDays: COOLDOWN,
    now: PUB_MS + 15 * DAY_MS,
    ...over,
  };
}
const move = (over) => pin.planMove(moveArgs(over));
const movedCaller = (extra = {}) => callerYaml({ sha: TAG_121, comment: 'v1.2.1', digest: DIGEST_121, ...extra });

test('move: a good release moves the uses commit to the tag and the image digest to the bundle, and the result passes the bare check', () => {
  const r = move();
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(r.problems, []);
  assert.equal(r.text, movedCaller());
  assert.equal(checkPin({ workflowText: r.text, tagCommit: TAG_121, bundleText: moveArgs().bundleText }).ok, true);
});

test('move: a CRLF caller keeps its CRLF endings and every other line, including a comment the move does not own', () => {
  const crlf = callerYaml().replace(/\n/g, '\r\n').replace('    with:\r\n', '    with:\r\n      # keep this note\r\n');
  const r = move({ workflowText: crlf });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.text, movedCaller().replace(/\n/g, '\r\n').replace('    with:\r\n', '    with:\r\n      # keep this note\r\n'));
});

test('move: a release, a bundle or a release.json that cannot be read refuses (fail closed)', () => {
  for (const [over, pattern] of [
    [{ release: null }, /release v1\.2\.1 could not be read/],
    [{ bundleText: null }, /release bundle could not be read/],
    [{ releaseJsonText: null }, /release\.json could not be read/],
    [{ tagCommit: null }, /tag commit could not be read/],
  ]) {
    const r = move(over);
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.match(r.problems.join('\n'), pattern);
  }
});

test('move: a bundle that names no image digest refuses', () => {
  const bundle = bundleYaml({ sha: WORKFLOW_121, digest: DIGEST_121 }).replace(/image:.*\n/, '');
  const r = move({ bundleText: bundle });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /names no workflow commit or no image digest/);
});

test('move: a release.json missing its image field, or with a malformed workflow_ref, refuses as malformed', () => {
  const noImage = JSON.stringify({ workflow_ref: WORKFLOW_121 });
  assert.match(move({ releaseJsonText: noImage }).problems.join('\n'), /release\.json is malformed/);
  assert.match(move({ releaseJsonText: releaseJson({ ref: 'not-a-commit' }) }).problems.join('\n'), /release\.json is malformed/);
});

test('move: a pair from two bundles refuses when the bundle digest is not the release.json image digest', () => {
  const r = move({ releaseJsonText: releaseJson({ image: OTHER_DIGEST }) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /is not release\.json's image digest/);
});

test('move: a pair from two bundles refuses when the bundle commit is not release.json workflow_ref', () => {
  const r = move({ releaseJsonText: releaseJson({ ref: 'b'.repeat(40) }) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /is not release\.json's workflow_ref/);
});

test('move: a tag inside the cooldown refuses, and one exactly at the cooldown boundary passes', () => {
  const inside = move({ now: PUB_MS + 6 * DAY_MS });
  assert.equal(inside.ok, false);
  assert.match(inside.problems.join('\n'), /cooldown/);
  const boundary = move({ now: PUB_MS + COOLDOWN * DAY_MS });
  assert.equal(boundary.ok, true, JSON.stringify(boundary.problems));
});

test('move: a missing or unreadable cooldown refuses', () => {
  const r = move({ cooldownDays: null });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /cooldown is not readable/);
});

test('move: a draft or a prerelease refuses', () => {
  const draft = move({ release: releaseObj({ draft: true }) });
  assert.equal(draft.ok, false);
  assert.match(draft.problems.join('\n'), /draft or a prerelease/);
  const pre = move({ release: releaseObj({ prerelease: true }) });
  assert.equal(pre.ok, false);
  assert.match(pre.problems.join('\n'), /draft or a prerelease/);
});

test('move: evaluate-skills.yml differing between the tag commit and workflow_ref refuses, and an unreadable blob refuses', () => {
  const differs = move({ blobAtRef: 'b'.repeat(40) });
  assert.equal(differs.ok, false);
  assert.match(differs.problems.join('\n'), /evaluate-skills\.yml differs/);
  const unreadable = move({ blobAtRef: null });
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.problems.join('\n'), /evaluate-skills\.yml .*could not be read/);
});

test('move: a caller with no image line, or with no uses line, refuses', () => {
  const noImage = move({ workflowText: callerYaml({ withImage: false }) });
  assert.equal(noImage.ok, false);
  assert.match(noImage.problems.join('\n'), /image: line/);
  const noUses = move({ workflowText: callerYaml().replace(/^    uses:.*$/m, '') });
  assert.equal(noUses.ok, false);
  assert.match(noUses.problems.join('\n'), /uses: line/);
});

test('move: a version that is not X.Y.Z refuses before anything is planned', () => {
  const r = move({ version: 'v1.2.1' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /not X\.Y\.Z/);
});

test('parseCooldownDays reads the one default-days value and refuses when there is none or two', () => {
  const one = ['version: 2', 'updates:', '  - package-ecosystem: github-actions', '    cooldown:', '      default-days: 7', ''].join('\n');
  assert.equal(pin.parseCooldownDays(one), 7);
  assert.equal(pin.parseCooldownDays(one.replace('default-days: 7', 'default-days: 7\n      default-days: 3')), null);
  assert.equal(pin.parseCooldownDays(one.replace('      default-days: 7', '      interval: weekly')), null);
});

async function* chunksOf(...sizes) {
  for (const n of sizes) yield new Uint8Array(n).fill(97);
}

test('readCapped returns a body under the bound and at it, and null past it', async () => {
  assert.equal(await pin.readCapped(chunksOf(3, 4), 10), 'aaaaaaa');
  assert.equal(await pin.readCapped(chunksOf(5, 5), 10), 'a'.repeat(10));
  assert.equal(await pin.readCapped(chunksOf(6, 5), 10), null);
});

test('CLI: --move with a version that is not X.Y.Z exits 64 naming the version, and the workflow bytes stay unchanged', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evaluator-move-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'skill-checks.yml');
  const before = callerYaml();
  fs.writeFileSync(file, before);
  const r = spawnSync(process.execPath, [MODULE, '--move', 'bogus', file], { encoding: 'utf8', timeout: 20000, env: childEnv(t) });
  assert.equal(r.status, 64);
  assert.match(r.stderr, /the version must be X\.Y\.Z/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('CLI: --move with no version exits 64 and prints the usage on stderr', (t) => {
  const r = spawnSync(process.execPath, [MODULE, '--move'], { encoding: 'utf8', timeout: 20000, env: childEnv(t) });
  assert.equal(r.status, 64);
  assert.match(r.stderr, /usage:/);
  assert.equal(r.stdout, '');
});
