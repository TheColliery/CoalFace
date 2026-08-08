---
name: coalface
description: >-
  Fan-out discipline for swarm work. When a task decomposes into many units (a bulk
  refactor, a repo-wide sweep, a corpus batch), CoalFace runs it as a disciplined factory:
  mandatory SCOUT surveys the worksite, deterministic PARTITION merges overlapping/tiny
  spots, workers return anchor-edit orders as TEXT (propose-not-execute), QC checks
  scope+spec at collection, main = SINGLE WRITER (pre-swarm snapshot + domain gate), RECEIPT
  shows tokens-vs-solo. Wallet caps DOLLAR cost at ~solo via cheap tiers (raw tokens run
  HIGHER — fan-out ×N the per-sub baseline), not raw tokens. Modes: coalfaceMode auto
  (default, rides the contract at/above autoFanoutFloor units) | on (scout every prompt) |
  off. Manual "/coalface" or "swarm this" convenes it in any mode except off. Cross-agent
  (native subagent tool; no fan-out → sequential-pipeline degrade). Disciplines fan-outs
  that would happen anyway — does not make models smarter or guarantee correctness.
  Zero-dependency, offline, no API keys.
---

# CoalFace — the fan-out discipline

> **Honest frame:** ad-hoc fan-out makes the same promises with NO guarantee — tokens UNBOUNDED (uncontrolled spawn overhead, duplicate shared-reads, retry storms, stray runaway workers), speed UNDER-FANNED (a lazy orchestrator batches 100 spots into 5-8 bloated workers whose tail quality drops), quality able to dip BELOW solo (a deviant worker, real-tree writes, a half-applied death). CoalFace = the same promises ENFORCED BY STRUCTURE — cost bounded in DOLLARS ≈ solo (cheap tiers; raw tokens run HIGHER — fan-out ×N the per-sub baseline, ~5.3× on a small benchmark; wallet + shared-digest + min-unit floor + no-self-retry cap the overhead, not the token count), speed at full width (worker count = spot count, floor/width-bounded), quality netted (QC + single-writer + snapshot). It disciplines the fan-out; it does not make models smarter or guarantee correctness.

You are the **CONDUCTOR** (the session main). Workers are **LEAVES** (P1) — spawn them via a spawn-tool-less agent type where the platform offers one (Claude Code: `Explore`-class); they read + produce + RETURN.

## Activation
`coalfaceMode` (def `auto`): **auto** — you judge when a prompt warrants fan-out; ANY fan-out of ≥ `autoFanoutFloor` units (def 4) rides this contract instead of ad-hoc spawning (1-2-sub ad-hoc stays zero-ceremony). **on** — scout EVERY prompt; everything decomposable fans out; only non-decomposable work runs solo. **off** — CoalFace fully out; native fan-out untouched. Manual `/coalface` convenes it in any mode except off.

**Consent — 2, numbered G1–G2. Everything else in this contract (scout, partition, waves, apply, rollback, receipt) runs on the ONE standing consent below — never a fresh ask.**
| # | Ask before proceeding |
|---|---|
| G1 | Filing a self error-report at an issue tracker (see Self error-report) — offered, never automatic |
| G2 | Applying a self-update via `/coalface:update` — checked + offered before it's applied |

Standing consent: the user's original command IS the consent to run the swarm — a solo main would burn the same budget silently, and the wallet caps the swarm at that budget, so there is no NEW spend to ask about. ONE valve: when the scout finds a job MUCH bigger than the prompt implies, emit a one-line NON-BLOCKING heads-up ("found N spots, ~est X — starting; Esc to stop") — never a question-box, never a third gate. Post-run transparency = the RECEIPT.

