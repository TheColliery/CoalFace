# Changelog

All notable changes to CoalFace are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [0.3.0] - 2026-07-14

**MINOR** — the AUTO conductor reaches Antigravity. The manual `/coalface` SKILL contract was already cross-agent; what is new is only the standing `auto` directive riding AG 2.0's real hook engine (`hooks.json`; empirical pilot 2026-07-12, corroborated against the official docs 2026-07-13). Honest tier: **wired** — built + hermetically tested against that verified spec; whether AG delivers the injected directive into the agent is not yet live-validated, so no "validated on Antigravity" claim.

### Added
- **`hooks/ag-conductor.js`** — the conductor directive rides the FIRST `PreInvocation` of a session (AG never fires `SessionStart`; PreInvocation fires per MODEL call, so a per-session tmp marker guards the injection to once per session). Named divergence from CoalHearth's AG shim: a failed marker write here fails **CLOSED** (skip the emit entirely) — CoalHearth's payload is a recovery block, where repeating beats losing it; CoalFace's is an advisory directive, where repeating on every model call IS the harm the guard exists to prevent.
- **`platform-configs/hooks.json`** — the AG wiring template (copy to `<workspace>/.agents/hooks.json` or `~/.gemini/config/hooks.json`, replace `__COALFACE_DIR__`).
- `hooks/coalface-conductor.js` now exports `{readCfg, directiveFor}` — one copy of the config read + directive text for both platforms, behind a `require.main` gate (the Claude Code hook's behavior is unchanged).
- +8 hermetic tests → 27; `verify.mjs` gains the 2 new file rows.
- Deliberately NOT ported: the self-update nudge — its payload (`claude plugin update coalface@coalface`) is Claude-Code-plugin-specific; AG installs by file-copy (the same named decision as CoalHearth's AG shim).

## [0.2.3] - 2026-07-09

### Fixed
- **SKILL.md frontmatter description was 1049 chars, over the 1024 cross-platform-safe cap** (some platforms truncate; the description is always-loaded every session, so over-cap is also a per-session token tax) — trimmed to 985, matching the same-day one-flock conform (CoalBoard v1.7.1 · CoalWash both cut under 1024). Cut redundancy only ("the fan-out as" → "it as", dropped filler articles/repeated "the"); every auto-trigger word survives verbatim (fan-out, swarm, bulk refactor, repo-wide sweep, scout, partition, anchor-edit, QC, single-writer, receipt, `/coalface`) and both honesty clauses are untouched ("does not make models smarter", the wallet's dollar-not-token frame). No behavior change. (Credit: agnix.)
- **README "Part of TheColliery" doctrine link pointed at the org root** (`github.com/TheColliery`) instead of the `.github` repo where the doctrine docs (DESIGN-PRINCIPLES.md et al.) actually live — now `github.com/TheColliery/.github`, matching the already-correct "Series doctrine" link further down the same file. (Credit: the user's CoalBoard nasa-full-mirror audit, 2026-07-09, LOW/INFO.)

## [0.2.2] - 2026-07-09

### Fixed
- **Honesty: the "wallet ≈ solo cost" claim was FALSE in raw tokens on the always-loaded / front-door surfaces** — the SKILL description + body, README table + prose, the conductor hook messages, and the marketplace/plugin descriptions all asserted "tokens BOUNDED ≈ solo", which the shipped benchmark ([`benchmarks/CoalFace/RESULTS.md`](https://github.com/TheColliery/.github/blob/main/benchmarks/CoalFace/RESULTS.md)) directly refutes: fan-out multiplies the fixed ~per-sub baseline by N, so raw tokens run **higher** than solo (~5.3× on a small 6-spot job). The wallet is a **dollar** bound (cheap worker tiers, −15% vs solo-on-an-expensive-main) + a **wall-time** bound, never a token bound. All surfaces reworded to say so; the `token-budget` keyword → `cost-budget`. The CHANGELOG [0.2.0] note + the benchmark already told the truth — this conforms the lagging headline surfaces to them. (Board-2 dogfood finding; the "false claim worse than none" class.)

## [0.2.1] - 2026-07-09

### Changed
- SKILL.md frontmatter description trimmed 1338 -> under 1024 chars (the cross-platform-safe cap; the description is always-loaded every session, so shorter = a per-session token saving). No behavior change.
- `references/contract-template.md`: the journal-line and rejection-line code spans no longer wrap across lines (a wrapped span read as an unclosed XML tag to external linters; renders identically).
- README: siblings line + doctrine paragraph now name CoalWash and CoalLedger; Compatibility gains the claude.ai row (sequential-degrade, link to the packaging guide).

## [0.2.0] - 2026-07-09

**STABLE — graduated from beta on the first real full-pipeline run** (the honest hold since 0.1.0-beta.1: "graduates only when a REAL `/coalface` swarm runs on a REAL flat worksite").

The run: the flock doc-conform sweep — 15 disjoint spots across 5 sibling repos. Full contract exercised end-to-end: scout (spot list + shared-digest + invariants) → deterministic partition (min-unit floor merged one repo's spots into main) → 1 wave, width 4 (slow-start) → 4 workers returning anchor-edit orders as text → QC at collection (caught 4 real issues: a scout anchor drift, 2 template path errors, a MEMORY-vs-code contradiction) → single-writer sequential apply → domain gates green (75/75 + 19/19 + verify PASS) → receipt.

Honest wallet note, from the receipt: on this job the swarm did **not** beat the solo estimate (workers ≈220k tokens vs the scout's ~150-250k solo estimate) — consistent with the shipped benchmark ("the wallet is a $-via-cheap-tier + right-sizing bound, not a token saving"). The graduation evidence is the **discipline working** — QC catches before apply, no real-tree writes by workers, gates green — not a token win.

### Changed
- Version only — the code is identical to 0.2.0-beta.3. README status badge beta → stable.

## [0.2.0-beta.3] - 2026-07-09

Part of the flock doc-conform sweep — CoalFace's own contract orchestrated it (the first real full-pipeline `/coalface` run: scout → partition → 4 workers returning anchor-edit orders → QC → single-writer apply → receipt).

### Changed
- SKILL.md Engine line: "native Agent-tool waves" → "native **subagent** waves" — `Agent` is a Claude-Code tool NAME; cross-agent text names the capability, never a CC tool (tool-name ≠ capability).
- README Configure intro gains the per-project off-switch clause (`coalfaceMode: off`) per the two-level config user-benefit frame.

## [0.2.0-beta.2] - 2026-07-09

Field-driven: a 52-agent `Workflow` run lost 8 workers (2 transient + 6 on a session limit) with no automated recovery layer — the Workflow engine is a separate system from Agent-tool spawning (its own journal, its own resume, no auto-retry).

### Added
- **`references/workflow-engine.md`** — the CF discipline expressed as Workflow-script structure: waves not `parallel(all-N)`; the two null-classes split in-script (scattered nulls = one transient retry pass · a run of ≥3 consecutive = quota death, STOP + return `{done, failedItems}` — never re-ram); always return a continuation-ready receipt; continuation = a fresh small run with `args = failedItems`, NOT `resumeFromRunId` (docs suggest a dead call's `null` is journaled as its result, so a resume likely REPLAYS the failure — verify the run's `journal.jsonl` before trusting it); the CoalHearth outer-seam note. SKILL.md Engine line now points at it.

## [0.2.0-beta.1] - 2026-07-08

**MINOR (beta line)** — the measurement standard-system lands.

### Added
- **`/coalface:stats`** (`commands/stats.md`) — the standardized measurement command (series standard-system #5): swarm receipts this session (spots · workers · waves · effective width incl. AIMD settle), wallet outcome vs the solo baseline (approximate, labeled), discipline events (ad-hoc→contract conversions, QC rejects, width-1 collapses). Honest empty state when no swarm ran.

### Changed
- **Self-update wording aligned to the series gold phrasing** (one-flock conform, the CB v1.6.0 batch's sibling): the conductor nudge and `commands/update.md` now say *web-check the latest tag vs the installed `plugin.json` version … if git/network is unavailable, say so and suggest updating manually later (never assume)* — the `git ls-remote` hard-coupling is gone (git remains a usable means, not an assumed one).
- Relicensed from MIT to Apache-2.0. `LICENSE` is now the Apache License 2.0 (verbatim); a new `NOTICE` carries the attribution; the `plugin.json` `license` field is `Apache-2.0`. No code or behavior change.

## [0.1.0-beta.2] - 2026-07-02

### Fixed

- Conductor config walk stop-at-home is now symlink-correct: both the walked cwd and the home dir are resolved to their physical paths (`fs.realpathSync` with a lexical fallback) before comparison. On macOS `process.cwd()` returns the physical `/private/var/...` path while `os.homedir()` returns the raw `/var/...` symlink, so the lexical `dir === home` never matched, the walk escaped above home, and a `.coalface.json` above home could be read as project config (caught by CI on macOS, both Node lanes). Same realpath-both-sides class as CoalHearth beta.3.

## [0.1.0-beta.1] - 2026-07-02

Initial public beta.

**Honest frame:** CoalFace is a fan-out DISCIPLINE — it enforces the wallet
(the whole swarm fits inside the estimated solo cost), QC at collection,
single-writer apply behind a pre-swarm snapshot, and a per-worker-return
journal on fan-outs that would happen anyway. It does NOT make models smarter
and does NOT guarantee correctness (an in-scope, on-spec, semantically-wrong
return with no covering test can pass QC — the receipt flags those spots).

### Added

- `skills/coalface/SKILL.md` — the resident contract: mandatory SCOUT →
  deterministic PARTITION (interval-intersection merge, min-unit floor) →
  non-blocking heads-up → WAVES (width = floor(platform width × bandwidth%),
  AIMD backoff on 429) → anchor-edit orders as TEXT (propose-not-execute) →
  mechanical QC (scope + spec, one bounded rework) → single-writer sequential
  apply behind a snapshot + domain gate (gate-red = full rollback) → RECEIPT.
  Swarmability taxonomy (flat / chain / global-invariant / holistic /
  side-effects / non-decomposable), solo-baseline wallet with its three
  guards, per-worker-return journal, series composition (CoalBoard wins
  error-not-allowed; CoalTipple tiering optional with the sensitive gate
  inherited; subagent-safety wholesale), depth-2 nested-conductor bound,
  cross-agent platform footer with sequential-pipeline degrade.
- `skills/coalface/references/` — `contract-template.md` (the 8-point worker
  contract incl. the journal + friction lines and the verbatim-upstream rule),
  `taxonomy.md` (per-domain unit/invariant/gate tables + mode detail),
  `receipt.md` (receipt + heads-up formats, plain-language wording).
- `hooks/coalface-conductor.js` — Phoenix-13 SessionStart conductor: injects
  the mode-aware standing directive (`auto`/`on`; `off` = silent) + the kind-1
  self-update schedule (throttled crash-safe stamp; the hook never networks).
  Proto-guarded JSONC config read, global overlaid by nearest project
  `.coalface.json`, walk stops at home, every numeric clamped on read.
- `commands/update.md` — `/coalface:update`, the consent-gated online check.
- Config schema (`scripts/lib/config-schema.mjs`): `coalfaceMode`
  (auto|on|off, default auto) · `bandwidth` (1-100, default 25) ·
  `autoFanoutFloor` (1-50, default 4) · `updateMode` (ask|auto|remind|off,
  default ask) · `updateCheckDays` (1-365, default 14). Commented factory at
  `platform-configs/.coalface.json`.
- Gates: `scripts/build-plugin.mjs` (clean `plugin/` dist, tests excluded),
  `scripts/verify.mjs` (files · manifests · semver incl. pre-release ·
  marketplace → ./plugin · factory-vs-schema · dist sync both directions ·
  version pins · hooks wiring), `scripts/test.mjs` (explicit list; 10 hermetic
  conductor cases + schema + jsonc units).
- `.github/` — 4 SHA-pinned workflows (ci = verify → test, no build step),
  dependabot, issue templates with a `version-pin:` marker.
