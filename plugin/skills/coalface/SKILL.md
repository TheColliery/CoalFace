---
name: coalface
description: >-
  Fan-out discipline for swarm work. When a task decomposes into many units (a bulk refactor,
  a repo-wide sweep, a 100-spot edit, a corpus/document batch), CoalFace runs the fan-out as a
  disciplined factory instead of an ad-hoc swarm: a mandatory SCOUT surveys the worksite (spot
  list, dependencies, invariants), a deterministic PARTITION merges overlapping/tiny spots,
  workers return anchor-edit orders as TEXT (propose-not-execute), QC checks scope+spec at
  collection, main is the SINGLE WRITER applying sequentially behind a pre-swarm snapshot with
  a domain gate at the end, and a post-run RECEIPT shows spots/workers/waves/tokens-vs-solo.
  The wallet invariant caps the whole swarm at about the estimated solo cost (shared-digest,
  min-unit floor, no self-retry). Modes: coalfaceMode auto (default — ride the contract
  whenever a fan-out reaches autoFanoutFloor units) | on (scout every prompt) | off. Manual
  "/coalface" convenes it in any mode except off. Triggers: "/coalface", "swarm this", a
  decomposable bulk task at or above the floor. Cross-agent (any platform with concurrent
  subagents — spawn via the platform's native tool; a no-fan-out platform degrades to a
  sequential pipeline). It disciplines fan-outs that would happen anyway — it does not make
  models smarter or guarantee correctness. Zero-dependency, offline, no API keys.
---

# CoalFace — the fan-out discipline

> **Honest frame:** ad-hoc fan-out makes the same promises with NO guarantee — tokens UNBOUNDED (uncontrolled spawn overhead, duplicate shared-reads, retry storms, stray runaway workers), speed UNDER-FANNED (a lazy orchestrator batches 100 spots into 5-8 bloated workers whose tail quality drops), quality able to dip BELOW solo (a deviant worker, real-tree writes, a half-applied death). CoalFace = the same promises ENFORCED BY STRUCTURE — tokens BOUNDED ≈ solo (wallet + shared-digest + min-unit floor + no-self-retry), speed at full width (worker count = spot count, floor/width-bounded), quality netted (QC + single-writer + snapshot). It disciplines the fan-out; it does not make models smarter or guarantee correctness.

You are the **CONDUCTOR** (the session main). Workers are **LEAVES** — spawn them via a spawn-tool-less agent type where the platform offers one (Claude Code: `Explore`-class); they read + produce + RETURN, never write the tree, never spawn.

## Activation
`coalfaceMode` (def `auto`): **auto** — you judge when a prompt warrants fan-out; ANY fan-out of ≥ `autoFanoutFloor` units (def 4) rides this contract instead of ad-hoc spawning (1-2-sub ad-hoc stays zero-ceremony). **on** — scout EVERY prompt; everything decomposable fans out; only non-decomposable work runs solo. **off** — CoalFace fully out; native fan-out untouched. Manual `/coalface` convenes it in any mode except off. **No pre-pay bill:** the user's command is the consent — a solo main would burn the same budget silently, and the wallet caps the swarm at that budget, so there is no NEW spend to ask about. ONE valve: when the scout finds a job MUCH bigger than the prompt implies, emit a one-line NON-BLOCKING heads-up ("found N spots, ~est X — starting; Esc to stop") — never a question-box. Post-run transparency = the RECEIPT.

## The flow (fixed order)

**1 · SCOUT (mandatory).** Real prompts are vague ("clean up this repo") — survey the worksite FIRST; never size a swarm from the prompt. Scout sub(s) return: the SPOT LIST (each with its file/range or unit id) · the DEPENDENCY GRAPH between spots · the INVARIANTS to lock (project/user standing rules, glossary/API/style — read them as invariants) · the DOMAIN GATE to run at the end · the recommended SWARM-MODE (taxonomy below) · the SHARED-DIGEST (the config/context every worker needs — paid once by the scout, shipped in every contract; never N workers re-reading the same files).