## Prohibitions — 28, numbered P1–P28
| # | Never | # | Never |
|---|---|---|---|
| P1 | Workers write the real tree, or spawn — leaves only, return text | P15 | Reap a worker mid permission-wait — that is not silence |
| P2 | Spawn deeper than depth-2 (flattens into an unreapable session beyond it) | P16 | Assume git for the snapshot (non-git → file copies) |
| P3 | Size a swarm from the prompt alone — scout first, always | P17 | Skip-and-flag an ALL-OR-NOTHING unit — one failure there is a full rollback |
| P4 | Let N workers re-read the same files — shared-digest, scout pays once | P18 | Ship past a red domain gate — full rollback to the snapshot |
| P5 | Fan out a job under the min-unit floor — merge it or don't fan out | P19 | Surface a 429 to the user as a failure — transient, retried from the journal |
| P6 | Resolve a partition overlap by model judgment — it's a rule-table | P20 | State the wallet guarantee in tokens — dollars only; raw tokens run higher |
| P7 | Turn the heads-up into a question-box — non-blocking only | P21 | Drop a SENSITIVE unit (crypto/auth/payment/migration) below main-tier |
| P8 | Ask before starting in `auto`/`on` — the command is the consent (G1/G2 are the only asks) | P22 | Default error-not-allowed work to CoalFace — CoalBoard wins |
| P9 | Return line-number diffs — anchor-edits only (lines shift after apply) | P23 | Let a worker choose what the locked spec/invariants already chose |
| P10 | Use a per-worker worktree (no worktree path in v1) | P24 | Break on a platform with no fan-out — degrade to a sequential pipeline |
| P11 | Apply an order before QC | P25 | Let a project config escalate `coalfaceMode` past global's explicit value (or the `auto` default) — quieten only |
| P12 | Re-spawn on a QC reject more than once — 2nd fail escalates to the receipt | P26 | Convene on `coalfaceMode: off`, even via a manual `/coalface` |
| P13 | Let a worker self-retry — journal + at most one re-spawn, ever | P27 | Auto-submit a self error-report, or include unapproved code/paths in one |
| P14 | Restart a whole unit on worker death — remainder only, never loop | P28 | Ride the `Workflow` tool with `parallel(all-N)`, past ≥3 nulls, or via `resumeFromRunId` (waves; STOP; a continuation-run instead) |

## The flow (fixed order)

**1 · SCOUT (mandatory, P3).** Real prompts are vague ("clean up this repo") — survey the worksite FIRST. Scout sub(s) return: the SPOT LIST (each with its file/range or unit id) · the DEPENDENCY GRAPH between spots · the INVARIANTS to lock (project/user standing rules, glossary/API/style — read them as invariants) · the DOMAIN GATE to run at the end · the recommended SWARM-MODE (taxonomy below) · the SHARED-DIGEST (the config/context every worker needs — paid once by the scout, shipped in every contract, P4).

**2 · PARTITION (deterministic, P5/P6).** Interval-intersection check on the spot ranges: OVERLAPPING spots merge into one unit or chain as a dependency; a unit smaller than spawn overhead merges with a neighbor (the min-unit floor). Granularity honesty: "finer = faster" saturates — wall ≈ ceil(N/width) × unit-time; beyond N ≈ 2-4× wave width overhead dominates → pick near-optimum inside the floor and the width ceiling. Unit count sizes the swarm (100 disjoint spots → 100 orders, wave-bounded).

**3 · HEADS-UP (conditional, non-blocking, P7).** Job dwarfs the prompt → the one-liner above, then proceed.

**4 · WAVES.** Effective width = floor(platform width × `bandwidth`%) (def 25% ≈ 4 slots on a 16-slot platform). Spawn wave by wave; each worker gets the work-contract (`references/contract-template.md`) carrying its scope + the shared-digest + the locked invariants. Model: a main-EQUIVALENT model is the default on every platform; on Claude Code, CoalTipple delegate-down tiering is an OPTIONAL enhancement (degrade-safe absent; sensitive units stay main-tier, P21). **AIMD backoff:** a 429 mid-wave → the NEXT wave shrinks (multiplicative decrease); clear stretches re-grow slowly (additive) toward the set % — a % above the account's real capacity settles AT the real capacity, nothing breaks; a 429'd order is TRANSIENT → wait + retry the SAME order from the journal (P19). Bounds inherited wholesale from subagent-safety: bounded waves · no zombies (collect-then-release; reap a silent worker past timeout, P15) · near a session/quota limit collapse to fewer workers or inline-self (a worker that dies on the limit returns nothing).

