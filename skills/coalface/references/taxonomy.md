# CoalFace swarmability taxonomy — per-domain detail

The scout classifies the worksite BEFORE any spawn; dangerous shapes route to their safe
mode at scout time — no worksite "breaks". This file carries the detail behind the
SKILL.md table: what a UNIT is per domain, which INVARIANTS get locked, and which GATE
closes the apply.

## Per-domain units, invariants, gates

| Domain | Unit | Typical locked invariants | Domain gate (end of apply) |
|---|---|---|---|
| Code | a spot (file + range), a function, a module | API/signature consistency · naming/style · error-handling pattern · no new deps | build + test suite (impacted first, full at end) |
| Prose / corpus (translation, copy) | a paragraph / scene / chapter section | glossary (fixed term = fixed rendering) · register/voice · formatting rules (quotes, dividers, dashes) | corpus rules pass (glossary sweep, formatting scan, encoding check) |
| Docs | a section / page / heading unit | heading hierarchy · term consistency · claims match the code/source | lint + link-check + heading-order scan |
| Data / records | a record / row / config block | schema · id uniqueness · cross-record totals | schema-validate (+ totals recompute) |
| Research / citations | a claim / source / section | every claim sourced · citation format · currency (dates) | citation completeness + source-reachability pass |

Rule of thumb: the unit is the smallest thing a worker can complete WITHOUT seeing another
worker's output; the invariant is anything two workers could each decide differently; the
gate is the cheapest mechanical check that catches a wrong apply.

## The five modes (scout output: one of these + the spot list)

1. **Flat / disjoint spots → full parallel waves.** The headline case: worker count = unit
   count (floor/width-bounded). This is where CoalFace visibly beats ad-hoc — an ad-hoc
   orchestrator under-fans (batches 100 spots into 5-8 bloating workers whose tail quality
   drops); the contract forces count = spot count. Precondition enforced mechanically at
   partition: the interval-intersection check merges/chains any overlap.
2. **Dependency chain → topologically-ordered waves.** Spots that feed each other run in
   dependency order: independent spots share a wave; dependents wait for their inputs
   (shipped INTO the later contract as text — workers stay blind to each other otherwise).
   Short chains inside a mostly-flat site = same-worker chaining (one worker takes the
   chain as one unit). A FULL chain (everything depends on the previous) = pipeline
   degrade: same contract, sequential units — isolation and QC kept; honesty: no speedup.
3. **Global invariant (glossary / style / totals) → lock first, sweep last.** The conductor
   LOCKS the invariant BEFORE spawning (reads the user's standing rules, the glossary, the
   style guide — or derives the lock from the worksite and states it) → ships it in every
   contract's shared-digest → runs a consistency SWEEP as the domain gate (grep the
   glossary/terms/totals across the applied result). Workers never each pick a rendering.
4. **Holistic quality (voice / architecture) → analyze-swarm only.** Judgment that must be
   ONE mind's (prose voice, an architectural shape) does not split: the swarm ANALYZES
   (each worker returns findings/options for its scope as text); the conductor — one voice
   — writes. Mirrors CoalTipple's preserveVoice: the deliverable never delegates down.
5. **Non-decomposable → honest refusal.** No unit boundary exists (a single hard proof, a
   tightly-coupled rewrite) → say "not swarmable — solo/3-sub" and do it solo. The
   spawn-overhead floor also lands here: a job of 1-3 small units is BELOW autoFanoutFloor
   — ad-hoc/solo handles it with zero ceremony.

**Side-effects (any domain):** already closed by the base contract — workers PROPOSE text,
never execute; a side-effecting step (migration run, API call, commit) fires only at the
conductor's consented sequential apply, and is never auto-retried (retry = doing it twice).

## Mixed worksites

Real sites mix shapes (a flat sweep + one chained pair + a glossary). The scout tags each
spot with its shape; the partition orders waves so locked invariants come first, chains run
in order, and the flat bulk fills the width. One receipt covers the lot.
