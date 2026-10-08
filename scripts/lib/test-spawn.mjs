// The child spawn plan of scripts/test.mjs (CWK-199's class), composed with testChildEnv() (the GIT_* strip stays).
// `node --test` spawns one child per test file. The heap cap rides NODE_OPTIONS in the ENV so every descendant inherits
// it, a test's OWN spawns included; measured on Node 24.19 (zone rule dispatch-transport.md, ninth amendment, 2026-10-08
// correction) the runner also passes its own --max-old-space-size to the file processes, so the argv form does cap
// them: the env form's extra reach is the processes a test itself starts. --test-concurrency stays in ARGV (Node 24.19
// refuses it inside NODE_OPTIONS). A caller's own heap flag is kept as set (their cap wins, never doubled), in any
// spelling Node accepts (dash or underscore per word); the space form `--max-old-space-size 1024` is refused by Node.
//
// TEST_TIMEOUT_MS is the finite clock testing.md asks of every test entry. Basis, measured 2026-10-08 on this box,
// serial, heap-capped: the slowest file is scripts/verify.test.mjs at 82.1 s wall, so 240000 is just over twice it
// (CoalTipple's 120000 is twice ITS slowest file, 57 s, and would leave this room under 1.5x). On Node 22 the clock is
// per FILE; on Node 24 per test. A synchronous block (a spawnSync that hangs) is cut by that call's own timeout.
import { testChildEnv } from './test-child-env.mjs';

export const TEST_TIMEOUT_MS = 240000;
export const HEAP_FLAG = '--max-old-space-size=2048';

export function testSpawnPlan(tests, baseEnv) {
  const env = testChildEnv(baseEnv);
  const caller = env.NODE_OPTIONS || '';
  const nodeOptions = /(^|\s)--max[-_]old[-_]space[-_]size=/.test(caller) ? caller : `${caller} ${HEAP_FLAG}`.trim();
  return { args: ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`, ...tests], env: { ...env, NODE_OPTIONS: nodeOptions } };
}
