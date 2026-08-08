# Changelog

All notable changes to CoalFace are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Fixed
- **Board #83 (board #34's own follow-on): SKILL.md's Output-locations and Fail-paths axes carved into numbered ledgers** (`O1–O7`, `F1–F13`), the same remedy that took Prohibitions/Consent to zero variance in board #34's carve. Board #34's own §3b walk found these two axes wobbling (7/15/12 output-location counts, 13/14/15 fail-path counts across 3 cold reads) — a newly-measured, pre-existing property, not a regression. Ground truth for both axes was declared BEFORE any walker ran this time (board #34's walk derived it after, named as backwards). Also reworded the `## Config + self-update` lookup-order sentence — 3/3 cold readers of the pre-carve text independently stumbled on the same fork (is "your own agent's dir" a step before the fixed `.claude → .agents → .gemini` list, or a position within it?); reworded into one explicit numbered list with an explicit skip-the-already-checked clause. Re-walked (weak ×3, fresh wave): all four enumerable rails — 28 prohibitions, 2 consent gates, 7 output locations, 13 fail paths — landed at **zero variance**, exact membership match, exact ground-truth match; the reworded config paragraph resolved 3/3 unanimous correct on the exact ambiguity the prior walk found. No fix-and-walk loop needed past wave 1.

## [0.4.0] - 2026-08-09

### Added
- **Namespace campaign #69+#39: per-project config now lives under an agent dir, never bare at the project root.** New read order (first found wins, checked at every directory level while walking up from cwd to home): the EXECUTING agent's own dir first (`.claude/coal/coalface.json` on Claude Code, `.agents/coal/coalface.json` on Antigravity — the first room in this campaign with a real, wired second platform to branch on), then the fixed fallback order `.claude` → `.agents` → `.gemini`, then the legacy root `.coalface.json` (pre-2026-08-08 shape, still read normally — no breakage for an existing config). The update-check stamp moves the same way: `~/.claude/coal/coalface/update-check` is now the home, with a pre-migration stamp at the old `~/.claude/.coalface-update-check` still read once (read-new-fallback-old) and dropped on the next scheduled write (write-new-drop-old). The safer-value-wins config clamp (hooks-safety.md §9) is unchanged — only the file's address moved. +7 hermetic tests (50→57).
- **README gained the flock-canonical `## Commands` section** (locked into `DOC-PATTERN.md` as a required README row) — a two-column table listing every user-invocable command verbatim, including the two most commonly omitted (`stats`/`update`): `/coalface` (manual convene of the fan-out discipline), `/coalface:stats`, `/coalface:update`. Placed after Install, before Configure, per the pattern's row order. Verified against `commands/` + `plugin/commands/` (dist-synced, 2 files) plus the skill's own manual-invoke form — no undocumented or not-yet-shipped command included.

