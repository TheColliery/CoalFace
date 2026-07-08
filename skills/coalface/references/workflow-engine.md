# Riding the Workflow engine (Claude Code) — the CF discipline inside a script

> Loaded on-demand when a fan-out runs through Claude Code's `Workflow` tool instead of Agent-tool waves. The Workflow engine is a SEPARATE system from Agent-tool spawning: its own internal journal (`journal.jsonl` in the run's transcript dir), its own resume (`resumeFromRunId`), no automatic retry — and the outer session (CoalHearth included) sees the whole run as ONE tool call. Field evidence 2026-07-08: a 52-agent run lost 8 workers (2 transient API errors + 6 on a session limit) with no automated recovery layer.

## Script rules (the CF contract expressed as script structure)

1. **Never `parallel(all-N)` raw.** The engine caps concurrency (~16) but a session-limit death is not a 429 — the cap does not protect the wallet. Structure large runs as WAVES (slice the item list, `await` between slices) sized to `bandwidth` discipline; slow-start.
2. **Split the two failure classes in-script** — `agent()` returns `null` for a dead worker either way; the SHAPE tells them apart:
   - **Scattered nulls** (1-2, isolated) = transient (server error / stalled stream) → ONE in-script retry pass over just the nulls: `const retry = items.filter((_, i) => !results[i])`.
   - **A null RUN (≥3 consecutive)** = quota/session-limit death → **STOP immediately**: `return { done, failedItems }`. Every further call dies until the limit resets — retrying re-burns input for nothing (the re-ram lesson).
3. **Always return a continuation-ready receipt**: `{ done: [...], failedItems: [...] }` + `log()` the failed list. The failed list is the NEXT run's `args`.
4. **Continuation = a fresh small run, not `resumeFromRunId`.** After the limit resets, run the SAME script with `args = failedItems` (script reads `args` as its item list). This re-pays nothing for completed items and retries only the remainder.

## `resumeFromRunId` hazard

Docs cache "completed agent() calls with unchanged (prompt, opts)" and warn "do not assume cached results are non-empty" — a dead worker's `null` is likely journaled AS its result, so a resume **replays the failure instead of retrying it**. Before trusting a resume for failure-recovery: open the run's `journal.jsonl` — if the dead calls have entries, the resume will replay them; hand-author the continuation run instead (rule 4). Treat `resumeFromRunId` as a tool for *edited-script iteration*, not failure recovery, until the platform documents otherwise.

## The outer-session seam (CoalHearth)

CoalHearth journals the Workflow RUN's existence + its transcript-dir residue path (v1.2.0) — after an interruption, the resume block points at the run; the run's own `journal.jsonl` carries the per-agent truth. Two layers, two journals: CoalHearth = the run existed; `journal.jsonl` = what each agent returned.
