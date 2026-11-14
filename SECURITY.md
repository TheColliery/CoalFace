# Verifying CoalFace

CoalFace is verified under the same framework as **[CoalMine](https://github.com/TheColliery/CoalMine)**, **[CoalTipple](https://github.com/TheColliery/CoalTipple)**, and **[CoalBoard](https://github.com/TheColliery/CoalBoard)**: the conductor hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and scanning is event-driven.

## Reporting a Vulnerability

Report a security issue in this repo through GitHub's private vulnerability reporting — [Security → Report a vulnerability](https://github.com/TheColliery/CoalFace/security/advisories/new) — never a public issue; enabled and verified live at press. In scope: the set under [What counts as a vulnerability](#what-counts-as-a-vulnerability) below. This is a one-person-maintained project: expect the report to be read and acknowledged, triaged against that scope, and disclosed once a fix ships as a GitHub security advisory, with no public detail before it — all inside the advisory thread. Published advisories are listed on the [Security Advisories](https://github.com/TheColliery/CoalFace/security/advisories) tab; this file does not repeat them. We acknowledge a report within 5 days, send an assessment within 10 days, and disclose publicly once the fix ships, or at 90 days at most; the disclosure date is coordinated with you within those limits. During an absence announced on the maintainer's GitHub profile, the 5 days count from the first day back. A public GitHub issue remains the right channel for an ordinary, non-security bug.

## What counts as a vulnerability

The shipped code is in scope: what this project installs and runs for a user, including anything it reads from a repository or file the user did not write. This repository's own tooling (its CI workflows, its release and build scripts, and its test harness, as a maintainer runs them on the maintainer's checkout) is welcome to report on, and a flaw in it is fixed as hardening. Either part earns a published advisory only when an outsider can reach the flaw through input they control: a repository they clone, a file they send, a pull request from a fork, or a network response. A flaw that only the maintainer or the user feeds does not get one. Where it is unclear whether an outsider can reach a flaw, it counts as reachable until the maintainers have decided.

Scope of this repo: the shipped `plugin/` skill and its conductor hooks (`coalface-conductor.js`, `ag-conductor.js`), the build/verify scripts under `scripts/`, and the swarm-discipline mechanisms (snapshot/rollback, worker isolation, QC gating) described below.

## Planted Links in the Project Config

The project config (`.claude/coal/coalface.json` and its legacy locations) sits in a folder a cloned repository supplies. A link planted at the config file or at a folder above it (a junction on Windows, a symlink on POSIX) made the conductor read a file outside the project, and made `scripts/configure.mjs` read, back up and write outside it. Fixed in v0.14.3: the conductor (and the Antigravity adapter, which shares the read) accepts a project config only when its real path is exactly its folder's real path plus the literal path the walk built, and a refused file counts as absent and is named in the report with the reason "it resolves outside its folder"; `configure.mjs` pins the config it finds, the file it writes and the `.bak` copy the same way before anything is read or written, and on a refusal prints one FAIL line and writes nothing. Verified here on Windows (directory junctions): 9 hook, Antigravity and helper witnesses and 4 configure witnesses failed before the fix and pass after (hook tests 71 to 85, configure tests 16 to 25), and the full suite is green (749 tests, 743 pass, 6 skipped). The file-symlink cases need a privilege this machine lacks, and the ENOTDIR case does not occur on Windows (a path under a file reads ENOENT there), so those skip visibly here and run on CI. Nothing on POSIX was run here. Named residue: the check and the read are two acts, so a link swapped in between them is not caught; a hard link cannot be told from a file when the config is READ (a write replaces it, see below); a differently cased existing folder on a case-insensitive volume is refused (the safe direction).