### Fixed
- **README's "Part of TheColliery" block was one unbroken 1,037-character paragraph** — six sibling links, the compose promise, the repo-specific interop sentence and the shared doctrine all welded into a single wall, the last thing a visitor reads before the License. `DOC-PATTERN.md` now locks the block's shape (row 10): one lead sentence, a bulleted sibling list (`[Name](url) — role`), the compose promise + interop as its own paragraph, then the doctrine + series pointer. Re-laid to that shape — line discipline only: every link target, sibling role, interop claim and doctrine word is unchanged, and the six URLs were re-verified against the live repos (CoalMine at `HetCreep/CoalMine`, the rest under the `TheColliery` org). The room's three locked divergence checks (🧭 heading, blank line after the `H2`, the closing `Zero-dependency, offline, no API keys.` line) were already conformant.
- **README's `## Permissions` heading carried an emoji (🔐), same as four other siblings each picking their own icon** — `DOC-PATTERN.md` now names `## Commands` and `## Permissions` as bare grep-anchor headings, no emoji in any repo, so one cross-repo `grep -n "^## Permissions"` actually finds all seven. Dropped to bare `## Permissions`; section content unchanged.
- **`hooks/coalface-conductor.js`'s config cascade let an untrusted project `.coalface.json` (arriving with a cloned repo) ESCALATE `coalfaceMode`/`updateMode` past what the user's own global config explicitly chose** — a plain `Object.assign(global, project)` overlay took the project's value unconditionally, so a cloned repo's config could flip a global `off` up to `on`/`auto`, firing unsolicited fan-out spawning or a networked update check nobody consented to. Fixed with a safer-value-wins clamp on both consent-bearing enums: the project layer may QUIETEN (`on`→`auto`→`off`, `auto`→`ask`→`remind`→`off`) but never escalate past an EXPLICIT global choice; a key set on only one layer stays unconstrained (the common per-project on/off case is untouched). Same shape as CoalMine's `updateMode` guard and CoalWash's `mergeSafety` (hooks-safety.md §9, one flock one color). +4 hermetic tests (31→35).
- **HIGH (R4) — the case-fold compare had no test.** `readCfg()`'s clamp already lowercased both sides before comparing (independently confirmed correct by station-3's own trace against an uppercase escalation attempt), but zero fixtures anywhere in the file used a mixed-case value — the exact H5-shaped gap this fix ported CoalWash over CoalMine to avoid; shipping it untested left it exactly as exposed to a silent regression as the bug it was ported to dodge. Added one case (`ON` from a cloned project vs an explicit `off` global); proven non-vacuous by temporarily stripping the case-fold, confirming it goes red, and restoring.
- **R1 — the hook was not the only read path.** `skills/coalface/SKILL.md`'s own config section documents the SAME unclamped "project wins per key" merge for the AGENT to follow when no hook directive exists (any non-Claude-Code platform, or before a hook first fires). Traced per-key: `coalfaceMode`'s `off` is documented to block even a MANUAL `/coalface` invocation, so a cloned project's config, self-derived on such a platform, could silently lift that block — made the SKILL.md prose clamp-aware for this key. `updateMode` does NOT reach a decision through that line: `/coalface:update` is itself a manually-typed command (confirmed against `commands/update.md`) — the keystroke is the consent regardless of any config value, so no change was needed there.
- **R2 — a silent global was not a protected stance.** The clamp only fired when BOTH layers set a key explicitly; a user who never wrote a global config (the common case) got zero protection even though the schema's factory default IS their implicit stance. Now ranks a missing global as the schema default (`auto` for `coalfaceMode`, `ask` for `updateMode`) when computing the floor. Honest reach: for `coalfaceMode` this is a real, observable change (silent-global + project-`on` now clamps to `auto` — a materially different directive). For `updateMode` it is currently NIL-BLAST: `updateDue()` only branches on `=== 'off'`, so `ask`/`remind`/`auto` produce byte-identical behavior today — shipped for conformance with the pattern the other rooms copied, not advertised as closing a live escalation.
- Enum orderings (`coalfaceMode: off→auto→on` vs `updateMode: off→remind→ask→auto`) are intentionally different per-key semantics, independently re-derived and confirmed correct by station-3 — not a bug, do not unify them. +3 hermetic tests (35→37: case 25 corrected to the R2 behavior, cases 27–28 net new).
- **HIGH — the clamp above still failed OPEN on an unrecognized value.** `readCfg()`'s own `if (gi === -1 || pi === -1) continue;` treated any value that didn't parse against `SAFER_ENUM` — on either side — as "nothing to clamp," letting the raw shallow-merge value through untouched. Found by the room's code-reviewer running the real hook, not by reading the source. Two live escalations: a malformed GLOBAL (e.g. `"Off "`, `"disabled"`, `0`) no longer counted as an explicit choice, so the floor fell through to nothing rather than the R2 schema-default floor, letting a clean project `on` reach `FORCED (on)`; a malformed PROJECT value (e.g. `"on "`) skipped the clamp entirely, riding through the shallow merge past an explicit global `off`. Fixed the same way both times: unrecognized GLOBAL → not an explicit choice → floor = the schema default (R2's own logic, generalized from "absent" to "absent or malformed"); unrecognized PROJECT → untrusted, doesn't parse → rejected outright → floor, never the raw string. Key-generic (loops `Object.entries(SAFER_ENUM)`), so `updateMode` inherits the same close; `ag-conductor.js` needed no separate fix (shares `readCfg`, confirmed by spawning the real adapter, not inferred). +4 hermetic tests (37→41: two red-first against the pre-fix hook for the reported rows, one covering `updateMode`'s project-malformed direction, one an AG-path regression case).

## [0.3.6] - 2026-07-25

