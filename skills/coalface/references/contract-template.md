# CoalFace work-contract template (per worker)

Every worker gets this 8-point contract, filled from the scout's output. Fill the `<...>`
placeholders mechanically — never free-write a contract (a contract the conductor improvises
drifts; the template is what makes 100 workers interchangeable). The contract is the ONLY
context a worker gets beyond the platform's own loading: scope + digest + rules, nothing else.

## The 8 points

1. **ROLE + WORKSITE:** you are a CoalFace swarm worker for `<task one-liner>`. Your unit:
   `<unit id>` of `<N>`. Read ONLY what your scope needs; the shared-digest below already
   carries the common context — do not re-read it from the tree.
2. **SCOPE (the assigned spots):** `<file(s) + exact ranges / unit ids>`. Touching anything
   outside this scope = a QC reject. If your work genuinely requires an out-of-scope change,
   do NOT make it — flag it in your return.
3. **SPEC / INVARIANTS (the locked rules):** `<the shared-digest: locked invariants, spec
   choices, glossary/API/style locks, relevant config>`. The spec already chose — you never
   choose what it chose. Every invariant here must be visibly honored in your output (QC
   greps for them).
4. **RETURN = ORDERS AS TEXT (propose-not-execute):** for edits, ANCHOR-EDITS only —
   `old-text -> new-text`, exact-match, enough surrounding text to be unique in the file.
   NEVER line numbers (lines shift), NEVER a written file, NEVER a commit/push/release.
   For non-edit units, the completed unit as text. The conductor is the single writer.
5. **QC ON RETURN:** the conductor checks scope + spec mechanically. A reject comes back
   ONCE with the reason (fix exactly that); a 2nd fail goes to the human via the receipt —
   never a loop.
6. **BUDGET:** no self-retry loops, no wandering, no speculative extras. Blocked or unsure →
   RETURN with the reason and the remainder; the conductor re-routes.
7. **JOURNAL LINE:** end your return with `done: <units/spots completed> | remaining:
   <what is not>` — a re-spawn resumes the REMAINDER, never restarts.
8. **FRICTION LINE:** end with one line on this contract itself — what was unclear, missing,
   awkward, or over-specified. Nothing → `friction: none`. (Feeds the receipt's contract-
   quality signal; the conductor tightens the next wave's contracts from it.)

## Conductor-side rules for this template

- **Verbatim-upstream (QC/review contracts):** a contract that asks a worker to QC/review
  another worker's return embeds that upstream return VERBATIM (or its full relevant
  section), never a paraphrase — a reviewer judging a re-derived summary judges the summary,
  not the work.
- **Shared-digest contents:** locked invariants (from user/project standing rules + the
  scout's locks) · spec choices made once for all workers (naming, style, the "bulb brand")
  · the minimal common context (config values, interface signatures, glossary rows) workers
  would otherwise each re-read. Pay the read once in the scout; distribute here.
- **Sensitive units:** a unit touching crypto/auth/payment/migration keeps a main-tier
  worker (the CoalTipple sensitive gate, inherited even when CT is absent) — note it in the
  contract so the worker knows extra care is on-spec.
- **Rejection re-spawn:** the ONE rework contract = this same template + a `REJECTED:
  <reason>` line at the top + the worker's own prior return embedded verbatim.
