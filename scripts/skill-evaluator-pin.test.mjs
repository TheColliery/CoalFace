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
