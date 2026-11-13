# Worked example: one fan-out, scout to receipt

An invented job, traced step by step. Every step names the `SKILL.md` section it follows (`## The flow`, steps 1 to 8, unless noted). The numbers are an example; the job is not a real run.

## The job

Rename the helper `fmt` to `formatTime` where it is called in six files. Each call site is one line. No other file is touched.

## 1 · SCOUT (`## The flow`, step 1)

A scout sub surveys the worksite and returns:
- **SPOT LIST:** six spots, one per file, each a single line.
- **DEPENDENCY GRAPH:** none. No spot reads another spot's output.
- **INVARIANTS:** `fmt` is no longer called anywhere; `formatTime` is exported from the same module.
- **DOMAIN GATE:** the project's build and test command.
- **SWARM-MODE:** fan out.

## 2 · PARTITION (step 2)

The interval check finds no overlaps. Each spot is one line, which is smaller than spawn overhead, so the min-unit floor merges neighbours: six spots become two units of three files each.

## 3 · HEADS-UP (step 3)

Not shown. The job is no bigger than the prompt implies, so the heads-up line does not fire.

## 4 · WAVES (step 4)

Width is `max(1, floor(platform width × bandwidth%))`. With a platform width of 4 and `bandwidth` at 50, width is 2. Two units fit in one wave.

## 5 · RETURN = ORDERS AS TEXT (step 5)

Each worker returns anchor-edits, not file writes:

```text
old: fmt(start)
new: formatTime(start)
```

Nothing is written to the tree by a worker.

## 6 · QC AT COLLECTION (step 6)

Per return, two checks before any apply:
- **(a) SCOPE:** every anchor sits inside its assigned file. No foreign file appears.
- **(b) SPEC:** the invariant "no `fmt(` left" is grep-verified in the returned orders.

Both units pass. Nothing is quarantined.

## 7 · APPLY, single writer (step 7)

The conductor is the single writer. It takes a pre-swarm snapshot first, then applies the accepted orders one at a time, in topological order. Afterwards it runs the domain gate: build and test. Both are green, so the swarm is kept. A red gate would roll the snapshot back.

## 8 · RECEIPT (step 8, `references/receipt.md`)

The receipt copies the shape of `references/receipt.md`. Values below are the example's own:

```text
[CoalFace] RECEIPT
Task        : rename fmt to formatTime in six call sites
Spots       : 6 found -> 2 units (merged 0 overlaps, 4 tiny)
Workers     : 2 spawned · 2 ok · 0 reworked once · 0 quarantined
```

The remaining fields follow `references/receipt.md`.
