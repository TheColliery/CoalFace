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
node scripts/verify.mjs         # gate: files, manifests, factory config vs schema, dist-sync (both directions), version pins
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

CoalFace is **cross-agent** — the contract runs on any platform with concurrent subagents (workers spawn via the platform's NATIVE subagent tool; no API, no keys). **Claude Code** is the verified platform and adds the conductor hook (the standing `auto`-mode directive) plus optional [CoalTipple](https://github.com/TheColliery/CoalTipple) worker tiering — a cost bonus, never a gate. Every other concurrent-subagent platform is **design-supported, unverified**: the contract degrades conservatively (unknown width → the conservative default; no fan-out at all → a sequential pipeline under the same discipline — never broken). If you run a platform we haven't verified, open an issue — verification follows access.

---

## 🗂️ Project Layout

| Path | Purpose |
|---|---|
| `skills/coalface/SKILL.md` | The resident fan-out contract (scout → partition → waves → QC → single-writer apply → receipt). |
| `skills/coalface/references/` | On-demand depth: `contract-template.md` (the 8-point worker contract) · `taxonomy.md` (per-domain units/invariants/gates) · `receipt.md` (receipt + heads-up formats). |
| `hooks/coalface-conductor.js` · `hooks/hooks.json` | Phoenix-pure SessionStart conductor + its wiring. |
| `commands/update.md` | The `/coalface:update` self-update procedure (agent-side; the hook only schedules). |
| `scripts/` | Tool scripts: `build-plugin.mjs`, `verify.mjs`, `test.mjs`, `lib/` (config-schema SSoT, jsonc, tests). |
| `plugin/` | Generated Claude Code plugin distribution — never hand-edit. |
| `platform-configs/.coalface.json` | Commented factory default configuration. |

---

## 🚀 Releasing (Maintainers)

Bump version in `.claude-plugin/plugin.json` ➡️ add a `CHANGELOG.md` entry ➡️ ensure `verify.mjs` and `test.mjs` pass ➡️ commit ➡️ create a signed git tag (`vX.Y.Z`) ➡️ push ➡️ create a GitHub Release (stable tags only; a beta tag ships as a prerelease or stays history-only).

---

## 📄 License & Conduct

Contributions are licensed under the [MIT License](LICENSE). Please assume good faith and be respectful. Report security issues per [SECURITY.md](SECURITY.md).
