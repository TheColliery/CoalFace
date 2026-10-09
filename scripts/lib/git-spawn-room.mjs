// 09a -- this room's side of the shared git-spawn census (scripts/lib/git-env-census.mjs, adopted by blob id from .github's
// templates/overlay-coal-skill/, never edited here). The canon ships NO pin; the room names its own, and a pin dies with the first
// edited byte of its file (the census compares git blob ids). Used by scripts/verify.mjs (the gate) and scripts/git-env-census-room.test.mjs.
//
// One pin, MEASURED by dropping it (scripts/git-env-census-room.test.mjs holds that measurement as a test):
//   - scripts/secret-gate.mjs (856956a1): the canon's own pinned carrier. It keeps GIT_INDEX_FILE on purpose (the partial-commit read), so its two
//     reads hold process.env without gitEnv().
// scripts/secret-scan.test.mjs carried a second pin (d0db994d) until 09b: the Bankfire source moved to a0319dcd, which builds every child environment
// from named keys and reads clean with no pin (measured: dropping the pin left 0 findings in that file), so the pin came out with the copy.
// Every other file reads clean with no pin, among them scripts/secret-gate.test.mjs (2f066650), release-notes.mjs (f8d998d8),
// release-notes.test.mjs (7e779ef8) and verify-release-shape.test.mjs (fa8a730d).
import fs from 'node:fs';
import path from 'node:path';
import { scanGitSpawns, collectScriptsMjs } from './git-env-census.mjs';

export const ROOM_PINS = [
  { rel: 'scripts/secret-gate.mjs', blob: '856956a1cca6f716e5507f6c23ac90ed34cbbe5f', why: 'byte-equal org carrier; keeps GIT_INDEX_FILE by design (the canon pins the same file)' },
];

// scripts/**/*.mjs through the canon walk, plus hooks/*.js (the canon walk covers scripts/ only; a hook spawns no git today and the census keeps it that way).
export function collectRoomSources(repo) {
  const files = collectScriptsMjs(repo);
  const hooks = path.join(repo, 'hooks');
  if (fs.existsSync(hooks)) {
    for (const n of fs.readdirSync(hooks)) if (n.endsWith('.js')) files.push({ rel: 'hooks/' + n, text: fs.readFileSync(path.join(hooks, n), 'utf8') });
  }
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

export function roomCensus(repo) {
  return scanGitSpawns(collectRoomSources(repo), ROOM_PINS);
}
