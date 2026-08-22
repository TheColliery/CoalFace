# Changelog

All notable changes to CoalFace are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [0.7.3] - 2026-08-22

### Changed
- **SKILL.md body leaned (campaign #6 unit 4) — 6 confirmed duplicate passages cut to pointers; INSPECT caught ONE cut that was a real rail loss, fixed before ship (see below).** Measured first via `claude plugin details coalface` (installed byte-verified against source before reading — `git hash-object` match, the CB trap this measurement avoids): on-invoke ~7.4k -> ~6.7k tok (-9.5%); BODY (frontmatter-excluded, LF-normalized) 18,380 -> 16,604 ch (-9.7%). Every cut was grepped BOTH directions before being called a duplicate — one of those checks was wrong, corrected below. Genuine duplicates cut to pointers: the honest-frame blockquote (restated the frontmatter description + README almost verbatim); the standing-consent paragraph's justification clause (restated P8/O1); the QC step's "honest ceiling" line (restated F11/P22 verbatim); the APPLY step's fail-branch prose (restated F2/F3/F4/P16/P17/P18 — the domain-gate mapping itself is unique and was kept in full); the Wallet section's benchmark-numbers digression (README already states them with a citation — the pointer added here to README was itself removed on INSPECT's F2, since README is not a `DIST_ITEM` and an installed/ZIP user never receives it; the rail — the dollar invariant + its 3 guards — needed no pointer and stands alone). **INSPECT F1 (MEDIUM), fixed before ship:** the WAVES step-4 cut claimed a fuller AIMD copy "already lived in `references/admission-control.md`" — false; that file names AIMD twice as a cross-reference only and never states the re-grow mechanic. The cut had silently deleted the ONLY place stating that width re-grows additively after a 429 burst, leaving a monotonic-shrink-only rail with a false citation. Restored inline (shrink=F6/P19 multiplicative, re-grow=additive toward the set `bandwidth`%) with the false citation removed; also added the missing `F5` to this pointer (an incompleteness the 5-leaf walk itself caught via two leaves cross-referencing the full Fail-paths table). Fixed a dependency the WAVES cut created: the Composition section's "detailed in WAVES, step 4" claim would have gone stale, so it was repointed to F5/F7/F8, P14/P15 directly. Rail-completeness verified mechanically post-edit: all 29 P / 7 O / 15 F / 2 G items still present — true for the ORIGINAL 7 cuts; F1's own finding shows a table-presence check does not by itself prove no PROSE mechanic was lost, since AIMD's re-grow half was never a numbered P/O/F/G item to begin with. Declared bound (`skill-authoring.md` §3b, BODY-ONLY, frontmatter excluded, LF-normalized): **16,714 ch** (net of both fixes above, which roughly offset the pointer-target removal against the restored AIMD sentence) — re-derive: `node -e "const s=require('fs').readFileSync('skills/coalface/SKILL.md','utf8').replace(/\r\n/g,'\n');console.log(s.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1].length)"`. Variance walk (scope follows the diff — the two behavioral rails touched: APPLY step-7 sequence/gate, WAVES 429/quota/zombie handling): 5 leaves, 2 weak/2 medium/1 strong, two SEPARATE frozen questions per leaf. Zero variance on both — but INSPECT named the walk's own honest gap: the frozen question asked what happens *during* a 429, never what happens *after* it stops, so it could not have caught F1 by construction; the walk's real credit is catching the F5 pointer gap, not the AIMD loss. INSPECT: the room's own code-reviewer, resumed sid. Full detail -> `scratchpad/dispatch/cf-lean-119-return.md` + `scratchpad/dispatch/cf-inspect-lean-return.md`.

## [0.7.2] - 2026-08-21

### Fixed
- **After-the-fact INSPECT on `582a37e`/v0.7.1 (board #141 remainder — that unit shipped without one, disallowed for a room unit) found the fix over-corrected: `Bash` denial forced a hard STOP even where P16's own non-git file-copy SNAPSHOT fallback (`Write`/`Edit` alone) was fully available, and the DOMAIN GATE was narrowed to "(build+test)" though step 7 names five domain-gate kinds.** The write row's grant cell now states `Write`·`Edit` as the ALWAYS-sufficient pair for the SNAPSHOT (P16's file-copy path needs no shell), with `Bash` preferred only for a git-repo snapshot and for a gate that itself needs one; the on-denial branch no longer STOPs on a bare `Bash` denial — the snapshot still lands via the file-copy fallback and apply proceeds behind it, with only a gate that genuinely needs `Bash` reported as unrun in the receipt (O1), never as passed. Also corrected the `[0.7.1]` entry above: its stated cause for the missing `[0.6.0]` header ("a stray deletion swallowed it along with an unrelated rhetorical bullet") was false — `git show df44d34` shows a single-line deletion, the header replaced rather than anything swallowed; the correction is inline on that entry, not restated here. Reviewer seating: resumed the room's own code-reviewer sid (not a fresh leaf) — see `MEMORY.md` for the full INSPECT record and the walk ruling.

## [0.7.1] - 2026-08-21

### Fixed
- **The CLASSIFY-BLOCK's write row declared only `Write`·`Edit`, but two mechanisms inside the step it covers run through `Bash` (board #141, precondition check found independently by CM/CL during F22 — same class: a write/fix-mode step executing through Bash while the write row names only Write/Edit, so a denied Bash kills the step with no matching on-denial row).** Verified at the mechanism, not the table's own text: step 7's own SKILL.md text names the pre-swarm SNAPSHOT (O5, P16 — `git stash`/HEAD-record, or a file-copy) and the end-of-step DOMAIN GATE (build+test) — neither is a Write/Edit operation; both require a shell command. Fixed the grant cell to `Write`·`Edit`; `Bash` for those two, matching CoalWash's own exemplar idiom (`SKILL.md`'s write row: "`Write`·`Edit`; `Bash` for the engine scripts holding the real `fs` writes"). Split the on-denial branch in two: a `Write`/`Edit` denial still reports + couriers, never claims applied (unchanged); a `Bash` denial now STOPS before applying at all — no snapshot means no rollback net (P16/P18), no gate means nothing to report green — and says so in the receipt, rather than silently proceeding to apply un-snapshotted orders or reporting an unrun gate as passed. **Drive-by fix, same file, found while editing:** the `## [0.6.0] - 2026-08-16` version header had gone missing — `df44d34` (F22) replaced the previous top header instead of inserting the new `[0.7.0]` section above it, a single-line deletion — leaving that release's `### Added`/`### Fixed` content unlabeled and silently read as part of `[0.7.0]`. Restored the header verbatim at its correct position; no content was lost or altered, confirmed by re-reading the full section before and after. **Corrected 2026-08-21 (board #141 INSPECT, F3): this bullet originally misstated the cause as "a stray deletion swallowed it along with an unrelated rhetorical bullet" — false; `git show df44d34 -- CHANGELOG.md` shows exactly one deleted line, the header itself, replaced rather than swallowed alongside anything else.**

## [0.7.0] - 2026-08-19

### Added
- **CLASSIFY-BLOCK retrofit — the `Grants & denials` section (gold-standard F22, adjudicated + surveyed).** New `## Grants & denials (CLASSIFY-BLOCK — declared)` section in `SKILL.md`, per `skill-authoring.md` §5b's shared template (one flock, one color — the network row is dropped, this room's own skill has no network step, matching the template's own "drop rows a skill does not use" instruction). Three rows: **read** (SCOUT, step 1) — refuse before scouting, never a partial survey read as complete. **write** (step 7 single-writer APPLY) — report + courier the accepted orders to the dispatcher, never claim applied; O5's snapshot stays untaken and O6's journal/O1's receipt both state nothing was written. **spawn** (WAVES, step 4) — this room's own named finding from the survey: a spawn denial and "no fan-out tool on this platform" (F9/P24) were the SAME observable — the sequential-pipeline degrade ran silently either way, and the receipt's effective-width field never distinguished a denial from a bandwidth/tier setting. Closed by extending `references/receipt.md`'s existing effective-width field-notes (which already distinguish `account tier` from `machine cap`) with a third, explicit case — `1/<platform cap> — spawn denied` — rather than inventing new receipt structure. No divergence from the shared template's shape.

## [0.6.0] - 2026-08-16

### Added
- **claude.ai ZIP packaging via CI (board #40, flock batch; CoalMine is the exemplar this room ported from — the shape a later room copies).** A new `.github/workflows/claude-ai-zips.yml` builds a ZIP of `plugin/skills/coalface/` on every version tag and attaches it to the GitHub Release as an asset, so a claude.ai user downloads a ready-to-upload ZIP instead of hand-zipping `skills/`. The build (`scripts/build-claude-ai-zips.mjs`, backed by `scripts/lib/claude-ai-trim.mjs`) deterministically trims the skill's frontmatter `description` to claude.ai's 200-char skill-listing cap (our own cross-platform cap is 1024, `scripts/lib/desc-cap.mjs`) — a DERIVED artifact staged under `dist-claude-ai/`; the source `skills/coalface/SKILL.md` is never edited (985 chars in, 197 out, confirmed by a local dry run). `scripts/lib/desc-cap.mjs` is new — extracted from `verify.mjs`'s own previously-inline `DESC_CAP`/`frontmatterField` so both consumers read one implementation, never two (behavior-preserving refactor, `verify.mjs`'s own checks unchanged). `SHA256SUMS.txt` ships alongside every Release's ZIP for integrity (board #99's fix, inherited from the exemplar), and the "ensure the Release exists" step uses CoalMine's own hard-won idempotent form (a bare `view`-then-create was measured unreliable there — a `create`-first form that swallows the one expected already-exists failure directly is what ships here). This is a distributed-artifact change earning its own entry despite `plugin/` being unaffected — same precedent as CoalMine's own v3.17.0 entry: what a user downloads from the Release changes, even though the installed plugin dist does not. **Verification gap, stated plainly (matching the exemplar's own honest framing): the workflow runs on GitHub's runners and cannot be exercised locally — the trim/staging script is hermetically tested (see the test-count entry below), and the workflow YAML shape was hand-verified against the exemplar (diffed, only comment-level divergence), but the workflow's first LIVE run happens at this tag.**
- **+16 hermetic tests (69→85), all newly wired into `scripts/test.mjs`'s roster: `scripts/lib/desc-cap.test.mjs` (7), `scripts/lib/claude-ai-trim.test.mjs` (7, using this room's own real SKILL.md description as the trim fixture), `scripts/build-claude-ai-zips.test.mjs` (2 — the positive staging path and the negative missing-`plugin/` path).**

### Fixed
- **README's Compatibility table + Install section told a claude.ai user to hand-zip `skills/coalface` — advice that was already broken.** `SKILL.md`'s own frontmatter `description` runs to 985 characters (our 1024 cross-platform cap), nearly 5× claude.ai's 200-char skill-listing limit; a hand-built ZIP was never guaranteed to install cleanly there. Fixed to point at the Release page's CI-built ZIP (this entry's own `### Added`), with a new claude.ai install paragraph under `## Install` matching the room's existing per-platform block shape, including the `SHA256SUMS.txt` verify command (POSIX + Windows).
- **A real test-isolation race, found while porting:** `scripts/build-claude-ai-zips.test.mjs` writes and removes `dist-claude-ai/` directly at the repo root; `scripts/verify.test.mjs`'s `mkTmpRepoCopy()` helper copies *every* top-level repo entry into a tmp dir for its own negative-path test. `node --test` runs test files in parallel by default, so the two raced — an intermittent `ENOENT` on `dist-claude-ai` with no relation to either gate's own assertions, reproduced once and then closed by excluding `dist-claude-ai` from the copy loop the same way `.git` already is. Re-ran the full suite 3× consecutively after the fix with zero flakes (was already reproduced once before the fix, confirming it wasn't a fluke).

## [0.5.0] - 2026-08-13

### Added
- **Board #90: a third bound on fan-out — the MACHINE.** The wallet bounds dollars and `bandwidth` bounds agent-process speed/width, but nothing bounded the host running the swarm: board #89's exhibit measured 10 concurrent lanes driving 13 live node runtimes to 82% CPU (each worker's own local build/test gate step is a real CPU-bound child process the wallet/bandwidth bounds never touch). New `maxLocalWorkers` config key (default `0` = auto-derive from `os.cpus().length`) floors WAVES's effective width a second time: `min(floor(platform width × bandwidth%), maxLocalWorkers)`. Derivation cites Claude Code's own admission control (`min(16, cores-2)`, excess queued never denied) as the senior for the SHAPE only — the NUMBER doesn't transfer, since CC's agents are mostly network-bound while a CoalFace worker's local gate step genuinely holds a core; `WORKER_CORE_WEIGHT = 2` is this room's own variable, sized conservatively off board #89's ~1.3-runtimes-per-lane exhibit rather than fit to its noise. New `scripts/lib/admission-control.mjs` (`deriveMachineCap`, `resolveCap`, `createAdmissionGate` — a zero-dep async FIFO semaphore) + `references/admission-control.md` (full derivation + queue mechanics). Classification: a CAP, not a consent-bearing spend key — plain project-wins merge, no safer-value-wins clamp (hooks-safety.md §9's numeric-keys carve-out, same class as `bandwidth`/`autoFanoutFloor`). SKILL.md gained Prohibition P29 (deny/drop above the cap, instead of queuing) and the merged-config keys line; `references/workflow-engine.md` and `references/receipt.md` updated to compose with it. +9 hermetic tests (60→69, incl. red-first proof that the concurrency assertion trips on a naive no-op gate before it is trusted against the real one).

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