**5 · RETURN = ORDERS AS TEXT (propose-not-execute, P1/P9/P10).** Edits → ANCHOR-EDITS (`old-text → new-text`, exact-match, position-independent — the same-file-100-spots case works because anchors don't shift). Non-edit domains → the completed unit as text (a translated paragraph, a record, a report section). Side-effects fire only at step 7's sequential apply — already covered by Activation's standing consent, no fresh ask here.

**6 · QC AT COLLECTION (before any apply, P11).** Per return, mechanical: **(a) SCOPE** — every anchor sits inside the assigned range, no foreign files (interval check ≈ free); **(b) SPEC** — the locked invariants grep-verifiable in the output. Reject → quarantine + one re-spawn carrying the rejection reason (P12); a 2nd fail → the receipt for the human. Honest ceiling: an in-scope, on-spec, semantically-WRONG return with no covering test reaches the user — the receipt flags test-uncovered spots; escalation for that class is CoalBoard (P22).

**7 · APPLY — you are the SINGLE WRITER.** First take the pre-swarm SNAPSHOT (git repo: stash/HEAD-record; non-git: file copies, P16). Then apply accepted orders SEQUENTIALLY in topological order. An anchor-miss (a real collision) → skip-and-flag, continue — EXCEPT units the scout marked ALL-OR-NOTHING (migration-like task-class, P17). At the end run the DOMAIN GATE (code → build+test · corpus → corpus rules · docs → lint+links · data → schema-validate · research → citations). Gate red → full rollback to the snapshot (P18); report what happened via the receipt.

**8 · RECEIPT (always).** Spots found · workers used · waves · effective width (e.g. "6/14 — settled at account tier") · tokens vs the solo-baseline estimate · quarantined items + why · test-uncovered flags. Format + layman wording: `references/receipt.md`. The receipt + heads-up speak the USER'S language; technical terms stay verbatim.

## Swarmability taxonomy (the scout classifies; no worksite "breaks")
| Worksite shape | Mode |
|---|---|
| Disjoint spots (flat) | Full parallel waves — worker count = unit count (floor/width-bounded) |
| Dependency chain | Topologically-ordered waves / same-worker chaining; a FULL chain = pipeline degrade (isolation kept; honesty: no speedup) |
| Global invariant (glossary/style/totals) | LOCK invariants first → ship them in the shared-digest → consistency-sweep gate at the end |
| Holistic quality (voice/architecture) | ANALYZE-swarm only; ONE voice writes (you) |
| Side-effects | Closed by propose-not-execute — workers return text; side-effects fire only at step 7's apply |
| Non-decomposable | Honest refusal: "not swarmable — solo/3-sub" |

Per-domain unit/invariant/gate tables + mode detail: `references/taxonomy.md`.

## Wallet (the solo-baseline DOLLAR invariant, P20)
The WHOLE swarm (scout + workers + apply) fits inside the estimated main-SOLO **dollar** cost — NOT its token count. Raw tokens run *higher* than solo: fan-out multiplies the fixed ~per-sub baseline by N (the benchmark showed ~5.3× solo tokens on a small 6-spot job — CF arm: 3 workers measured, extrapolated to 6). What holds the *dollar* line is Claude Code's cheap worker tiers (~5× less per token) — so N cheap workers can undercut one expensive solo main (benchmark: −15% in $). Guards keep that overhead *bounded* (not ≤ solo tokens): (1) the SHARED-DIGEST (the scout pays once, distributes); (2) the MIN-UNIT floor (P5 — a job too small to clear it says *don't fan out*, since the scout is then net overhead); (3) P13 (no retry storms). `bandwidth` is ORTHOGONAL: it sets how FAST the same budget burns, never how much.

