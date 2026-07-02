# CoalFace Privacy Policy

**CoalFace collects nothing and phones nowhere.**

- **No telemetry.** No usage data, analytics, or identifiers are collected, stored, or transmitted.
- **No network calls from the hook (Phoenix #7).** The conductor is offline by design: it reads local config, prints its one sanctioned SessionStart line, and nothing else. (The self-update *check* is the agent's `/coalface:update` procedure, run only with your consent — never the hook.)
- **It runs inside YOUR agent.** CoalFace operates no servers and calls no model API; the scout, the workers, and the apply all run as your own platform's subagents, on your account, under your platform's permission gate.
- **The receipt's numbers are estimates.** "swarm ~Y vs solo est ~X" is an estimate on both sides (char-heuristic class, always "~") — local transparency about your own session, never uploaded, never a precise claim.
- **Propose, never execute.** Workers return orders as text; nothing touches your tree except the conductor's sequential apply behind a pre-swarm snapshot (a git stash or file copies, in your own workspace) — and a red gate rolls it all back.
- **Error reports are manual.** Your agent may *offer* to open a pre-filled GitHub issue; nothing is submitted automatically, and you see and edit the full contents first.
- **Local files only.** All state lives in files you can read: the config (`~/.claude/.coalface.json` global, plus an optional per-project `.coalface.json`) and the self-update throttle stamp `~/.claude/.coalface-update-check` (a timestamp, nothing more).

Questions: open an issue at <https://github.com/TheColliery/CoalFace/issues>.
