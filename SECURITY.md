# Verifying CoalFace

CoalFace is verified under the same framework as **[CoalMine](https://github.com/HetCreep/CoalMine)**, **[CoalTipple](https://github.com/TheColliery/CoalTipple)**, and **[CoalBoard](https://github.com/TheColliery/CoalBoard)**: the conductor hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and scanning is event-driven.

---

## 🔒 Reporting a Vulnerability

Open an issue at `github.com/TheColliery/CoalFace`, or request a private channel for sensitive PoC logs. We investigate promptly.

---

## 🔑 Commit & Tag Signatures

All commits and release tags are SSH-signed (`gpg.format=ssh`); GitHub renders the Verified badge.

Verify locally:
```bash
echo "* ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEtqTWGKhX1Dk9nZP8ns13Wl5zsO1Cz3VlTS6m1p2fP9" > coalface_signers
git config gpg.ssh.allowedSignersFile ./coalface_signers
git verify-commit HEAD && git tag -v "$(git describe --tags --abbrev=0)"
```

---

## 📦 Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync **both directions** (stale files AND dist-only orphans), the manifests are valid, the factory config matches the schema, and the issue-template version pins are current. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests.

---

<!-- version-transition: SkillSpector scan — record the first scan here (scanner version, score, date, scanned commit, per-finding FP reasons) when it runs; re-scan is event-driven (a new SkillSpector version or a genuinely new attack surface), NOT per release. -->
## 🔬 Independent Scanning — NVIDIA SkillSpector

As a brand-new plugin (v0.1.0-beta.1) CoalFace has **not yet** been through an external security scan (e.g. [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector)); that provenance — scanner version, score, date, and a per-finding false-positive review, the same record its siblings carry — will be recorded here when it is.

---

## 🛡️ Structural Safety (Phoenix-13)

`hooks/coalface-conductor.js` is **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (all logic wrapped in try/catch; it never crashes the host), and silent except the one sanctioned SessionStart context-injection channel. It injects a standing directive — it never spawns workers, never networks, never applies anything. The `.coalface.json` parse is **prototype-pollution-guarded** (`__proto__` / `constructor` / `prototype` keys dropped at parse time, so an untrusted project config cannot pollute `Object.prototype` through the config merge), and every numeric the hook reads is range-clamped.

---

## 🐜 Security by Design — the Swarm

The discipline itself is the safety mechanism:

- **Workers are leaves.** Spawned via a spawn-tool-less agent type where the platform offers one; they read and RETURN text — never write the tree, never spawn, never self-retry.
- **Propose, never execute.** Workers return anchor-edit orders as text; a side-effect fires only at the conductor's consented sequential apply — and is never auto-retried.
- **Snapshot + gate.** The apply happens behind a pre-swarm snapshot (git stash / HEAD-record, or plain file copies — git is never assumed); a red domain gate = full rollback.
- **Honest QC ceiling.** QC is mechanical (scope + spec). An in-scope, on-spec, semantically-wrong return with no covering test CAN pass — the receipt flags test-uncovered spots; the escalation for that class is [CoalBoard](https://github.com/TheColliery/CoalBoard), not another swarm.
