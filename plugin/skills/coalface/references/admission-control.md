# Admission control — the MACHINE bound, by a live reading

> Loaded on-demand from WAVES (step 4, P29). Three bounds compose, each answering a different question: the WALLET bounds **dollars** (§ Wallet) · `bandwidth` bounds **speed** (AIMD, agent-process width) · this bound asks **the machine**: is there room right now for the next apply-time DOMAIN-GATE run (main's own step-7 build/test, or a depth-1 nested conductor's own for its scope) or the next wave of heavy local work? It is separate from worker-wave width, which is `floor(platform width × bandwidth%)` alone.

## Why a third bound

Board #89's exhibit: 10 lanes flew without a single file collision — the partition/QC/single-writer discipline held — and 13 live node runtimes drove the host to 82% CPU. Nothing before this bounded the MACHINE: the wallet answers "can we afford this in dollars", `bandwidth` answers "how many agent processes may the platform hold open", and neither one asks whether the box running the local gate steps has the room to do it.

## The reading

`node <skill dir>/scripts/machine-reading.mjs --cpu-max <admitCpuBusyMaxPct> --mem-min <admitMemFreeMinPct> [--running <n>] [--json]`, run by the agent before each domain-gate run and before each wave of heavy local work. Each call is one fresh reading and keeps no state. Exit 0 = BREATHE (start), 1 = WAIT (hold, read again later), 64 = usage error, 2 = could not read.

- **CPU:** busy % from a delta of `os.cpus()` times over a short sample. Where Linux cgroup v2 holds a quota (`cpu.max`), busy % of that quota from `cpu.stat` usage over the same sample. The output names its source: `cgroup`, `host` or `unmeasured`.
- **Memory:** free % from `process.availableMemory()` (it sees a container limit; `os.freemem()` when absent) over `process.constrainedMemory()` when that is above 0, else `os.totalmem()`.
- **GPU:** not read (no portable API); printed `N/A`.
- **Unmeasured never blocks.** An axis the machine cannot report (an empty CPU list, a container that hides its limit) reads as unmeasured and never holds a run on its own. Where `node` itself cannot run, the whole reading is unmeasured: run one unit at a time and never wait for it.
- **At least one unit always runs.** `--running 0` admits the first unit regardless of the reading, so a queue never sticks. Pass the number of units you already hold for the second and later.
- **WAIT queues, never denies.** A held run completes in full once the box breathes (P29, the same shape as P19's transient backoff).
- **The platform's own cap stays.** A Workflow's own process cap is the vendor's and is not ours to lift.

## The thresholds are OURS

`admitCpuBusyMaxPct` (WAIT at or above this busy percent, 1-100, default 80) and `admitMemFreeMinPct` (WAIT below this free percent, 0-99, default 10) are this room's own defaults, not a measurement of any machine: lower the first on a shared or slow box, raise the second on a box that swaps early. **A project config may only make admission STRICTER:** lower `admitCpuBusyMaxPct`, raise `admitMemFreeMinPct`, never the other way. The floor is the global value, or the schema default when there is no global; the agent takes the stricter of the global and project values. A cloned repo's file is not the machine's owner, and these two keys are the only bound between it and the user's machine. This is PROSE strength: no hook reads these keys (hooks-safety.md §9, THE CEILING), so it is a mitigation, never "clamped". The probe refuses an out-of-range value (exit 64), but the shell parses the command line before the probe does, so the agent substitutes plain integers only and treats any other value as a bad value; `configure.mjs` validates at write (`validateValue` in `scripts/lib/config-schema.mjs`), and nothing validates a hand-edited file at read. `maxLocalWorkers` stays plain project-wins: under the same reading a higher value only adds concurrency; 0 = no count, the reading decides; a positive number is the user's own ceiling on concurrent domain-gate runs, honoured as given.

## Exit codes, and what the agent does

- 0 BREATHE: start. 1 WAIT: hold, read again later.
- 2 (could not read the machine): treat as unmeasured, run one unit at a time, never block.
- 64 (a threshold value out of range, or a bad flag): fix the value; meanwhile one unit at a time.

## Retired: the cores formula

R18 retired `cap = max(1, min(16, floor((cores - 2) / 2)))` (v0.5.0). Its `RESERVE = 2` was Claude Code's own constant, a vendor's, and its `WORKER_CORE_WEIGHT = 2` was one reading on one box (board #89); a tool built for every machine reads the machine instead.

## Watched, not built

BB-10: a depth-1 nested conductor that runs its own apply gate is a second reader of the same machine, and two readers can both see BREATHE and both start. That race is WATCHED, not built; the reading is a courtesy to the box, not a lock.

## Composition with the Workflow engine

A Workflow script cannot import anything and its workers never run a build. Inside the script, worker waves size to `bandwidth` only (`references/workflow-engine.md` rule 1). The reading gates the conductor's own apply-time gate runs, which main takes OUTSIDE the script, after collection.