**Making the missing folders (CWK2-042, CWK2-049).** `scripts/configure.mjs` makes the parent folders of a new project config only after judging every component from the level it writes under down to the target (`scripts/lib/repo-fs.mjs`, `mkdirRepoParents`): one `lstat` per component, a missing one made with a plain non-recursive `mkdir` and checked again at once. **The link rule it follows:** a link or junction at ANY component of that chain is refused, wherever it points, and so is a file where a folder must be, with one clean FAIL line and nothing written. That is the rule CoalLedger's exemplar states for its own write root, and the rule the up-front pin above already applies to the config file and the folders above it. **Residual, named:** the judging and the later write are two acts, so a hostile local process that swaps a just-judged folder for a link to somewhere outside the project in the gap between them can make the config file land outside it (the folder chain is judged before the write, and the temp file and the rename land in that folder). Since v0.14.8 the config file and its `.bak` are written to a temp file in that folder and renamed into place (`writeFileAtomic` in `scripts/lib/repo-fs.mjs`), so a symlink or junction already at the config file or the `.bak` is refused by the up-front pin before anything is written, and a hard link there (which the pin cannot tell from a file), or a link swapped in after the check, is REPLACED, never written through. What stays open is only the folder chain: a folder swapped for a junction between the last check and the temp's creation sends the temp and the rename outside. On Windows a rename over a file another process holds open can fail, which is a FAIL line and keeps the old file. The walk narrows that gap and does not close it, and no duration is measured (the same gap the read side's check-then-read names above); a stricter per-component walk does not remove it either. Nothing a cloned repository plants ahead of time reaches outside the project: such a link is refused before anything is made.

## Commit & Tag Signatures

Every **release tag** and **maintainer commit** is SSH-signed (`gpg.format=ssh`); GitHub shows the Verified badge on them. Automated **Dependabot / CI** commits are unsigned by design (they carry no maintainer key), so verify a signed **release tag** — the artifact a release consumer trusts:

```bash
echo "* ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEtqTWGKhX1Dk9nZP8ns13Wl5zsO1Cz3VlTS6m1p2fP9" > coalface_signers
git config gpg.ssh.allowedSignersFile ./coalface_signers
git tag -v "$(git describe --tags --abbrev=0)"
```

## Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync **both directions** (stale files AND dist-only orphans) — byte-exact, with a CRLF/LF-normalized fallback on text files only (so a checkout's line-ending doesn't false-flag byte-identical content) — the manifests are valid, the factory config matches the schema, and the issue-template version pins are current. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests. Zero dependencies — no lockfile, nothing to `npm audit`.

<!-- version-transition: SkillSpector scan—the re-scan is meant to fire when this room's version is bumped (gated by a baseline diff), but no workflow or script in this repo wires that yet, so a re-scan is run by hand; a genuinely new attack surface is a second trigger, by hand. Record the version/score/date/commit here only after a real scan, and REPLACE this section, never append to it. -->
## Independent Scanning — NVIDIA SkillSpector

CoalFace is evaluated against [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector), run locally through `uvx` (`uvx --from git+https://github.com/NVIDIA/skillspector.git skillspector scan <plugin> --format json`; no install), static stage only (`--no-llm`, the documented false-positive-prone baseline).

* **Scan:** 2026-11-06, CoalFace v0.15.2 dist (`plugin/`, commit `d2af2c3`, the `v0.15.2` tag), SkillSpector v2.13.4 pinned to commit `5482446` (`54824463814a0be01360792523ec7245a69190fc`).
* **Score:** 100/100 (CRITICAL static). **20 findings, none a defect**, each read at its source line. The report JSON is not shipped.
* **Finding classes:**
  * RA1 Self-Modification ×16—the string "self-update" in comments, directive text, the `/coalface:update` command, `plugin.json` and the SKILL.md config section. The hook only schedules a throttled check with no network; the command tells the agent to offer `claude plugin update` and never apply it unasked; no hook enforces that, and the user runs the update.
  * AS1 ×1—a comment in `hooks/ag-conductor.js` naming a file-copy install location; the file never reads or writes that path.
  * AR1 ×1—the SKILL.md row "queue it, never refuse", about workers above the admission cap, not model refusals.
  * RA2 ×1—a comment in the conductor listing config paths a user might mistype; the code it describes only checks whether those paths exist, and stores nothing across sessions.
  * BH1 ×1—the scanner's note that `hooks/hooks.json` registers a lifecycle hook.
* **Coverage:** partial, 12 of 17 files fully inspected. `hooks/ag-conductor.js`, `skills/coalface/scripts/admission.mjs`, `skills/coalface/scripts/machine-reading.mjs` and the root `hooks.json` reached the scanner's parser span limit and `hooks/hooks.json` is opaque to it, so those five were read by hand.

A re-scan is run when this repo's own version bump calls for it (the automatic baseline-diff trigger is planned and not yet wired) or on a genuinely new attack surface, not on every release — this pins the last version actually verified.

Earlier scans are in this file's git history. Scanning is event-driven (this repository's own version bump, or a genuinely new attack surface); this record names the last scan actually run.

## Structural Safety

Both hooks — `hooks/coalface-conductor.js` (Claude Code, SessionStart) and `hooks/ag-conductor.js` (Antigravity 2.0, the first-PreInvocation adapter) — are **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (all logic wrapped in try/catch; it never crashes the host), and silent except the one sanctioned context-injection channel (plain stdout on Claude Code · a single `{"injectSteps":[{"ephemeralMessage":...}]}` JSON line on Antigravity — the current AG PreInvocation contract). They inject a standing directive — never spawn workers, never network, never apply anything. `ag-conductor.js` shares the CC conductor's `readCfg`/`directiveFor` (one implementation, no fork) and guards its injection to once per session (a `os.tmpdir()` marker, written before emit, fail-closed on write failure); a session still open seven days after its marker was written can get the directive once more, once another session's first call has swept the markers older than seven days. The `.coalface.json` parse is **prototype-pollution-guarded** (`__proto__` / `constructor` / `prototype` keys dropped at parse time, so an untrusted project config cannot pollute `Object.prototype` through the config merge), and every numeric the hook reads is range-clamped.

Honest scope: no formal verification, no crypto-at-rest, no "military-grade" claim.

## Security by Design — the Swarm

The discipline itself is the safety mechanism:

- **Workers are leaves.** Spawned via a spawn-tool-less agent type where the platform offers one; they read and RETURN text — never write the tree, never spawn, never self-retry.
- **Propose, never execute.** Workers return anchor-edit orders as text; a side-effect fires only at the conductor's consented sequential apply — and is never auto-retried.
- **Snapshot + gate.** The apply happens behind a pre-swarm snapshot (git stash / HEAD-record, or plain file copies — git is never assumed); a red domain gate = full rollback.
- **Honest QC ceiling.** QC is mechanical (scope + spec). An in-scope, on-spec, semantically-wrong return with no covering test CAN pass — the receipt flags test-uncovered spots; the escalation for that class is [CoalBoard](https://github.com/TheColliery/CoalBoard), not another swarm.
