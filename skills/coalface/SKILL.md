---
name: coalface
description: >-
  Fan-out discipline for swarm work. When a task decomposes into many units (a bulk
  refactor, a repo-wide sweep, a corpus batch), CoalFace runs it as a disciplined factory:
  mandatory SCOUT surveys the worksite, deterministic PARTITION merges overlapping/tiny
  spots, workers return anchor-edit orders as TEXT (propose-not-execute), QC checks
  scope+spec at collection, main = SINGLE WRITER (pre-swarm snapshot + domain gate), RECEIPT
  shows tokens-vs-solo. Wallet: ~solo DOLLAR cost only on cheaper worker tiers (raw tokens run
  HIGHER — fan-out ×N the per-sub baseline), not raw tokens. Modes: coalfaceMode auto
  (default, rides the contract at/above autoFanoutFloor units) | on (scout every prompt) |
  off. Manual "/coalface" or "swarm this" convenes it in any mode except off. Cross-agent
  (native subagent tool; no fan-out → sequential-pipeline degrade). Disciplines fan-outs
  that would happen anyway — does not make models smarter or guarantee correctness.
  Zero-dependency, offline by default, no API keys.
metadata:
  author: HetCreep <info@thecolliery.org>
---

# CoalFace

You are the **CONDUCTOR** (the session main). Workers are **LEAVES** (P1): spawn them via a spawn-tool-less agent type where the platform offers one (Claude Code: `Explore`-class). They read, produce, and RETURN.

## Activation
`coalfaceMode` (def `auto`): **auto**: judge when fan-out is warranted; ANY fan-out of ≥ `autoFanoutFloor` units (def 4) rides this contract. **on**: scout EVERY prompt; decomposable work fans out, the rest runs solo. **off**: CoalFace fully out. Manual `/coalface` convenes it in any mode except off.

**Consent: 2, numbered G1–G2. Everything else (scout through receipt) runs on the ONE standing consent below, never a fresh ask.**

| # | Ask before proceeding |
|---|---|
| G1 | Filing a self error-report (see Self error-report): offered, never automatic |
| G2 | `/coalface:update` checks and offers; the user runs `claude plugin update` to apply it |

Standing consent (P8): the command IS the consent. ONE valve: a job MUCH bigger than the prompt implies gets a one-line NON-BLOCKING heads-up (O2: `found N spots, ~est X — starting; Esc to stop`). Never a question-box, never a third gate.

## Grants & denials (CLASSIFY-BLOCK)
A denial reaches the WORKER as a visible message and propagates NO further. Never report a denied step as done, skipped, or clean.

