# Verifying CoalFace

CoalFace is verified under the same framework as **[CoalMine](https://github.com/TheColliery/CoalMine)**, **[CoalTipple](https://github.com/TheColliery/CoalTipple)**, and **[CoalBoard](https://github.com/TheColliery/CoalBoard)**: the conductor hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and scanning is event-driven.

---

## 🔒 Reporting a Vulnerability

**Channel:** [GitHub private vulnerability reporting](https://github.com/TheColliery/CoalFace/security/advisories/new) — *Security → Report a vulnerability* on the repo page. Enabled for this repo, verified live at press.

**Scope:** the shipped `plugin/` skill and its conductor hooks (`coalface-conductor.js`, `ag-conductor.js`), the build/verify scripts under `scripts/`, and the swarm-discipline mechanisms (snapshot/rollback, worker isolation, QC gating) described below.

**What to expect:** an acknowledgement, triage against the scope above, and coordinated disclosure timing agreed with you before any public detail — all inside the advisory thread, never a public issue.

A public issue stays the route for ordinary bugs; it is not the route for a vulnerability.

---

## 🔑 Commit & Tag Signatures

Every **release tag** and **maintainer commit** is SSH-signed (`gpg.format=ssh`); GitHub shows the Verified badge on them. Automated **Dependabot / CI** commits are unsigned by design (they carry no maintainer key), so verify a signed **release tag** — the artifact a release consumer trusts:
```bash
echo "* ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEtqTWGKhX1Dk9nZP8ns13Wl5zsO1Cz3VlTS6m1p2fP9" > coalface_signers
git config gpg.ssh.allowedSignersFile ./coalface_signers
git tag -v "$(git describe --tags --abbrev=0)"
```

---

## 🕵️ Secret Scan Before Commit and Push

GitHub scans this public repository for provider tokens. The repository's own gate, `scripts/secret-gate.mjs` (scanner `scripts/lib/secret-scan.mjs`), catches a provider-shaped token anywhere on a line (a URL or an HTTP header included), a private-key header and a high-entropy value assigned to a name like secret, token, password or key. It does NOT catch a credential inside a URL or connection string (scheme://user:pass@host) unless the credential is provider-shaped, an HTTP authentication header whose value is a scheme and a token (Authorization: Bearer <key>, X-Api-Token: Bearer <key>) unless that token is provider-shaped, or a key split across lines. It runs as follows: `.githooks/pre-commit` scans the staged tree, and `.githooks/pre-push` also scans the added lines of every pushed commit plus every pushed commit and annotated-tag message. A scan that cannot run fails the hook, and a hit never prints its value. It runs on a maintainer's machine through the git hooks; CI does not run it, and a clone that has not set `core.hooksPath` to `.githooks` does not run it either. It reports what its patterns match and is not a guarantee that no secret is present.

---

## 📦 Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync **both directions** (stale files AND dist-only orphans) — byte-exact, with a CRLF/LF-normalized fallback on text files only (so a checkout's line-ending doesn't false-flag byte-identical content) — the manifests are valid, the factory config matches the schema, and the issue-template version pins are current. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests.

---

<!-- version-transition: SkillSpector scan—the re-scan is automatic when this room's version is bumped (gated by a baseline diff), not a maintainer command; a genuinely new attack surface is a second trigger, by hand. Bump the version/score/date/commit below only after a real re-scan. -->
## 🔬 Independent Scanning—NVIDIA SkillSpector

Last scan: CoalFace **v0.14.2** dist (`plugin/`, commit `d1abc52`), on **2026-10-04**, with [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) **v2.12.0** (self-reported version string; scan pinned to commit `2226747`, upstream's untagged HEAD of 2026-09-30, 58 commits after upstream's tag `v2.12.0`), static stage (`--no-llm`, the documented FP-prone baseline). Static coverage was **partial** (10 of 13 files fully inspected): `hooks/ag-conductor.js` and the new `skills/coalface/scripts/machine-reading.mjs` reached the scanner's parser span limit and `hooks/hooks.json` is opaque to it; `ag-conductor.js` and `hooks.json` were read by hand at v0.10.0 (`ag-conductor.js` is unchanged since v0.12.0), the v0.10.0 to v0.12.0 changes to them were read, the v0.12.0 to v0.14.0 changes to the conductor (a `.native` realpath and one notice path) were read, and `machine-reading.mjs` (183 lines) was read in full at v0.14.0 and differs in v0.14.2 by one comment and one usage-line string (the same rewording, "whatever the reading says" to "regardless of the reading"), both read, no logic: Node built-ins only, two fixed cgroup reads on Linux, stdout only, no child process, network or file write. The v0.14.1 to v0.14.2 dist changes are one sentence of `references/admission-control.md`, that comment and usage string in `machine-reading.mjs`, and the version string in `plugin.json`; no logic differs. The 18 findings are the same rule-and-file set, on the same lines, as v0.14.1's, v0.14.0's and v0.12.0's on the same scanner commit. A re-scan is triggered by this room's version bump, gated by a baseline diff; a genuinely new attack surface is a second trigger, by hand. This pins the last scan actually run.

* **Static Scan (100/100 · 18 findings, all false positive):** 14 × `HIGH · RA1 Self-Modification` matching the string "self-update" across the conductors' comments and directive text, the `/coalface:update` command, `plugin.json`, and the SKILL.md "Config + self-update" section—the family's consent-gated **Self-Updating** static false positive · 1 × `HIGH · AS1` on a comment in `hooks/ag-conductor.js` that names `~/.gemini/config/skills` as the file-copy install location (the file never reads or writes that path) · 1 × `HIGH · AR1` on the SKILL.md prohibition row "queue it, never refuse" (about workers above the admission cap, not about model refusals) · 1 × `MEDIUM · RA2` on a comment in the conductor · 1 × `MEDIUM · BH1`, the scanner's own note that `hooks/hooks.json` registers a lifecycle hook. The hook only SCHEDULES a throttled check (a timestamp stamp at `~/.claude/coal/coalface/update-check`—no network ever); the `/coalface:update` agent procedure verifies the tag online and **offers** `claude plugin update`—it never auto-applies, and the skill never rewrites its own files. The score is not comparable to the 37 recorded at v2.3.9: the previous dist (v0.1.0-beta.2) re-scanned with v2.11.2 scores 50; the v0.10.0 dist re-scanned with v2.12.0 also scores 100 with the same 18 findings, so the v0.12.0 changes add none. This matches the family baseline—**all-false-positive across the family**; each sibling's SECURITY.md pins its own last-scan score. The report JSON is not shipped.
* **Method:** `uvx --from git+https://github.com/NVIDIA/skillspector.git skillspector scan <plugin> --format json`—uvx fetches its own ephemeral Python, so no manual Python/pip install is needed; a JSON report is written even when the optional LLM stage is skipped.
* **LLM Semantic Scan:** not run this pass (`--no-llm`—static-only is the documented, FP-prone baseline: pattern-match without the skill-contract context).

---

## 🛡️ Structural Safety (Phoenix-13)

Both hooks — `hooks/coalface-conductor.js` (Claude Code, SessionStart) and `hooks/ag-conductor.js` (Antigravity 2.0, the first-PreInvocation adapter) — are **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (all logic wrapped in try/catch; it never crashes the host), and silent except the one sanctioned context-injection channel (plain stdout on Claude Code · a single `{"injectSteps":[{"ephemeralMessage":...}]}` JSON line on Antigravity — the current AG PreInvocation contract). They inject a standing directive — never spawn workers, never network, never apply anything. `ag-conductor.js` shares the CC conductor's `readCfg`/`directiveFor` (one implementation, no fork) and guards its injection to once per session (a `os.tmpdir()` marker, written before emit, fail-closed on write failure). The `.coalface.json` parse is **prototype-pollution-guarded** (`__proto__` / `constructor` / `prototype` keys dropped at parse time, so an untrusted project config cannot pollute `Object.prototype` through the config merge), and every numeric the hook reads is range-clamped.

---

## 🐜 Security by Design — the Swarm

The discipline itself is the safety mechanism:

- **Workers are leaves.** Spawned via a spawn-tool-less agent type where the platform offers one; they read and RETURN text — never write the tree, never spawn, never self-retry.
- **Propose, never execute.** Workers return anchor-edit orders as text; a side-effect fires only at the conductor's consented sequential apply — and is never auto-retried.
- **Snapshot + gate.** The apply happens behind a pre-swarm snapshot (git stash / HEAD-record, or plain file copies — git is never assumed); a red domain gate = full rollback.
- **Honest QC ceiling.** QC is mechanical (scope + spec). An in-scope, on-spec, semantically-wrong return with no covering test CAN pass — the receipt flags test-uncovered spots; the escalation for that class is [CoalBoard](https://github.com/TheColliery/CoalBoard), not another swarm.
