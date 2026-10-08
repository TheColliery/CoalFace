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
//
// 08b b1: --test-timeout cancels a hung TEST, but a file that keeps a handle open (a setInterval, a server, a child) keeps
// its process alive, so the run never ends. The zone rule (ninth amendment, 2026-10-08 correction) asks for all of it:
// --test-force-exit in the argv AND a whole-run deadline that kills the TREE (runPlan). RUN_DEADLINE_MS basis: the full
// suite measured 154 s wall on this box (inspect, 2026-10-08), so 600000 is about 4x, room for a slower CI leg and no more.
// This room is ahead of CoalTipple's test-spawn.mjs on this point (one-flock: the chief routes the sibling sweep).
import { spawn, spawnSync } from 'node:child_process';
import { testChildEnv } from './test-child-env.mjs';

export const TEST_TIMEOUT_MS = 240000;
export const RUN_DEADLINE_MS = 600000;
export const HEAP_FLAG = '--max-old-space-size=2048';

export function testSpawnPlan(tests, baseEnv, { timeoutMs = TEST_TIMEOUT_MS } = {}) {
  const env = testChildEnv(baseEnv);
  const caller = env.NODE_OPTIONS || '';
  const nodeOptions = /(^|\s)--max[-_]old[-_]space[-_]size=/.test(caller) ? caller : `${caller} ${HEAP_FLAG}`.trim();
  return { args: ['--test', '--test-concurrency=1', `--test-timeout=${timeoutMs}`, '--test-force-exit', ...tests], env: { ...env, NODE_OPTIONS: nodeOptions } };
}

// Runs the plan to its end or to the whole-run deadline. On the deadline the runner's own pid (never a pattern) is killed
// with its tree: on Windows a signal leaves the file processes behind, so taskkill /T /F does it. Resolves to the exit status
// (1 on a signal or a deadline).
export function runPlan(plan, { cwd, deadlineMs = RUN_DEADLINE_MS, stdio = 'inherit' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, plan.args, { cwd, stdio, env: plan.env });
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', timeout: 30000 });
      else child.kill('SIGKILL');
    }, deadlineMs);
    child.on('error', () => { clearTimeout(timer); resolve(1); });
    child.on('close', (code) => { clearTimeout(timer); resolve(expired ? 1 : (code ?? 1)); });
  });
}
