# Verifying CoalFace

CoalFace is verified under the same framework as **[CoalMine](https://github.com/HetCreep/CoalMine)**, **[CoalTipple](https://github.com/TheColliery/CoalTipple)**, and **[CoalBoard](https://github.com/TheColliery/CoalBoard)**: the conductor hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and scanning is event-driven.

---

## 🔒 Reporting a Vulnerability

Open an issue at `github.com/TheColliery/CoalFace`, or request a private channel for sensitive PoC logs. We investigate promptly.

---

## 🔑 Commit & Tag Signatures

Every **release tag** and **maintainer commit** is SSH-signed (`gpg.format=ssh`); GitHub shows the Verified badge on them. Automated **Dependabot / CI** commits are unsigned by design (they carry no maintainer key), so verify a signed **release tag** — the artifact a release consumer trusts:
```bash
echo "* ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEtqTWGKhX1Dk9nZP8ns13Wl5zsO1Cz3VlTS6m1p2fP9" > coalface_signers
git config gpg.ssh.allowedSignersFile ./coalface_signers
git tag -v "$(git describe --tags --abbrev=0)"
```

---

## 📦 Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync **both directions** (stale files AND dist-only orphans), the manifests are valid, the factory config matches the schema, and the issue-template version pins are current. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests.

---

<!-- version-transition: SkillSpector scan — re-scan is event-driven (a new SkillSpector version or a genuinely new attack surface, maintainer-commanded), NOT per release; bump the version/score/date/commit below only after a real re-scan. -->
## 🔬 Independent Scanning — NVIDIA SkillSpector

Last scan: CoalFace **v0.1.0-beta.2** dist (`plugin/`, commit `161b0e1`), on **2026-07-02**, with [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) **v2.3.9** (self-reported — the tool ships no tagged releases; the version is the `uvx`-from-git HEAD, `326a2b4`), static stage (`--no-llm`, the documented FP-prone baseline). Re-scan is event-driven (a new SkillSpector version or a genuinely new attack surface), not per release — this pins the last version actually verified.

* **Static Scan (37/100 · 8 findings, all false positive):** every finding is `HIGH · RA1 Self-Modification` matching the string "self-update" across the conductor's comments and directive text, the `/coalface:update` command, and the SKILL.md "Config + self-update" section (two of the eight are case-variant matches on adjacent SKILL.md lines): the family's consent-gated **Self-Updating** static false positive. The hook only SCHEDULES a throttled check (a timestamp stamp at `~/.claude/.coalface-update-check` — no network ever); the `/coalface:update` agent procedure verifies the tag online and **offers** `claude plugin update` — it never auto-applies, and the skill never rewrites its own files. This matches the family baseline — **all-false-positive across the family**; each sibling's SECURITY.md pins its own last-scan score. The report JSON is not shipped.
* **Method:** `uvx --from git+https://github.com/NVIDIA/skillspector.git skillspector scan <plugin> --format json` — uvx fetches its own ephemeral Python, so no manual Python/pip install is needed; a JSON report is written even when the optional LLM stage is skipped.
* **LLM Semantic Scan:** not run this pass (`--no-llm` — static-only is the documented, FP-prone baseline: pattern-match without the skill-contract context).

---

## 🛡️ Structural Safety (Phoenix-13)

Both hooks — `hooks/coalface-conductor.js` (Claude Code, SessionStart) and `hooks/ag-conductor.js` (Antigravity 2.0, the first-PreInvocation adapter) — are **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (all logic wrapped in try/catch; it never crashes the host), and silent except the one sanctioned context-injection channel (plain stdout on Claude Code · a single `additionalContext` JSON line on Antigravity). They inject a standing directive — never spawn workers, never network, never apply anything. `ag-conductor.js` shares the CC conductor's `readCfg`/`directiveFor` (one implementation, no fork) and guards its injection to once per session (a `os.tmpdir()` marker, written before emit, fail-closed on write failure). The `.coalface.json` parse is **prototype-pollution-guarded** (`__proto__` / `constructor` / `prototype` keys dropped at parse time, so an untrusted project config cannot pollute `Object.prototype` through the config merge), and every numeric the hook reads is range-clamped.

---

## 🐜 Security by Design — the Swarm

The discipline itself is the safety mechanism:

- **Workers are leaves.** Spawned via a spawn-tool-less agent type where the platform offers one; they read and RETURN text — never write the tree, never spawn, never self-retry.
- **Propose, never execute.** Workers return anchor-edit orders as text; a side-effect fires only at the conductor's consented sequential apply — and is never auto-retried.
- **Snapshot + gate.** The apply happens behind a pre-swarm snapshot (git stash / HEAD-record, or plain file copies — git is never assumed); a red domain gate = full rollback.
- **Honest QC ceiling.** QC is mechanical (scope + spec). An in-scope, on-spec, semantically-wrong return with no covering test CAN pass — the receipt flags test-uncovered spots; the escalation for that class is [CoalBoard](https://github.com/TheColliery/CoalBoard), not another swarm.
