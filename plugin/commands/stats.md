---
description: CoalFace fan-out stats — swarms run, receipts, and wallet outcomes this session
---

Produce the CoalFace stats report for this session, in the user's language. Tables only, minimal prose.

Drawn from the conversation context (and any `.coalface/` receipts referenced in it), show:
- **Swarm activity:** fan-outs that rode the contract this session — spots found, workers used, waves, effective width (incl. any AIMD settle, e.g. "6/14 — settled at account tier").
- **Wallet outcome per swarm:** estimated solo baseline vs actual swarm spend (the receipt's own numbers — approximate, label it so), quarantined items + why, test-uncovered flags.
- **Discipline events:** ad-hoc fan-outs ≥ the floor that were converted to the contract, QC rejects + rework rounds, any width-1 collapse.

Honest empty state: if no fan-out rode the contract this session, say exactly that in one line — never invent a receipt.

This is the measurement standard-system command. Do not modify any file.
