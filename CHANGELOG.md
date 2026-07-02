# Changelog

All notable changes to CoalFace are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

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