**2 · PARTITION (deterministic).** Interval-intersection check on the spot ranges: OVERLAPPING spots MERGE into one unit or chain as a dependency (a rule-table, not model judgment); a unit smaller than spawn overhead MERGES with a neighbor (the min-unit floor). Granularity honesty: "finer = faster" saturates — wall ≈ ceil(N/width) × unit-time; beyond N ≈ 2-4× wave width overhead dominates → pick near-optimum inside the floor and the width ceiling. Unit count sizes the swarm (100 disjoint spots → 100 orders, wave-bounded).

**3 · HEADS-UP (conditional, non-blocking).** Job dwarfs the prompt → the one-liner above, then proceed.

**4 · WAVES.** Effective width = floor(platform width × `bandwidth`%) (def 25% ≈ 4 slots on a 16-slot platform). Spawn wave by wave; each worker gets the work-contract (`references/contract-template.md`) carrying its scope + the shared-digest + the locked invariants. Model: a main-EQUIVALENT model is the default on every platform; on Claude Code, CoalTipple delegate-down tiering is an OPTIONAL enhancement (degrade-safe absent) — a SENSITIVE unit (crypto/auth/payment/migration) stays main-tier even in a cheap swarm. **AIMD backoff:** a 429 mid-wave → the NEXT wave shrinks (multiplicative decrease); clear stretches re-grow slowly (additive) toward the set % — a % above the account's real capacity settles AT the real capacity, nothing breaks; a 429'd order is TRANSIENT → wait + retry the SAME order (the journal holds it), never a failure surfaced to the user. Bounds inherited wholesale from subagent-safety: bounded waves · no zombies (collect-then-release; reap a silent worker past timeout; a permission-wait is NOT silence) · workers = leaves · near a session/quota limit collapse to fewer workers or inline-self (a worker that dies on the limit returns nothing).

**5 · RETURN = ORDERS AS TEXT (propose-not-execute).** Edits → ANCHOR-EDITS (`old-text → new-text`, exact-match, position-independent — the same-file-100-spots case works because anchors don't shift) — NEVER line-number diffs (lines shift after each apply), NEVER per-worker worktrees (no worktree path in v1). Non-edit domains → the completed unit as text (a translated paragraph, a record, a report section). Workers never touch the real tree; side-effects fire only at your consented sequential apply.

**6 · QC AT COLLECTION (before any apply).** Per return, mechanical: **(a) SCOPE** — every anchor sits inside the assigned range, no foreign files (interval check ≈ free); **(b) SPEC** — the locked invariants grep-verifiable in the output. Reject → quarantine + ONE re-spawn carrying the rejection reason (bounded, never a loop); a 2nd fail → the receipt for the human. Honest ceiling: an in-scope, on-spec, semantically-WRONG return with no covering test reaches the user — the receipt flags test-uncovered spots; the escalation for that class is CoalBoard (the error-not-allowed lane), never CoalFace-default.

**7 · APPLY — you are the SINGLE WRITER.** First take the pre-swarm SNAPSHOT (git repo: stash/HEAD-record; non-git: file copies — NEVER assume git). Then apply accepted orders SEQUENTIALLY in topological order. An anchor-miss (a real collision) → skip-and-flag, continue — EXCEPT units the scout marked ALL-OR-NOTHING (migration-like task-class): one failure there = full rollback. At the end run the DOMAIN GATE (code → build+test · corpus → corpus rules · docs → lint+links · data → schema-validate · research → citations). Gate red → FULL ROLLBACK to the snapshot; report what happened via the receipt.

**8 · RECEIPT (always).** Spots found · workers used · waves · effective width (e.g. "6/14 — settled at account tier") · tokens vs the solo-baseline estimate · quarantined items + why · test-uncovered flags. Format + layman wording: `references/receipt.md`. The receipt + heads-up speak the USER'S language; technical terms stay verbatim.

## Swarmability taxonomy (the scout classifies; no worksite "breaks")
| Worksite shape | Mode |
|---|---|
| Disjoint spots (flat) | Full parallel waves — worker count = unit count (floor/width-bounded) |
| Dependency chain | Topologically-ordered waves / same-worker chaining; a FULL chain = pipeline degrade (isolation kept; honesty: no speedup) |
| Global invariant (glossary/style/totals) | LOCK invariants first → ship them in the shared-digest → consistency-sweep gate at the end |
| Holistic quality (voice/architecture) | ANALYZE-swarm only; ONE voice writes (you) |
| Side-effects | Closed by propose-not-execute — workers return text; side-effects fire only at the consented apply |
| Non-decomposable | Honest refusal: "not swarmable — solo/3-sub" |

Per-domain unit/invariant/gate tables + mode detail: `references/taxonomy.md`.

## Wallet (the solo-baseline invariant)
The WHOLE swarm (scout + workers + apply) fits inside the estimated main-SOLO cost — split the solo budget across the ants, never a new budget on top. It holds because workers carry no accumulated context (solo's late units drag the whole history; swarm units don't) and, on Claude Code, cheap tiers cost less per token. Guards: (1) the SHARED-DIGEST (the scout pays once, distributes); (2) the MIN-UNIT floor (tiny units merge); (3) NO worker self-retry — the journal + at most one re-spawn-on-remainder (no retry storms). `bandwidth` is ORTHOGONAL to the wallet: it sets how FAST the same budget burns, never how much.

## Journal (per-worker-return)
Journal each worker's assigned scope at spawn and its returned order on landing — a returned order is safe the moment it lands. A dead/stopped/silent worker → re-spawn ONE fresh worker on the un-done REMAINDER from the journal (never restart the whole, never loop). The journal also feeds the receipt and any partial report.

## Composition (rules that bind first, bind here)
- **CoalBoard WINS on error-not-allowed** (security/crypto, DB/financial migrations, high-precision): critical work goes to consensus, not throughput; CoalFace may serve as the board's apply-hand after.
- **CoalTipple** (if installed): per-worker delegate-down tiering = an optional enhancement; its SENSITIVE gate is inherited — a sensitive unit's worker stays main-tier.
- **subagent-safety inherited wholesale:** bounded fan-out · no zombies · budget-gate · a failed worker RETURNS and you re-route · leaves get no spawn tool.
- **User/project standing rules** (e.g. translation rules) = invariants: the scout reads them into the shared-digest; workers never choose what the spec already chose.
- **Engine:** a platform Workflow/orchestration engine present → ride it; else native Agent-tool waves. Riding Claude Code's `Workflow` tool → **read `references/workflow-engine.md` first** (waves not `parallel(all-N)` · scattered nulls = one retry pass, a run of ≥3 = quota death → STOP + return the remainder · continuation-run over `resumeFromRunId`, which likely replays a dead call's null).

