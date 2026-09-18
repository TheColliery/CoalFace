# Admission control — the MACHINE bound (board #90)

> Loaded on-demand from WAVES (step 4, P29). Three bounds now compose, each answering a different question: the WALLET bounds **dollars** (§ Wallet) · `bandwidth` bounds **speed** (AIMD, agent-process width) · this bound caps **the machine** — how many concurrent apply-time DOMAIN-GATE runs (main's own step-7 build/test, or a depth-1 nested conductor's own for its scope) may hold a CPU-bound slot at once. Effective width = `min(floor(platform width × bandwidth%), maxLocalWorkers)`.

## Why a third bound

Board #89's exhibit: 10 lanes flew without a single file collision — the partition/QC/single-writer discipline held — and 13 live node runtimes drove the host to 82% CPU. Nothing before this bounded the MACHINE: the wallet answers "can we afford this in dollars", `bandwidth` answers "how many agent processes may the platform hold open", and neither one asks whether the box running the local gate steps has the cores to do it.

## The senior, and which half transfers (AGENTS.md "THE SOURCE'S VARIABLES ARE NOT OURS")

Claude Code's own admission control for agent processes: `min(16, cores-2)`, excess QUEUED, never denied. **What transfers:** the SHAPE — a bounded slot count derived from the live machine, plus a queue rather than a rejection. **What does not transfer:** the NUMBER. CC's agents are mostly network/API-bound — idle waiting on a response, not holding a core — so a flat ceiling regardless of core count is right for that variable set. A CoalFace worker is a spawn-tool-less Explore-class leaf (P1) — it never runs a build/test step, so CC's formula fits it fine. What CC's formula was never built to hold is CONDUCTOR concurrency: main's own step-7 domain-gate run (or a depth-1 nested conductor's own apply-time gate) genuinely burns CPU as a real child process, and more than one may run at once.

## Derivation (`scripts/lib/admission-control.mjs`)

```
cap = max(1, min(CEILING, floor((cpuCount - RESERVE) / WORKER_CORE_WEIGHT)))
```

- `cpuCount` — `os.cpus().length`, read live on the machine running the swarm (never hardcoded — Phoenix #9).
- `RESERVE = 2` — cores held back for the host, CC's own number, applies identically (it is not our variable to re-derive; it is about leaving general headroom regardless of what runs on top of it).
- `WORKER_CORE_WEIGHT = 2` — **this room's own variable.** Board #89's exhibit measured ~1.3 node runtimes per lane at the sampled moment (13 runtimes / 10 lanes) — a conductor's own gate-run process plus, at times, a transient build/test child it spawns. One data point is a warning sign, not a precision target: budgeting 2 cores per admitted slot (the gate-run process + headroom for that transient child) is the conservative read of that ratio, not a fit to its noise.
- `CEILING = 16` — an upper bound regardless of core count, mirroring CC's own top and `bandwidth`'s existing ceiling logic; a very high core count still gets a sane ceiling rather than unbounded fan-out (other unmodeled limits — disk I/O, the account's own rate limit — still apply).

`maxLocalWorkers` (global `~/.claude/.coalface.json` overlaid by the nearest project config — never the bare project file alone, which is ABSENT on a machine configured only globally; default `0`) LOWERS the derivation with an explicit integer when the user knows their own box better than the formula does — never past the machine-derived cap (THE MACHINE BOUND, AGENTS.md: a clone-borne config is not the box's owner); `0` means auto-derive. **Classification (hooks-safety.md §9): this is a CAP, not a consent-bearing spend key — it gates neither an outward action nor a standing consent, only local scheduling speed.** Plain project-wins merge, no safer-value-wins clamp, same class as `bandwidth`/`autoFanoutFloor` (§9's own "Numeric keys: considered and DECLINED" carve-out — clamp enums/sets, leave numbers to their read-time floor, which `validateValue`'s `min`/`max` already provides).

## Queue mechanics (`createAdmissionGate`)

An async FIFO semaphore: `capacity` concurrent `acquire()` calls resolve immediately; the next one queues until a `release()` frees a slot. No gate-run is ever denied — concurrency above the cap completes in full, at reduced concurrency, same as `bandwidth`'s AIMD settling at real capacity rather than breaking (P29 mirrors P19's "transient, never surfaced as a failure" shape one bound over).

Compose with WAVES: each wave still sizes to `bandwidth`'s effective width for its worker spawns; separately, main (or a depth-1 nested conductor running its own scope) `acquire()`s this gate before its own step-7 domain-gate run and `release()`s after. Where several such apply-time gates could run at once (main's own parallel dispatch cadence, or several nested conductors each applying their own scope), the cap admits them in sub-batches — the AGENT-level wave and the MACHINE-level gate are independent layers, and only the gate touches real child processes.

## Composition with the Workflow engine

`references/workflow-engine.md` rule 1 already bans raw `parallel(all-N)` because the engine's own ~16-process cap doesn't protect the wallet. It doesn't protect the machine either — the same wave-slicing discipline that rule already mandates is exactly where this gate plugs in: size waves to `bandwidth`, admit each conductor's own apply-time domain-gate run through `createAdmissionGate(resolveCap(maxLocalWorkers))`.

## Proof

`scripts/lib/admission-control.test.mjs` simulates a fan-out above capacity with an independent counter (not the gate's own bookkeeping) and asserts peak concurrency never exceeds the cap and every worker completes — none denied. Red-first: the identical test body run against a naive no-op gate (unconditional admission, no queue) trips the over-admission assertion (`peak 13 exceeded capacity 5`), proving the assertion is sensitive to the defect it exists to catch before the real gate is trusted to pass it.
