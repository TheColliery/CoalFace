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

> **Honest frame:** ad-hoc fan-out makes the same promises with NO guarantee (unbounded cost, under-fanned speed, quality that can dip below solo); CoalFace enforces them by STRUCTURE instead — bounded ($, Wallet below) · full width (floor/width-bounded) · netted (QC + single-writer + snapshot). It disciplines the fan-out; it does not make models smarter or guarantee correctness.

You are the **CONDUCTOR** (the session main). Workers are **LEAVES** (P1) — spawn them via a spawn-tool-less agent type where the platform offers one (Claude Code: `Explore`-class); they read + produce + RETURN.

## Activation
`coalfaceMode` (def `auto`): **auto** — you judge when a prompt warrants fan-out; ANY fan-out of ≥ `autoFanoutFloor` units (def 4) rides this contract instead of ad-hoc spawning (1-2-sub ad-hoc stays zero-ceremony). **on** — scout EVERY prompt; everything decomposable fans out; only non-decomposable work runs solo. **off** — CoalFace fully out; native fan-out untouched. Manual `/coalface` convenes it in any mode except off.

**Consent — 2, numbered G1–G2. Everything else in this contract (scout, partition, waves, apply, rollback, receipt) runs on the ONE standing consent below — never a fresh ask.**
| # | Ask before proceeding |
|---|---|
| G1 | Filing a self error-report at an issue tracker (see Self error-report) — offered, never automatic |
| G2 | Applying a self-update via `/coalface:update` — checked + offered before it's applied |

Standing consent (P8): the command IS the consent. ONE valve: job MUCH bigger than the prompt implies → a one-line NON-BLOCKING heads-up ("found N spots, ~est X — starting; Esc to stop") — never a question-box, never a third gate.

## Grants & denials (CLASSIFY-BLOCK — declared)
A denial reaches the WORKER as a visible message and propagates NO further — not to the
dispatcher, not as a catchable condition. Every row below states a branch or an explicit
death; a step that dies says so in the output. Never report a denied step as done, skipped,
or clean.