### Fixed
- **SKILL.md's Composition section duplicated the WAVES step's subagent-safety detail almost verbatim** (the ~60-token say-once gap flagged at the beta.1 review, 2026-07-02, and tracked open since) — trimmed to a pointer ("detailed in WAVES, step 4"); the fuller rail (collect-then-release · reap a silent worker past timeout · a permission-wait is NOT silence) stays put at step 4, now the only copy. Dist rebuilt. (Closes one of the two beta.1 review LOWs — the depth-2 empirical re-verify LOW stays open.)
- **README's benchmark link pointed at the raw folder tree** (`.github/tree/main/benchmarks/CoalFace`) instead of the dated digest a reader actually wants — retargeted to [`RESULTS.md`](https://github.com/TheColliery/.github/blob/main/benchmarks/CoalFace/RESULTS.md) directly.
- **CONTRIBUTING.md's platform-support wording lagged the honest-tier vocabulary used everywhere else** — "the verified platform" → "the validated platform"; "design-supported, unverified" → "design-supported (swarm unrun there)".
- **A NOTICE-only edit fired the full CI matrix + CodeQL + Scorecard for no reason.** `NOTICE` (added at the Apache-2.0 relicense) was never added alongside `LICENSE` in `ci.yml`/`codeql.yml`/`scorecard.yml`'s `paths-ignore` lists — now excluded in all three, matching `LICENSE`.
- **`ci.yml`'s `actions/setup-node` pin comment said `# v6` next to a v7.0.0 SHA.** Dependabot's own bump commit confirms 6.4.0 → 7.0.0, but left the bare-major comment unchanged across the major-version jump — corrected to `# v7.0.0`. The SHA was already correct; comment-only, no behavior change.

## [0.3.5] - 2026-07-24

### Fixed
- **README's two Antigravity spots still told the pre-0.3.4 story.** The Compatibility table's `wired` cell and the Install section's "Auto conductor on AG" paragraph both still said an AG update between 2026-07-12 and 2026-07-16 had regressed the hook engine (wires inert, re-verify pending) — the [0.3.4] fix (`hooks/ag-conductor.js` re-derived to the current `injectSteps` contract, the pilot-era `additionalContext` key retired as a dead letter) had landed in code but not propagated to these two doc spots. Both now match: **wired** = tested against the current AG hook contract; live delivery on AG remains unvalidated, so manual `/coalface` is the reliable floor. No behavior change.

## [0.3.4] - 2026-07-23

### Fixed
- **The AG conductor emits the current Antigravity inject contract** (`hooks/ag-conductor.js`, re-derived 2026-07-23): the PreInvocation output is now `{"injectSteps":[{"ephemeralMessage":...}]}` — the pilot-era `{"additionalContext"}` key is gone from the current engine (0 hits, any casing), a dead letter that never delivered, so nothing depended on it. Payload reads follow the current spec's camelCase fields: session key `conversationId`-first (legacy `session_id`/`sessionId`/transcript-path fallbacks kept), and the config-walk chdir now takes `workspacePaths[0]` as authoritative (legacy `cwd` kept as a defensive fallback). Docs swept to match (SECURITY.md). Tier unchanged: **wired** — live AG delivery validation still pending.

## [0.3.3] - 2026-07-17

### Changed
- **Wallet framing corrected in the last un-swept doc.** `references/receipt.md` still framed the wallet as a token bound (`wallet: Y <= X`, plus a plain example showing the swarm using fewer tokens than solo); reframed to the honest $-and-speed bound — the swarm runs MORE raw tokens by design (fan-out ×N); the win is dollars + wall-time on cheap worker tiers. Every CoalFace surface now matches.
- **Benchmark ×2 extrapolation disclosed.** The 5.3× wallet headline extrapolated 3 measured workers ×2 to 6; the org benchmark record now discloses it (fully-measured arms named; the measured 3.2× floor holds without the extrapolation). Found by a nasa-L3 CoalBoard audit.

## [0.3.2] - 2026-07-15

### Security
- **Marker subdir hardened against a pre-planted symlink** (`hooks/ag-conductor.js`): an `lstatSync` no-follow check rejects a symlink at the marker subdir (which `mkdirSync(recursive)` would otherwise follow, bypassing `0o700`) and fail-closes — skips the emit. One-flock with CoalMine v3.11.1 / CoalHearth v1.3.2. Completes the CodeQL `js/insecure-temporary-file` mitigation. Tests 21/21.

## [0.3.1] - 2026-07-15

### Security
- **AG once-per-session marker hardened against a TOCTOU race** (`hooks/ag-conductor.js`): the check-then-write guard is now an atomic create-exclusive latch — `fs.writeFileSync(marker, '', { flag: 'wx' })` inside a private `0o700` `os.tmpdir()/coalface/` subdir. The `wx` flag makes the create itself fail `EEXIST` if the marker path already exists in ANY form (a prior turn's marker, or a planted file/symlink), closing CodeQL `js/insecure-temporary-file` (HIGH) and refusing a symlink target in the same syscall. **Fail-closed**, unlike CoalHearth's same-day v1.3.1 fix: ANY create failure — `EEXIST` or otherwise — skips the emit entirely; CoalFace's payload is an advisory directive, and repeating it on every model call is the harm this guard exists to prevent.

### Fixed
- **Hermetic-test case ordering restored**: `scripts/lib/hooks.test.mjs` case 19 (AG payload-cwd honoring) now runs before case 20 (EEXIST fail-closed) again, matching their numbering (20/20).

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