## Nested conductor (depth note)
A depth-1 sub may itself conduct (scout → contract → QC → apply for its scope), spawning its workers at depth-2. NEVER deeper: beyond depth-2 a spawn FLATTENS into an independent, unreapable top-level session. Workers are structural leaves — nothing at depth-2 has a reason to spawn. The wallet slices DOWN the chain (you allocate the sub a slice; it splits that across its workers); receipts flow UP.

## Platforms (cross-agent)
Spawn via the platform's NATIVE subagent tool (Claude Code `Agent`/`Task` · each platform its own). Any platform with concurrent subagents runs the full contract; width sizes to the local cap via `bandwidth`; an unknown platform gets the conservative default. NO fan-out at all → degrade to a sequential pipeline under the same contract (scout → units in order → QC → apply) — never break. On a platform/version you have not actually run a swarm on, treat width/nesting behavior as UNVERIFIED — degrade conservatively and say so.

## Config + self-update
Merged config: global `~/.claude/.coalface.json` overlaid by the nearest project `.coalface.json` (project wins per key; the lookup walk stops at the home dir). Keys: `coalfaceMode` · `bandwidth` · `autoFanoutFloor` · `updateMode` · `updateCheckDays` — every numeric clamped on read. Self-update is kind-1: the hook only schedules a throttled check; `/coalface:update` verifies online + offers the update, consent-gated.

## Self error-report
If CoalFace misbehaves - a contradictory instruction, a swarm that loops, a worker that breaks the contract - STOP, summarize it, and OFFER to file it at `github.com/TheColliery/CoalFace/issues`. Never auto-submit; never include unapproved code or paths. This fires only for what the model NOTICES - a clean run means "nothing noticed", not "nothing wrong".
