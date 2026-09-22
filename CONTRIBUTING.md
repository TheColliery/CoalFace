# Contributing to CoalFace

CoalFace is the fan-out discipline of the [TheColliery](https://github.com/TheColliery) series. We welcome issues, bug reports, and pull requests.

---

## 🤝 Proposing a Change

1. **Open an issue first** describing the problem, gap, or proposed feature (especially for changes to `skills/coalface/SKILL.md` — the swarm contract).
2. Make your change and keep the verification gates green.
3. For contract or conductor changes, **dogfood a real swarm** (a flat, many-spot worksite shows the discipline best) and document the behavior — including the receipt — in your PR.

---

## 💻 Developing & Testing

CoalFace is **zero-dependency** (Node.js built-ins only). No `npm install` and no `package.json` — the gates run directly:

```bash
node scripts/build-plugin.mjs   # regenerate plugin/ from source
node scripts/verify.mjs         # gate: files · manifest/marketplace · description-length caps ·
                                 #   factory config vs schema · lib imports · dist-sync (both
                                 #   directions) · version pins · config-key drift (CWK-060) ·
                                 #   pointer drift (CWK-079)
node scripts/test.mjs           # zero-dependency test suite (node --test, explicit file list)
```

CI runs the same two gates (`verify` → `test`) on Linux/Windows/macOS — deliberately **without** a build step, so a stale committed `plugin/` fails loud instead of being silently rebuilt.

### Development Rules

* **Rebuild the dist after a source change:** edit `skills/`, `hooks/`, `commands/`, or the manifest, then `node scripts/build-plugin.mjs` to re-sync `plugin/` (verify fails on a stale dist).
* **`scripts/lib/config-schema.mjs` is the single source of truth** for every `.coalface.json` key — `verify.mjs` validates the factory config against it, and the README key table mirrors it (update both together).
* **Keep the conductor Phoenix-pure:** zero dependencies, fail-silent (wrap in try/catch, never a non-zero exit, no `process.exit()`), no network, no child processes, silent except the sanctioned SessionStart channel.
* **Add tests:** every lib change gets a unit test; every conductor-behavior change gets a **hermetic spawn test** (spawn the real hook, sandbox TEMP + HOME). Register new test files in `scripts/test.mjs` — the runner fails loud on a listed-but-missing file AND on an on-disk orphan it doesn't list.
* **Language & tone:** shipped source and docs stay in English.

---

## 🖥️ Supported Platforms

CoalFace is **cross-agent** — the contract runs on any platform with concurrent subagents (workers spawn via the platform's NATIVE subagent tool; no API, no keys). **Claude Code** is the validated platform and adds the conductor hook (the standing `auto`-mode directive) plus optional [CoalTipple](https://github.com/TheColliery/CoalTipple) worker tiering — a cost bonus, never a gate. Every other concurrent-subagent platform **works with** CoalFace (swarm unrun there by us): the contract degrades conservatively (unknown width → the conservative default; no fan-out at all → a sequential pipeline under the same discipline — never broken). If you run a platform we haven't verified, open an issue — verification follows access.

---

## 🗂️ Project Layout

| Path | Purpose |
|---|---|
| `skills/coalface/SKILL.md` | The resident fan-out contract (scout → partition → waves → QC → single-writer apply → receipt). |
| `skills/coalface/references/` | On-demand depth: `contract-template.md` (the 8-point worker contract) · `taxonomy.md` (per-domain units/invariants/gates) · `receipt.md` (receipt + heads-up formats) · `admission-control.md` (the MACHINE bound derivation) · `workflow-engine.md` (Workflow-tool wave/AIMD notes). |
| `hooks/coalface-conductor.js` · `hooks/ag-conductor.js` · `hooks/hooks.json` | Phoenix-pure SessionStart conductor (Claude Code), the Antigravity PreInvocation adapter, + the wiring both share. |
| `commands/` | `update.md` (the `/coalface:update` self-update procedure — agent-side, the hook only schedules) · `stats.md` (the `/coalface:stats` measurement command, one of the flock's 5 Standard Systems). |
| `scripts/` | The three gates are listed under **Developing & Testing** above; `configure.mjs` is the settings CLI (`--help` for its own reference). `lib/` holds the shared core logic each of those consumes — one `.test.mjs` per module (`ls scripts/lib/` for the current set). |
| `plugin/` | Generated Claude Code plugin distribution — never hand-edit. |
| `platform-configs/.coalface.json` | Commented factory default configuration. |

---

## 🚀 Releasing (Maintainers)

Bump version in `.claude-plugin/plugin.json` ➡️ finalize the `CHANGELOG.md` entry (a one-line summary before its first `### ` section, then Keep-a-Changelog sections) ➡️ ensure `verify.mjs` and `test.mjs` pass ➡️ commit ➡️ create a signed git tag (`vX.Y.Z`) ➡️ push `--follow-tags`. The tag-push workflow is the sole GitHub Release creator from here — it derives the title and body from that CHANGELOG entry (stable tags only; a beta tag stays history-only, the one launch-form pre-release Release is hand-cut per the org's [RELEASE-PATTERN](https://github.com/TheColliery/.github/blob/main/RELEASE-PATTERN.md)). A maintainer's own job ends at the push: read the workflow run, then GET the Release it made and re-read the title/body against the entry.

---

## 📄 License & Conduct

Contributions are licensed under the [Apache License 2.0](LICENSE). Please assume good faith and be respectful. Report security issues per [SECURITY.md](SECURITY.md).