| class | step it powers | grant | on denial |
|---|---|---|---|
| read | SCOUT (step 1) surveys the worksite + reads invariants/config | `Read`·`Grep`·`Glob` | Refuse before scouting — never a partial survey reported as complete; the heads-up/receipt say the scan could not run |
| write | Step 7 single-writer APPLY (O4, the real tree) | `Write`·`Edit` (always — P16's non-git file-copy SNAPSHOT needs only these); `Bash` preferred for a git-repo SNAPSHOT (O5/P16: `git stash`/HEAD-record) and for a DOMAIN GATE that itself needs a shell (code → build+test; corpus/docs/data/research gates vary) | `Write`/`Edit` denied → report + courier the accepted orders to the dispatcher, never claim applied. `Bash` denied → the SNAPSHOT still lands via P16's file-copy fallback; apply proceeds only behind that snapshot (P16/P18). A gate that itself needs `Bash` cannot run — say so in the receipt (O1), never report an unrun gate as passed |
| spawn | WAVES (step 4) — worker fan-out | `Agent`·`Task` (or `Bash` for `claude -p`, its own grant) | Degrade to the sequential pipeline (F9/P24) AND SAY SO — the receipt's effective-width field states the fan-out did not happen and why, spawn denied vs. no fan-out tool on the platform (`references/receipt.md`); never reported as a swarm that ran |

## Prohibitions — 29, numbered P1–P29
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
| P29 | Deny or silently drop a worker above the machine admission cap — queue it, never refuse | | |

## Output locations — 7, numbered O1–O7
| # | Where |
|---|---|
| O1 | The RECEIPT (step 8, always) |
| O2 | The HEADS-UP one-liner (step 3, conditional) |
| O3 | GitHub issue tracker — self error-report (G1) |
| O4 | The real tree — step 7's single-writer apply target |
| O5 | The pre-swarm SNAPSHOT (git stash/HEAD-record, or file copies) |
| O6 | The JOURNAL (per-worker scope + returned order) |
| O7 | QUARANTINE (a QC-rejected return, pending its one re-spawn) |

## Fail paths — 15, numbered F1–F15
| # | If | Then |
|---|---|---|
| F1 | QC reject (scope/spec) | Quarantine + one re-spawn (P12); 2nd fail → the receipt |
| F2 | Anchor-miss (real collision) at apply | Skip-and-flag, continue — except F3 |
| F3 | ALL-OR-NOTHING unit fails | Full rollback (P17) |
| F4 | Domain gate red | Full rollback to the snapshot (P18) |
| F5 | Worker dies/stops/silent past timeout | Re-spawn ONE on the remainder, never restart the whole unit (P14/P15) |
| F6 | 429 mid-wave | Next wave shrinks; the SAME order retries from the journal, never surfaced as a failure (P19) |
| F7 | Near a session/quota limit | Collapse to fewer workers or inline-self |
| F8 | Worker dies on the session/quota limit | Returns nothing |
| F9 | Platform has no fan-out at all | Degrade to a sequential pipeline (P24) |
| F10 | Platform/version never actually run | Treat as UNVERIFIED, degrade conservatively, say so |
| F11 | In-scope/on-spec/semantically-wrong return, no covering test | Reaches the user; the receipt flags test-uncovered; escalation is CoalBoard (P22) |
| F12 | Riding the `Workflow` tool, ≥3 scattered nulls | STOP; a continuation-run, never `resumeFromRunId` (P28) |
| F13 | Worksite is non-decomposable | Honest refusal: "not swarmable — solo/3-sub" |
| F14 | Job is under the min-unit floor | Merge with a neighbor, or refuse to fan out — don't spawn (P5) |
| F15 | `coalfaceMode: off` | Refuse to convene, even via a manual `/coalface` (P26) |

## The flow (fixed order)

**1 · SCOUT (mandatory, P3).** Real prompts are vague ("clean up this repo") — survey the worksite FIRST. Scout sub(s) return: the SPOT LIST (each with its file/range or unit id) · the DEPENDENCY GRAPH between spots · the INVARIANTS to lock (project/user standing rules, glossary/API/style — read them as invariants) · the DOMAIN GATE to run at the end · the recommended SWARM-MODE (taxonomy below) · the SHARED-DIGEST (the config/context every worker needs — paid once by the scout, shipped in every contract, P4).

**2 · PARTITION (deterministic, P5/P6).** Interval-intersection check on the spot ranges: OVERLAPPING spots merge into one unit or chain as a dependency; a unit smaller than spawn overhead merges with a neighbor (the min-unit floor). Granularity honesty: "finer = faster" saturates — wall ≈ ceil(N/width) × unit-time; beyond N ≈ 2-4× wave width overhead dominates → pick near-optimum inside the floor and the width ceiling. Unit count sizes the swarm (100 disjoint spots → 100 orders, wave-bounded).

**3 · HEADS-UP (conditional, non-blocking, P7).** Job dwarfs the prompt → the one-liner above, then proceed.

**4 · WAVES.** Effective width = floor(platform width × `bandwidth`%) (def 25% ≈ 4 slots on a 16-slot platform), then floored again by the MACHINE bound: `min(that, maxLocalWorkers)` — a cap on workers holding a local CPU-bound gate slot (build/test), auto-derived from this machine's cores when `maxLocalWorkers` is 0 (`references/admission-control.md`, P29); excess queues, none denied. Spawn wave by wave; each worker gets the work-contract (`references/contract-template.md`) carrying its scope + the shared-digest + the locked invariants. Model: a main-EQUIVALENT model is the default on every platform; on Claude Code, CoalTipple delegate-down tiering is an OPTIONAL enhancement (degrade-safe absent; sensitive units stay main-tier, P21). 429/quota/zombie handling per F5/F6/F7/F8, P14/P15/P19. **AIMD:** a 429 SHRINKS the next wave (multiplicative); clear waves re-GROW it additively back toward the set `bandwidth`% — a % above real capacity just settles at real capacity, nothing breaks.

**5 · RETURN = ORDERS AS TEXT (propose-not-execute, P1/P9/P10).** Edits → ANCHOR-EDITS (`old-text → new-text`, exact-match, position-independent — the same-file-100-spots case works because anchors don't shift). Non-edit domains → the completed unit as text (a translated paragraph, a record, a report section). Side-effects fire only at step 7's sequential apply — already covered by Activation's standing consent, no fresh ask here.

**6 · QC AT COLLECTION (before any apply, P11).** Per return, mechanical: **(a) SCOPE** — every anchor sits inside the assigned range, no foreign files (interval check ≈ free); **(b) SPEC** — the locked invariants grep-verifiable in the output. Reject → quarantine + one re-spawn carrying the rejection reason (P12); a 2nd fail → the receipt for the human. An in-scope/on-spec/semantically-wrong return with no covering test reaches the user (F11/P22).

**7 · APPLY — you are the SINGLE WRITER.** SNAPSHOT (P16) → apply accepted orders SEQUENTIALLY, topological order (anchor-miss: F2; ALL-OR-NOTHING units: F3/P17) → DOMAIN GATE (code → build+test · corpus → corpus rules · docs → lint+links · data → schema-validate · research → citations; red: F4/P18) → report via the receipt.

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
The WHOLE swarm (scout + workers + apply) fits inside the estimated main-SOLO **dollar** cost — NOT its token count (P20). Raw tokens run *higher* than solo (fan-out multiplies the per-sub baseline by N); cheap worker tiers hold the *dollar* line. Guards keep the overhead *bounded* (not ≤ solo tokens): (1) the SHARED-DIGEST (the scout pays once, distributes); (2) the MIN-UNIT floor (P5 — a job too small to clear it says *don't fan out*); (3) P13 (no retry storms). `bandwidth` is ORTHOGONAL: how FAST the same budget burns, never how much.

## Journal (per-worker-return)
Journal each worker's assigned scope at spawn and its returned order on landing — a returned order is safe the moment it lands. A dead/stopped/silent worker → re-spawn one fresh worker on the un-done REMAINDER from the journal (P14). The journal also feeds the receipt and any partial report.

## Composition (rules that bind first, bind here)
- **CoalBoard WINS on error-not-allowed** (security/crypto, DB/financial migrations, high-precision, P22): critical work goes to consensus, not throughput; CoalFace may serve as the board's apply-hand after.
- **CoalTipple** (if installed): per-worker delegate-down tiering = an optional enhancement; its SENSITIVE gate is inherited (P21).
- **subagent-safety inherited wholesale** (bounded fan-out · no-zombies · leaves-no-spawn-tool — F5/F7/F8, P14/P15): budget-gate · a failed worker RETURNS and you re-route.
- **User/project standing rules** (e.g. translation rules) = invariants: the scout reads them into the shared-digest (P23).
- **Engine:** a platform Workflow/orchestration engine present → ride it; else native subagent waves. Riding Claude Code's `Workflow` tool → **read `references/workflow-engine.md` first** (P28: waves not `parallel(all-N)` · scattered nulls = one retry pass, a run of ≥3 = quota death → STOP + return the remainder · continuation-run over `resumeFromRunId`).

## Nested conductor (depth note, P2)
A depth-1 sub may itself conduct (scout → contract → QC → apply for its scope), spawning its workers at depth-2. Beyond depth-2 a spawn FLATTENS into an independent, unreapable top-level session — workers are structural leaves, nothing at depth-2 has a reason to spawn. The wallet slices DOWN the chain (you allocate the sub a slice; it splits that across its workers); receipts flow UP.

## Platforms (cross-agent, P24)
Spawn via the platform's NATIVE subagent tool (Claude Code `Agent`/`Task` · each platform its own). Any platform with concurrent subagents runs the full contract; width sizes to the local cap via `bandwidth`; an unknown platform gets the conservative default. NO fan-out at all → degrade to a sequential pipeline under the same contract (scout → units in order → QC → apply). On a platform/version you have not actually run a swarm on, treat width/nesting behavior as UNVERIFIED — degrade conservatively and say so.

## Config + self-update (P25/P26)
Merged config: global `~/.claude/.coalface.json` overlaid by the nearest project config (project wins per key — except `coalfaceMode`: if you ever derive it yourself from these files instead of trusting a hook directive, the project may only QUIETEN it, never escalate past global's explicit value or the `auto` default if global is silent). Project config lives under an agent dir, checked as ONE ordered list — first found wins, the rest are not consulted, the lookup walk stops at the home dir: **(1)** your own agent's dir (`.claude/coal/coalface.json` on Claude Code, `.agents/coal/coalface.json` on Antigravity); **(2)** the other known dirs in fixed order `.claude` → `.agents` → `.gemini`, skipping whichever one step 1 already checked; **(3)** the legacy root `.coalface.json`. Keys: `coalfaceMode` · `bandwidth` · `autoFanoutFloor` · `maxLocalWorkers` (def `0` = auto-derive from cores, P29) · `updateMode` (`off`/`remind`/`ask`/`auto`, def `ask`) · `updateCheckDays` (def `14`) — every numeric clamped on read. Self-update is kind-1: the hook only schedules a throttled check; `/coalface:update` verifies online + offers the update (G2) — `updateMode` never gates the command itself.

## Self error-report (G1/P27)
If CoalFace misbehaves - a contradictory instruction, a swarm that loops, a worker that breaks the contract - STOP, summarize it, and OFFER to file it at `github.com/TheColliery/CoalFace/issues`. This fires only for what the model NOTICES - a clean run means "nothing noticed", not "nothing wrong".
