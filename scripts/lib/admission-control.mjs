// The MACHINE bound (board #90) -- the third bound alongside the wallet (dollars,
// SKILL.md § Wallet) and `bandwidth` (agent-process WIDTH/speed, AIMD). Neither of
// those two touches the host running the swarm: main's own step-7 APPLY-time DOMAIN
// GATE (the build/test run at apply time -- or a depth-1 nested conductor's own
// apply-time gate for its scope, SKILL.md's Nested Conductor section) is a real
// CPU-bound child process, and nothing before this file capped how many of those may
// run concurrently. Workers never hold this slot -- they are spawn-tool-less leaves
// (P1) that read + propose text and structurally cannot run a build/test step.
//
// Senior cited, not copied (AGENTS.md "THE SOURCE'S VARIABLES ARE NOT OURS"): Claude
// Code's own admission control for agent PROCESSES is `min(16, cores-2)` -- excess
// QUEUED, never denied. That SHAPE transfers (a bounded slot count + a queue, not a
// rejection). The NUMBER does not: CC's agents are mostly network/API-bound (idle-
// waiting, not CPU-bound), so a flat ceiling of 16 regardless of core count is right
// for THAT variable set. Ours differs -- a concurrent apply-time gate run genuinely
// burns CPU (board #89's exhibit: 10 concurrent lanes produced 13 live node runtimes
// at 82% CPU, i.e. more than one node process alive per admitted gate-run at the
// sampled moment -- the conductor's own gate-run process plus a transient child it
// spawned for the build/test itself). So the derivation keeps CC's RESERVE headroom
// (2 cores held back for the host) but adds a WORKER_CORE_WEIGHT the vendor's formula
// has no slot for, sized conservatively (2, not the exhibit's noisy ~1.3) so a single
// data point isn't fit as if it were precision rather than a warning sign.

const DEFAULT_RESERVE = 2; // cores held back for the host -- CC's own shape, applies identically
const DEFAULT_WORKER_CORE_WEIGHT = 2; // this room's own variable: an admitted gate-run's own process + one transient build/test child
const DEFAULT_CEILING = 16; // upper bound regardless of core count, mirrors CC's own top and `bandwidth`'s existing ceiling logic

// Pure function: no os import here, no live read -- the caller supplies cpuCount so
// this stays a deterministic, testable formula (Phoenix #8) independent of the box
// running the test.
export function deriveMachineCap({
  cpuCount,
  reserve = DEFAULT_RESERVE,
  workerCoreWeight = DEFAULT_WORKER_CORE_WEIGHT,
  ceiling = DEFAULT_CEILING,
} = {}) {
  if (!Number.isInteger(cpuCount) || cpuCount < 1) throw new RangeError('cpuCount must be a positive integer');
  const raw = Math.floor((cpuCount - reserve) / workerCoreWeight);
  return Math.max(1, Math.min(ceiling, raw)); // never 0 -- a cap of 0 would deadlock every wave, not throttle it
}

// `configured` is the .coalface.json `maxLocalWorkers` value: 0 (or absent, per the
// schema default) means auto-derive; a positive integer is an explicit override the
// user stated for their own box -- plain project-wins, no safer-value-wins clamp
// needed for LOWERING (this is a CAP, not a consent-bearing key; see hooks-safety.md
// §9's "Numeric keys: considered and DECLINED" carve-out, same class as `bandwidth`).
// But it may only LOWER the cap, never RAISE it past the machine-derived one -- a
// clone-borne config is not the box's owner, and maxLocalWorkers is the sole host-
// safety gate (THE MACHINE BOUND, AGENTS.md): the tightest bound binds.
export function resolveCap(configured, deriveOpts = {}) {
  const machineCap = deriveMachineCap(deriveOpts);
  if (Number.isInteger(configured) && configured >= 1) return Math.min(configured, machineCap);
  return machineCap;
}

// A minimal async semaphore -- admission, not rejection. `capacity` concurrent
// acquire()s resolve immediately; the (capacity+1)th queues (FIFO) until a release()
// frees a slot. Zero-dep, deterministic given the same call order (Phoenix #2/#8).
export function createAdmissionGate(capacity) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
  let current = 0;
  let peak = 0;
  const queue = [];
  return {
    get current() { return current; },
    get peak() { return peak; },
    get queued() { return queue.length; },
    async acquire() {
      if (current >= capacity) await new Promise((resolve) => queue.push(resolve));
      current += 1;
      if (current > peak) peak = current;
    },
    release() {
      current -= 1;
      const next = queue.shift();
      if (next) next();
    },
  };
}
