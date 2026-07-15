<div align="center">

# ⛏️ CoalFace

> *A coal face is the active surface of the seam — the one place the whole crew swarms to cut coal.* This one disciplines your agent's swarm.

**A fan-out discipline for swarm work.** When a task decomposes into many units — a bulk refactor, a repo-wide sweep, a 100-spot edit, a corpus batch — CoalFace runs the fan-out as a disciplined factory instead of an ad-hoc swarm: a mandatory scout, a deterministic partition, workers returning anchor-edit orders as text, mechanical QC at collection, one writer applying behind a snapshot, and a receipt at the end.

![version](https://img.shields.io/github/v/tag/TheColliery/CoalFace?sort=semver&label=version&color=blue)
![license](https://img.shields.io/badge/license-Apache_2.0-blue)
![status](https://img.shields.io/badge/status-stable-brightgreen)

*Compatibility: **validated** on Claude Code · auto conductor **wired** on Antigravity (live validation pending) · **design-supported** (capability documented first-party, swarm unrun) on other concurrent-subagent platforms — see the Compatibility table below.*

![Claude Code](https://img.shields.io/badge/Claude_Code-validated-brightgreen)
![Antigravity](https://img.shields.io/badge/Antigravity-wired-yellow)
![Cursor](https://img.shields.io/badge/Cursor-design--supported-blue)
![Codex](https://img.shields.io/badge/Codex-design--supported-blue)
![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-design--supported-blue)
![Cline](https://img.shields.io/badge/Cline-design--supported-blue)
![Copilot](https://img.shields.io/badge/Copilot-design--supported-blue)

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md) · [Releases](https://github.com/TheColliery/CoalFace/releases)

**Part of [TheColliery](https://github.com/TheColliery/.github)** — siblings: **[CoalMine](https://github.com/HetCreep/CoalMine)** (quality canaries) · **[CoalTipple](https://github.com/TheColliery/CoalTipple)** (model/effort routing) · **[CoalBoard](https://github.com/TheColliery/CoalBoard)** (consensus board) · **[CoalHearth](https://github.com/TheColliery/CoalHearth)** (session warm-resume) · **[CoalWash](https://github.com/TheColliery/CoalWash)** (memory defrag) · **[CoalLedger](https://github.com/TheColliery/CoalLedger)** (docs health).

</div>

---

## ⛏️ What it is

Agents already fan work out to subagents — CoalFace does not invent that. It disciplines it. An ad-hoc fan-out makes the same three promises with **no guarantee**; CoalFace makes them **enforced by structure**:

| Promise | Ad-hoc fan-out | CoalFace |
|---|---|---|
| **Cost** | UNBOUNDED — uncontrolled spawn overhead, N workers re-reading the same files, retry storms, stray runaway workers | Overhead BOUNDED (shared-digest + min-unit floor + no self-retry) and **cheaper in $** via cheap worker tiers. NOTE: raw **tokens run HIGHER than solo** — fan-out multiplies the ~per-sub baseline by N (the benchmark measured ~5.3× on a small job); the wallet bounds **dollars + wall-time**, never raw tokens |
| **Speed** | UNDER-FANNED — a lazy orchestrator batches 100 spots into 5-8 bloated workers whose tail quality drops | Full width — worker count = spot count, floor/width-bounded waves |
| **Quality** | Can dip BELOW solo — a deviant worker, real-tree writes, a half-applied death | Netted — mechanical QC at collection, single-writer apply behind a pre-swarm snapshot, a domain gate |

Honest frame up front: CoalFace disciplines fan-outs that would happen anyway — it does **not** make models smarter and does **not** guarantee correctness (see the QC ceiling below). Zero-dependency, offline, no API keys.

## 🏭 How it works

The flow is fixed — a swarm never skips a step:

| # | Step | What happens |
|---|---|---|
| 1 | **Scout** (mandatory) | Survey the worksite before sizing anything: the spot list, the dependency graph, the invariants to lock (your standing rules, glossary, API/style), the end-of-run domain gate, the swarm mode, and the **shared-digest** — the common context paid for once and shipped to every worker (never N workers re-reading the same files). |
| 2 | **Partition** (deterministic) | An interval-intersection check merges overlapping spots and chains dependent ones — a rule table, not model judgment. A unit smaller than spawn overhead merges with a neighbor (the min-unit floor). |
| 3 | **Heads-up** (conditional) | If the job dwarfs the prompt, one NON-blocking line ("found N spots, ~est X — starting; Esc to stop") — never a question-box. |
| 4 | **Waves** | Effective width = floor(platform width × `bandwidth`%). AIMD backoff: a 429 shrinks the next wave, clear stretches re-grow — a `bandwidth` set above your account's real capacity simply settles AT the real capacity, nothing breaks. |
| 5 | **Orders as text** | Workers return **anchor-edits** (`old-text → new-text`, exact-match, position-independent — that is why 100 spots in ONE file works) or the completed unit as text. Propose-not-execute: workers never touch the tree. |
| 6 | **QC at collection** | Mechanical, before any apply: SCOPE (every anchor inside the assigned range, no foreign files) + SPEC (locked invariants grep-verifiable). Reject → quarantine + ONE bounded rework; a 2nd fail goes to you via the receipt. |
| 7 | **Apply** (single writer) | Behind a pre-swarm snapshot (git stash / HEAD-record, or plain file copies — git is never assumed), sequentially in topological order, then the domain gate (build+test / corpus rules / lint+links / schema-validate). Gate red = full rollback. |
| 8 | **Receipt** (always) | Spots · workers · waves · effective width · tokens vs the solo estimate · quarantined items · test-uncovered flags — in your language, plain wording first. |

**Activation.** `coalfaceMode: auto` (the default) lets the agent judge — any fan-out of ≥ `autoFanoutFloor` units (default 4) rides the contract; 1-2-sub ad-hoc spawns keep zero ceremony. `on` scouts every prompt; `off` removes CoalFace entirely. Manual **`/coalface`** convenes it in any mode except `off`. There is no pre-pay gate: your command IS the consent — a solo run would burn a comparable **dollar** budget silently, and the wallet caps the swarm's dollar cost at ~that — so transparency arrives as the receipt.

**The wallet — a DOLLAR bound, not a token one.** The whole swarm — scout + workers + apply — fits inside the estimated solo **dollar** cost, NOT its token count. Raw tokens run *higher* than solo: fan-out multiplies the fixed ~per-sub baseline by N (the [benchmark](https://github.com/TheColliery/.github/blob/main/benchmarks/CoalFace/RESULTS.md) measured ~5.3× solo tokens on a small 6-spot job). What holds the *dollar* line is that Claude Code's cheap worker tiers cost ~5× less per token — so N cheap workers can undercut one expensive solo main (the benchmark: −15% in $). The shared-digest, min-unit floor, and no-self-retry rule (a per-worker-return journal + at most one re-spawn on the remainder) keep that overhead *bounded* — the guarantee is "≤ solo **in dollars**, much faster, QC'd", never "fewer tokens".

**No worksite "breaks."** The scout classifies the shape and routes it to a safe mode:

| Worksite shape | Mode |
|---|---|
| Disjoint spots (flat) | Full parallel waves — worker count = spot count (floor/width-bounded) |
| Dependency chain | Topologically-ordered waves; a full chain = pipeline degrade (discipline kept; honesty: no speedup) |
| Global invariant (glossary/style/totals) | Lock first → ship in the shared-digest → consistency sweep at the end |
| Holistic quality (voice/architecture) | Analyze-swarm only — ONE voice writes |
| Side-effects | Closed by propose-not-execute — side-effects fire only at the consented apply |
| Non-decomposable | Honest refusal: "not swarmable — solo" |

**The QC ceiling (honesty).** QC is mechanical. An in-scope, on-spec, semantically-WRONG return with no covering test can pass — the receipt flags those test-uncovered spots, and the escalation for that class is [CoalBoard](https://github.com/TheColliery/CoalBoard) (the error-not-allowed lane), never another swarm. On error-not-allowed work CoalBoard wins outright: critical work goes to consensus, not throughput.

## 🖥️ Compatibility

| Platform | Support | What you get |
|---|---|---|
| **Claude Code** | ✅ **validated** | One-command plugin install; the SessionStart conductor injects the standing discipline; [CoalTipple](https://github.com/TheColliery/CoalTipple) (if installed) adds delegate-down worker tiering — a cost bonus, never a gate, and its sensitive-unit rule (crypto/auth/payment/migration stays main-tier) is inherited even when it's absent. |
| **Antigravity** | **design-supported** (swarm unrun there) · auto conductor **wired** | The same skill-file contract as the row below — manual `/coalface` is the entry there. AG 2.0 shipped a real hook engine, so the standing `auto` conductor is wired for it — a one-time copy of [`platform-configs/hooks.json`](platform-configs/hooks.json) (see Install). **wired** = built + hermetically tested against the empirically-verified AG hook spec (pilot 2026-07-12, docs-corroborated 2026-07-13); live delivery is not yet validated — and an AG update between 2026-07-12 and 2026-07-16 regressed the hook engine (known wires currently inert; re-verify pending), so manual `/coalface` is the reliable floor. |
| **Other concurrent-subagent platforms** (Cursor, Codex, Copilot, Amp, Goose, …) | **design-supported** (swarm unrun there) | The skill file is the whole contract — workers spawn via the platform's native subagent tool, no API. Hooks and plugin commands are Claude-Code-only there, so there is no standing `auto` directive: install the skill (or point your agent at it) and convene it on bulk work. On a platform we have not run a swarm on, the contract itself says to treat width/nesting conservatively. |
| **claude.ai** (web / desktop app) | ⚠️ Sequential degrade | No subagents there — the contract's built-in degrade path runs instead (scout → units in order → QC → apply): the discipline without the parallel speed. Zip `skills/coalface` and upload as a custom skill — steps: [CLAUDE-AI-INSTALL](https://github.com/TheColliery/.github/blob/main/CLAUDE-AI-INSTALL.md). |
| **No concurrent fan-out** | Sequential degrade | The same contract runs as a pipeline (scout → units in order → QC → apply) — no speedup, discipline kept, never broken. |

Workers default to a main-equivalent model on every platform — capability never depends on Claude Code; only the cheap-worker cost option does.

## 🚀 Install

**Claude Code** — one command (also wires the SessionStart conductor + `/coalface:update`):

```bash
claude plugin marketplace add TheColliery/CoalFace
claude plugin install coalface@coalface
```

**Antigravity** — *design-supported; the swarm is e2e-proven only on Claude Code — re-verify on yours.* Antigravity has no plugin manager: a skill is installed by copying its folder into a customizations root, which Antigravity auto-discovers at session start (no install command, no manifest):

```powershell
git clone https://github.com/TheColliery/CoalFace.git --depth 1
# global (all workspaces):
Copy-Item -Recurse CoalFace/skills/coalface "$env:USERPROFILE\.gemini\config\skills\coalface"
# — or per-project: copy into <your-repo>\.agents\skills\coalface instead
Remove-Item -Recurse -Force CoalFace   # optional cleanup
```

Start a new Antigravity session; `coalface` appears in the skills list, and `/coalface` convenes it manually.

**Auto conductor on AG (wired — live AG validation pending):** AG 2.0 shipped a real hook engine, so the standing `auto` directive can now ride Antigravity too. Keep the clone (the adapter is [`hooks/ag-conductor.js`](hooks/ag-conductor.js), which requires its sibling [`hooks/coalface-conductor.js`](hooks/coalface-conductor.js)) — or copy the `hooks/` folder wherever you keep the skill — then copy [`platform-configs/hooks.json`](platform-configs/hooks.json) to `<workspace>/.agents/hooks.json` (per project) or `~/.gemini/config/hooks.json` (global) and replace `__COALFACE_DIR__` with the directory holding `hooks/`. The directive rides the first `PreInvocation` of a session (AG never fires `SessionStart`), at most once per session; delivery into the agent is not yet live-validated (the **wired** tier — defined in the Compatibility table), and an AG update between 2026-07-12 and 2026-07-16 regressed the hook engine itself (previously-confirmed wires currently inert; re-verify pending) — so manual `/coalface` remains the reliable floor. `/coalface:update` stays Claude-Code-only (the self-update nudge is deliberately not ported — its payload is a CC plugin command; on AG, update by re-copying).

**Other concurrent-subagent platforms** (Cursor, Codex, Copilot, Gemini CLI, Cline, Amp, Goose, … — *design-supported; swarm e2e-proven only on Claude Code*) — the skill file is the whole contract: point your agent at [`skills/coalface/SKILL.md`](skills/coalface/SKILL.md) (it convenes via your platform's native subagent tool, no API; no one-command installer, and hooks + `/coalface:update` are Claude-Code-only there). Gemini CLI's parallel subagents are now first-party official (`/agents`) — business Standard/Enterprise plans only (individual tiers lost access 2026-06-18). **The fan-out discipline is cross-agent by design but proven only on Claude Code — re-verify concurrent-subagent support on yours.** A platform with no concurrent fan-out runs the same contract as a sequential pipeline (no speedup, discipline kept).

## ⚙️ Configure

Everything is tunable in `.coalface.json` — global `~/.claude/.coalface.json` overlaid per key by the nearest project `.coalface.json` (project wins; the lookup walks up from the cwd and stops at your home dir), so you can **tune or shut off a globally-installed skill per project** (off-switch: `coalfaceMode: off`). Every key is optional; an out-of-range value clamps to its default on read. The high-impact keys:

| Key | Default | What it does |
|---|---|---|
| `coalfaceMode` | `auto` | The discipline mode. `auto` — the agent judges; any fan-out of ≥ `autoFanoutFloor` units rides the contract. `on` — scout every prompt. `off` — CoalFace fully out; your platform's native fan-out untouched. |
| `bandwidth` | `25` | Percent of the platform's available subagent width a wave may use (`100` = saturate — starves every sibling session; never the default). Orthogonal to the wallet: how FAST the same budget burns, never how much. |
| `autoFanoutFloor` | `4` | Fan-out size (units) at/above which an `auto`-mode fan-out must ride the contract; below it, 1-2-sub ad-hoc spawns keep zero ceremony. |

Full key reference: every key + default lives in [`scripts/lib/config-schema.mjs`](scripts/lib/config-schema.mjs) and the commented template [`platform-configs/.coalface.json`](platform-configs/.coalface.json).

## 📊 Benchmark

**Fan-out cost, measured (2026-07-03, beta.2).** On a 6-spot shared-context job: fanning out costs **more raw tokens** than solo — the per-sub baseline × N (ad-hoc 4.2×, CF-with-scout 5.3×). In **dollars**, cheap-tier fan-out lands **−15% vs a solo Opus main** (Haiku workers are ~5× cheaper/token) — but CF's scout is overhead that only pays back above a shared-context threshold, so on THIS small job CF itself costs a little MORE than plain ad-hoc. CF's real lever is **coarse packing** (fewest cheap workers): 2×3 workers = **−67% tokens vs naive ad-hoc**, the cheapest arm overall. The wallet is a **$-via-cheap-tier + right-sizing** bound, not a token saving vs solo. Full table + caveats: [`TheColliery/.github/benchmarks/CoalFace`](https://github.com/TheColliery/.github/tree/main/benchmarks/CoalFace). (Measured at beta.2; CoalFace graduated to stable on its first real full-pipeline run — a 15-spot, 5-repo doc-conform sweep, 2026-07-09 — whose receipt matched this benchmark's honest frame: discipline and QC are the value, not a token saving.)

The structure sets the shape:

- **Wall-clock saturates at wave width.** Wall ≈ ceil(N / width) × unit-time — a 100-spot job at width 4 runs ~25 waves, not 100× faster; slicing finer than ~2-4× the width buys nothing, and a full dependency chain degrades to a pipeline with **no speedup at all**.
- **The wallet is a DOLLAR bound, not free.** Spawn overhead is real and raw tokens run *higher* than solo; the invariant is that the swarm's **dollar** cost fits inside the estimated solo dollar cost — "about solo cost in $, much faster, with QC", never "fewer tokens".

## 🧭 Part of TheColliery

CoalFace is the **fan-out discipline** of the mining series, alongside [CoalMine](https://github.com/HetCreep/CoalMine) (quality canaries), [CoalTipple](https://github.com/TheColliery/CoalTipple) (model/effort routing), [CoalBoard](https://github.com/TheColliery/CoalBoard) (consensus & debate), [CoalHearth](https://github.com/TheColliery/CoalHearth) (session warm-resume), [CoalWash](https://github.com/TheColliery/CoalWash) (memory defrag), and [CoalLedger](https://github.com/TheColliery/CoalLedger) (docs health). Install one and it stands alone; install all and they compose without conflict — CoalBoard wins on error-not-allowed work (consensus, not throughput; CoalFace may serve as its apply-hand after), CoalTipple tiering is an optional worker-cost bonus. Shared doctrine: Phoenix-13 hooks (zero-dependency, no network, fail-silent, no child processes, deterministic), single-source-of-truth config schemas, and a strict no-overkill discipline. Series doctrine: [`TheColliery/.github`](https://github.com/TheColliery/.github).

Zero-dependency, offline, no API keys.

---

## 📄 License

Apache License 2.0. See [LICENSE](LICENSE).