| class | step | grant | on denial |
|---|---|---|---|
| read | SCOUT (1), config and invariant reads | `Read`·`Grep`·`Glob` | Refuse before scouting; never a partial survey reported as complete |
| write | APPLY (7), SNAPSHOT (O5), DOMAIN GATE | `Write`·`Edit` always (P16's file-copy snapshot needs only these); `Bash` for a git snapshot and for a shell gate | `Write`/`Edit` denied: courier accepted orders to the dispatcher; never claim applied. `Bash` denied: P16 file-copy snapshot, apply only behind it. A gate needing `Bash` cannot run: say so in O1, never report it passed |
| spawn | WAVES (4) | `Agent`·`Task` (or `Bash` for `claude -p`) | Degrade to sequential (F9/P24) and SAY SO in the receipt's effective-width field |

## Prohibitions: 29, P1–P29
| # | Never | # | Never |
|---|---|---|---|
| P1 | Workers write the real tree or spawn; leaves return text | P16 | Assume git for the snapshot (non-git → file copies) |
| P2 | Spawn deeper than depth-2 | P17 | Skip-and-flag an ALL-OR-NOTHING unit (a failure is a full rollback) |
| P3 | Size a swarm from the prompt alone; scout first | P18 | Ship past a red domain gate (full rollback) |
| P4 | Let N workers re-read the same files (shared-digest; scout pays once) | P19 | Surface a 429 as a failure (transient; retried from the journal) |
| P5 | Fan out under the min-unit floor; merge it or don't fan out | P20 | State a wallet claim in tokens (dollars, cheaper tiers only) |
| P6 | Resolve a partition overlap by model judgment (rule-table) | P21 | Drop a SENSITIVE unit (crypto/auth/payment/migration) below main-tier |
| P7 | Turn the heads-up into a question-box | P22 | Default error-not-allowed work to CoalFace (CoalBoard wins) |
| P8 | Ask before starting in `auto`/`on` (G1/G2 are the only asks) | P23 | Let a worker choose what the locked spec/invariants already chose |
| P9 | Return line-number diffs (anchor-edits only) | P24 | Break on a platform with no fan-out (degrade to sequential) |
| P10 | Use a per-worker worktree (none in v1) | P25 | Let a project config escalate `coalfaceMode` past global or the `auto` default: quieten only |
| P11 | Apply an order before QC | P26 | Convene on `coalfaceMode: off`, even via manual `/coalface` |
| P12 | Re-spawn on a QC reject more than once | P27 | Auto-submit a self error-report, or include unapproved code/paths in one |
| P13 | Let a worker self-retry (journal + at most one re-spawn) | P28 | Ride `Workflow` with `parallel(all-N)`, past ≥3 nulls, or via `resumeFromRunId` (waves; STOP; continuation-run instead) |
| P14 | Restart a whole unit on worker death (remainder only) | P29 | Drop a worker while the machine reading says WAIT (queue it) |
| P15 | Reap a worker mid permission-wait (that is not silence) | | |

Example: `references/example.md`.

## Output locations: O1–O7
O1 RECEIPT (8, always) · O2 HEADS-UP (3, conditional) · O3 self error-report issue (G1) · O4 the real tree, the APPLY target (7) · O5 pre-swarm SNAPSHOT (git, or file copies) · O6 JOURNAL (per-worker scope + returned order) · O7 QUARANTINE (QC-rejected return, awaiting its one re-spawn)

## Fail paths: F1–F15
| # | If | Then |
|---|---|---|
| F1 | QC reject (scope/spec) | Quarantine + one re-spawn (P12); 2nd fail → receipt |
| F2 | Anchor-miss at apply | Skip-and-flag, continue, except F3 |
| F3 | ALL-OR-NOTHING unit fails | Full rollback (P17) |
| F4 | Domain gate red | Full rollback to the snapshot (P18) |
| F5 | Worker dies/stops/silent past timeout | Re-spawn ONE on the remainder, never the whole unit (P14/P15) |
| F6 | 429 mid-wave | Next wave shrinks; same order retries from the journal; never a failure (P19) |
| F7 | Near a session/quota limit | Fewer workers or inline-self |
| F8 | Worker dies on the session/quota limit | Returns nothing |
| F9 | Platform has no fan-out | Sequential pipeline (P24) |
| F10 | Platform/version never run | UNVERIFIED: degrade conservatively, say so |
| F11 | In-scope, on-spec, semantically wrong, no covering test | Reaches the user; receipt flags test-uncovered; CoalBoard (P22) |
| F12 | `Workflow` tool, ≥3 scattered nulls | STOP; continuation-run, never `resumeFromRunId` (P28) |
| F13 | Worksite is non-decomposable | Honest refusal: "not swarmable — solo/3-sub" |
| F14 | Job is under the min-unit floor | Merge with a neighbor, or refuse to fan out (P5) |
| F15 | `coalfaceMode: off` | Refuse to convene, even manually (P26) |

## The flow (fixed order)

**1 · SCOUT (mandatory, P3).** Scout returns: the SPOT LIST (file/range or unit id) · the DEPENDENCY GRAPH · the INVARIANTS to lock · the DOMAIN GATE · the recommended SWARM-MODE · the SHARED-DIGEST (paid once, shipped in every contract, P4).

**2 · PARTITION (deterministic, P5/P6).** Interval-intersection on spot ranges: overlapping spots merge into one unit or chain by dependency. A unit below the min-unit floor merges with a neighbor. Only the floor merges independent spots; wave width bounds each wave, never the unit count (`references/taxonomy.md`).

**3 · HEADS-UP (conditional, non-blocking, P7).** The job dwarfs the prompt: send the O2 one-liner, then proceed.

**4 · WAVES.** Width = max(1, floor(platform width × `bandwidth`%)), capped at the platform width; `maxLocalWorkers` never enters it. Before each apply-time domain gate (main's, or a depth-1 conductor's, never a worker's) and each wave of heavy local work, run `node "<skill dir>/scripts/admission.mjs" [--running <n>]`. Pass no thresholds; it reads them. BREATHE starts; WAIT prints `held: <reasons>` and holds; re-read. `--running <n>` = units you hold; with 0 the first always runs. `maxLocalWorkers` 0 = the reading decides; positive = the user's ceiling. No `node`, exit 2, or an axis the machine cannot read = unmeasured; with every axis unmeasured only `--running 0` runs. Exit 64 = fix the call. Either way one unit at a time, never block. The engine applies the stricter of global and project values (`references/admission-control.md`, P29). Spawn wave by wave; each worker gets its contract (`references/contract-template.md`): scope, shared-digest, invariants. Model: main-EQUIVALENT by default; CoalTipple delegate-down optional; SENSITIVE units stay main-tier (P21). 429/quota/zombie handling per F5–F8, P14/P15/P19. **AIMD:** a 429 shrinks the next wave multiplicatively; clear waves re-grow it additively toward `bandwidth`%.

**5 · RETURN = ORDERS AS TEXT (propose-not-execute, P1/P9/P10).** Edits → ANCHOR-EDITS (`old-text → new-text`, exact-match, position-independent). Non-edit domains → the completed unit as text. Side-effects fire only at step 7.

**6 · QC AT COLLECTION (before any apply, P11).** Per return: **(a) SCOPE**: every anchor sits inside the assigned range, no foreign files; **(b) SPEC**: the locked invariants are grep-verifiable in the output. Reject → quarantine + one re-spawn carrying the reason (P12); a 2nd fail → the receipt.

**7 · APPLY: you are the SINGLE WRITER.** SNAPSHOT (P16) → apply accepted orders SEQUENTIALLY, topological order (anchor-miss F2; ALL-OR-NOTHING F3/P17) → DOMAIN GATE (code → build+test · corpus → corpus rules · docs → lint+links · data → schema-validate · research → citations; red → F4/P18) → receipt.

**8 · RECEIPT (always).** Spots · workers · waves · effective width · machine holds · tokens vs solo estimate · quarantined items + why · test-uncovered flags. Format: `references/receipt.md`. Receipt and heads-up in the USER'S language; technical terms verbatim.

## Swarmability taxonomy (the scout classifies; no worksite "breaks")
| Worksite shape | Mode |
|---|---|
| Disjoint spots (flat) | Full parallel waves; worker count = unit count (floor/width-bounded) |
| Dependency chain | Topological waves or same-worker chaining; a FULL chain = pipeline degrade (no speedup) |
| Global invariant (glossary/style/totals) | LOCK invariants first → shared-digest → consistency-sweep gate |
| Holistic quality (voice/architecture) | ANALYZE-swarm only; ONE voice writes (you) |
| Side-effects | Closed by propose-not-execute; side-effects fire only at step 7 |
| Non-decomposable | Honest refusal: "not swarmable — solo/3-sub" |

Per-domain unit and gate tables, mixed worksites, granularity: `references/taxonomy.md`.

## Wallet (the solo-baseline DOLLAR invariant, P20)
The swarm fits the estimated main-SOLO **dollar** cost only with workers cheaper than main (CoalTipple delegate-down or a cheaper user-set model); main-equivalent workers can exceed it, and no budget stop exists. Never a token claim. Guards: (1) SHARED-DIGEST (scout pays once); (2) MIN-UNIT floor (P5); (3) P13. `bandwidth` is orthogonal: it sets how fast the same budget burns, never how much.

## Journal
Journal each worker's scope at spawn and its returned order on landing. A dead or silent worker → one fresh worker on the REMAINDER from the journal (P14).

## Composition
- **CoalBoard WINS on error-not-allowed** (P22).
- **CoalTipple** (if installed): delegate-down optional; SENSITIVE gate inherited (P21).
- **subagent-safety inherited** (F5/F7/F8, P14/P15): a failed worker RETURNS; you re-route.
- **Standing rules** (user or project) are invariants: the scout reads them into the shared-digest (P23).
- **Engine:** a Workflow engine present → ride it, reading `references/workflow-engine.md` first (P28).

## Nested conductor and platforms (P2/P24)
A depth-1 sub may conduct its scope (scout → contract → QC → apply) and spawn depth-2 workers. Spawn via the platform's NATIVE subagent tool; width sizes via `bandwidth`. NO fan-out → sequential pipeline under the same contract. Unverified platform or version: width and nesting UNVERIFIED; degrade conservatively; say so.

## Config + self-update (P25/P26)
Merged config: global `~/.claude/.coalface.json` overlaid by the nearest project config (project wins per key), except `coalfaceMode` (a project may only QUIETEN it: never past global's explicit value, or the `auto` default if global is silent) and the admission keys (the stricter value wins, step 4). Project config: per directory level, first found wins; the walk stops at home: **(1)** your agent's dir (`.claude/coal/coalface.json` on Claude Code, `.agents/coal/coalface.json` on Antigravity); **(2)** `coal/coalface.json` in the other dirs, `.claude` → `.agents` → `.gemini`; **(3)** DEPRECATED `.<agent>/.coalface.json`, same order; **(4)** DEPRECATED root `.coalface.json`. Keys: `coalfaceMode` · `bandwidth` · `autoFanoutFloor` · `maxLocalWorkers` (def `0` = the reading decides) · `admitCpuBusyMaxPct` · `admitMemFreeMinPct` (step 4) · `updateMode` (`off`/`remind`/`ask`/`auto`, def `ask`) · `updateCheckDays` (def `14`) · `language`. The hook clamps `autoFanoutFloor` and `updateCheckDays` on read. Updates: the hook only schedules a throttled check; `/coalface:update` checks online and offers the update, which the user runs (G2); `updateMode` never gates the command itself.

## Self error-report (G1/P27)
If CoalFace misbehaves (a contradictory instruction, a swarm that loops, a worker that breaks the contract): STOP, summarize, OFFER to file at `github.com/TheColliery/CoalFace/issues`.