## Journal (per-worker-return)
Journal each worker's assigned scope at spawn and its returned order on landing — a returned order is safe the moment it lands. A dead/stopped/silent worker → re-spawn one fresh worker on the un-done REMAINDER from the journal (P14). The journal also feeds the receipt and any partial report.

## Composition (rules that bind first, bind here)
- **CoalBoard WINS on error-not-allowed** (security/crypto, DB/financial migrations, high-precision, P22): critical work goes to consensus, not throughput; CoalFace may serve as the board's apply-hand after.
- **CoalTipple** (if installed): per-worker delegate-down tiering = an optional enhancement; its SENSITIVE gate is inherited (P21).
- **subagent-safety inherited wholesale** (bounded fan-out · no-zombies · leaves-no-spawn-tool — detailed in WAVES, step 4): budget-gate · a failed worker RETURNS and you re-route.
- **User/project standing rules** (e.g. translation rules) = invariants: the scout reads them into the shared-digest (P23).
- **Engine:** a platform Workflow/orchestration engine present → ride it; else native subagent waves. Riding Claude Code's `Workflow` tool → **read `references/workflow-engine.md` first** (P28: waves not `parallel(all-N)` · scattered nulls = one retry pass, a run of ≥3 = quota death → STOP + return the remainder · continuation-run over `resumeFromRunId`).

## Nested conductor (depth note, P2)
A depth-1 sub may itself conduct (scout → contract → QC → apply for its scope), spawning its workers at depth-2. Beyond depth-2 a spawn FLATTENS into an independent, unreapable top-level session — workers are structural leaves, nothing at depth-2 has a reason to spawn. The wallet slices DOWN the chain (you allocate the sub a slice; it splits that across its workers); receipts flow UP.

## Platforms (cross-agent, P24)
Spawn via the platform's NATIVE subagent tool (Claude Code `Agent`/`Task` · each platform its own). Any platform with concurrent subagents runs the full contract; width sizes to the local cap via `bandwidth`; an unknown platform gets the conservative default. NO fan-out at all → degrade to a sequential pipeline under the same contract (scout → units in order → QC → apply). On a platform/version you have not actually run a swarm on, treat width/nesting behavior as UNVERIFIED — degrade conservatively and say so.

## Config + self-update (P25/P26)
Merged config: global `~/.claude/.coalface.json` overlaid by the nearest project config (project wins per key — except `coalfaceMode`: if you ever derive it yourself from these files instead of trusting a hook directive, the project may only QUIETEN it, never escalate past global's explicit value or the `auto` default if global is silent). Project config lives under an agent dir — check **your own agent's dir first** (`.claude/coal/coalface.json` if you're Claude Code, `.agents/coal/coalface.json` if you're Antigravity — not the CC default if you're on a different platform), then `.claude` → `.agents` → `.gemini` in that order, then the legacy root `.coalface.json` — first found wins, the rest are not consulted; the lookup walk stops at the home dir. Keys: `coalfaceMode` · `bandwidth` · `autoFanoutFloor` · `updateMode` (`off`/`remind`/`ask`/`auto`, def `ask`) · `updateCheckDays` (def `14`) — every numeric clamped on read. Self-update is kind-1: the hook only schedules a throttled check; `/coalface:update` verifies online + offers the update (G2) — `updateMode` never gates the command itself.

## Self error-report (G1/P27)
If CoalFace misbehaves - a contradictory instruction, a swarm that loops, a worker that breaks the contract - STOP, summarize it, and OFFER to file it at `github.com/TheColliery/CoalFace/issues`. This fires only for what the model NOTICES - a clean run means "nothing noticed", not "nothing wrong".
