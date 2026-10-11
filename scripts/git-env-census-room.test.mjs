// 09a -- this room's side of the shared git-spawn census: the canon census (scripts/lib/git-env-census.mjs) over THIS room's real sources with the room's pins
// (scripts/lib/git-spawn-room.mjs). The canon's own legs (the witness list, the lexer) live in scripts/lib/git-env-census.test.mjs, adopted by blob id.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanGitSpawns, gitBlobId } from './lib/git-env-census.mjs';
import { ROOM_PINS, collectRoomSources, roomCensus } from './lib/git-spawn-room.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIT = "'git'";
const ENV = 'process' + '.env';

test('every git spawn of this room reads clean with the room pins, and the walk really reaches the gate, its tests and the hooks', () => {
  const files = collectRoomSources(repo);
  const rels = new Set(files.map((f) => f.rel));
  for (const must of ['scripts/verify.mjs', 'scripts/test.mjs', 'scripts/lib/git-env.mjs', 'scripts/verify.test.mjs', 'hooks/coalface-conductor.js']) {
    assert.ok(rels.has(must), `the census walk no longer reaches ${must}`);
  }
  const r = roomCensus(repo);
  assert.deepEqual(r.findings, []);
  assert.equal(r.files, files.length);
  assert.equal(r.exempted, ROOM_PINS.length, 'both pinned carriers are present at their pinned blobs');
  assert.ok(r.calls >= 15, `only ${r.calls} git spawns counted: the census walk shrank`);
  assert.equal(r.safe, r.calls, 'every counted spawn is safe');
});

test('each pin is needed: dropping it makes the census name that file (the measurement, kept as a test)', () => {
  const files = collectRoomSources(repo);
  for (const pin of ROOM_PINS) {
    const rest = ROOM_PINS.filter((p) => p !== pin);
    const r = scanGitSpawns(files, rest);
    assert.ok(r.findings.some((f) => f.startsWith(pin.rel + ':')), `${pin.rel} reads clean without its pin: remove the pin`);
  }
});

test('each pin names the blob the file holds now: an edited carrier re-arms the census', () => {
  const files = collectRoomSources(repo);
  for (const pin of ROOM_PINS) {
    const f = files.find((x) => x.rel === pin.rel);
    assert.ok(f, `${pin.rel} is missing`);
    assert.equal(gitBlobId(f.text), pin.blob, `${pin.rel} changed: read the change, then re-pin it`);
    assert.ok(pin.why.length > 20);
    const edited = scanGitSpawns([{ rel: f.rel, text: f.text + '\n// edited\n' }], ROOM_PINS);
    assert.ok(edited.findings.length >= 1 || edited.exempted === 0, `${pin.rel} stayed exempt after an edit`);
  }
});

test('the gate refuses a planted env copy and accepts the room helper, through the same room entry point', () => {
  const spawn = (opts) => "import { spawnSync } from 'node:child_process';\nspawnSync(" + GIT + ", ['status'], " + opts + ');\n';
  const bad = scanGitSpawns([{ rel: 'scripts/planted.mjs', text: spawn('{ env: ' + ENV + ' }') }], ROOM_PINS);
  assert.ok(bad.findings.length >= 1 && bad.calls === 1);
  const good = scanGitSpawns([{ rel: 'scripts/ok.mjs', text: "import { gitEnv } from './lib/git-env.mjs';\n" + spawn('{ env: gitEnv() }') }], ROOM_PINS);
  assert.deepEqual([good.findings, good.calls, good.safe], [[], 1, 1]);
  const fixture = scanGitSpawns([{ rel: 'scripts/ok2.mjs', text: "import { gitTestEnv } from './lib/git-env.mjs';\n" + spawn('{ env: gitTestEnv(root) }') }], ROOM_PINS);
  assert.deepEqual([fixture.findings, fixture.calls, fixture.safe], [[], 1, 1], 'gitTestEnv is trusted when imported from the room git-env.mjs (the re-export)');
});
