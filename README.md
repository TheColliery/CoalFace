<div align="center">

# ⛏️ CoalFace

> *A coal face is the active surface of the seam — the one place the whole crew swarms to cut coal.* This one disciplines your agent's swarm.

**A fan-out discipline for swarm work.** When a task decomposes into many units — a bulk refactor, a repo-wide sweep, a 100-spot edit, a corpus batch — CoalFace runs the fan-out as a disciplined factory instead of an ad-hoc swarm: a mandatory scout, a deterministic partition, workers returning anchor-edit orders as text, mechanical QC at collection, one writer applying behind a snapshot, and a receipt at the end.

![version](https://img.shields.io/github/v/tag/TheColliery/CoalFace?label=version&color=blue&include_prereleases)
![license](https://img.shields.io/badge/license-Apache_2.0-blue)
![status](https://img.shields.io/badge/status-beta-orange)

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md) · [Releases](https://github.com/TheColliery/CoalFace/releases)

**Part of [TheColliery](https://github.com/TheColliery)** — siblings: **[CoalMine](https://github.com/HetCreep/CoalMine)** (quality canaries) · **[CoalTipple](https://github.com/TheColliery/CoalTipple)** (model/effort routing) · **[CoalBoard](https://github.com/TheColliery/CoalBoard)** (consensus board) · **[CoalHearth](https://github.com/TheColliery/CoalHearth)** (session warm-resume).

</div>

---

## ⛏️ What it is

Agents already fan work out to subagents — CoalFace does not invent that. It disciplines it. An ad-hoc fan-out makes the same three promises with **no guarantee**; CoalFace makes them **enforced by structure**:

| Promise | Ad-hoc fan-out | CoalFace |
|---|---|---|
| **Tokens** | UNBOUNDED — uncontrolled spawn overhead, N workers re-reading the same files, retry storms, stray runaway workers | BOUNDED ≈ the solo estimate — wallet + shared-digest + min-unit floor + no self-retry |
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

**Activation.** `coalfaceMode: auto` (the default) lets the agent judge — any fan-out of ≥ `autoFanoutFloor` units (default 4) rides the contract; 1-2-sub ad-hoc spawns keep zero ceremony. `on` scouts every prompt; `off` removes CoalFace entirely. Manual **`/coalface`** convenes it in any mode except `off`. There is no pre-pay gate: your command IS the consent — a solo run would burn the same budget silently, and the wallet caps the swarm at that budget — so transparency arrives as the receipt.

**The wallet.** The whole swarm — scout + workers + apply — fits inside the estimated solo cost: split the solo budget across the ants, never a new budget on top. It holds because workers carry no accumulated context (a solo run's late units drag the whole history; swarm units don't) and, on Claude Code, cheap worker tiers cost less per token — guarded by the shared-digest, the min-unit floor, and a no-self-retry rule (a per-worker-return journal + at most one re-spawn on the remainder).

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
| **Claude Code** | ✅ Full | One-command plugin install; the SessionStart conductor injects the standing discipline; [CoalTipple](https://github.com/TheColliery/CoalTipple) (if installed) adds delegate-down worker tiering — a cost bonus, never a gate, and its sensitive-unit rule (crypto/auth/payment/migration stays main-tier) is inherited even when it's absent. |
| **Other concurrent-subagent platforms** (Antigravity, Cursor, Codex, Copilot, Amp, Goose, …) | Design-supported, **unverified** | The skill file is the whole contract — workers spawn via the platform's native subagent tool, no API. Hooks and plugin commands are Claude-Code-only, so there is no standing `auto` directive: install the skill (or point your agent at it) and convene it on bulk work. On a platform we have not run a swarm on, the contract itself says to treat width/nesting conservatively. |
| **No concurrent fan-out** | Sequential degrade | The same contract runs as a pipeline (scout → units in order → QC → apply) — no speedup, discipline kept, never broken. |

Workers default to a main-equivalent model on every platform — capability never depends on Claude Code; only the cheap-worker cost option does.

## 🚀 Install

**Claude Code** — one command (also wires the SessionStart conductor + `/coalface:update`):

```bash
claude plugin marketplace add TheColliery/CoalFace
claude plugin install coalface@coalface
```

**Antigravity** — *design-supported, unverified.* Antigravity has no plugin manager: a skill is installed by copying its folder into a customizations root, which Antigravity auto-discovers at session start (no install command, no manifest):

```powershell
git clone https://github.com/TheColliery/CoalFace.git --depth 1
# global (all workspaces):
Copy-Item -Recurse CoalFace/skills/coalface "$env:USERPROFILE\.gemini\config\skills\coalface"
# — or per-project: copy into <your-repo>\.agents\skills\coalface instead
Remove-Item -Recurse -Force CoalFace   # optional cleanup
```

Start a new Antigravity session; `coalface` appears in the skills list. The conductor hook + `/coalface:update` stay Claude-Code-only (Antigravity has no hooks), so there is no standing `auto` directive — convene it with `/coalface` or by pointing the agent at the skill.

**Other concurrent-subagent platforms** (Cursor, Codex, Copilot, Amp, Goose, … — *design-supported, unverified*) — the skill file is the whole contract: point your agent at [`skills/coalface/SKILL.md`](skills/coalface/SKILL.md) (it convenes via your platform's native subagent tool, no API; no one-command installer, and the conductor hook + `/coalface:update` are Claude-Code-only). **The fan-out discipline is cross-agent by design but proven only on Claude Code — re-verify concurrent-subagent support on yours.** A platform with no concurrent fan-out runs the same contract as a sequential pipeline (no speedup, discipline kept).

## ⚙️ Configure

Everything is tunable in `.coalface.json` — global `~/.claude/.coalface.json` overlaid per key by the nearest project `.coalface.json` (project wins; the lookup walks up from the cwd and stops at your home dir). Every key is optional; an out-of-range value clamps to its default on read. The high-impact keys:

| Key | Default | What it does |
|---|---|---|
| `coalfaceMode` | `auto` | The discipline mode. `auto` — the agent judges; any fan-out of ≥ `autoFanoutFloor` units rides the contract. `on` — scout every prompt. `off` — CoalFace fully out; your platform's native fan-out untouched. |
| `bandwidth` | `25` | Percent of the platform's available subagent width a wave may use (`100` = saturate — starves every sibling session; never the default). Orthogonal to the wallet: how FAST the same budget burns, never how much. |
| `autoFanoutFloor` | `4` | Fan-out size (units) at/above which an `auto`-mode fan-out must ride the contract; below it, 1-2-sub ad-hoc spawns keep zero ceremony. |

Full key reference: every key + default lives in [`scripts/lib/config-schema.mjs`](scripts/lib/config-schema.mjs) and the commented template [`platform-configs/.coalface.json`](platform-configs/.coalface.json).

## 📊 Benchmark

**Fan-out cost, measured (2026-07-03, beta.2).** On a 6-spot shared-context job: fanning out costs **more raw tokens** than solo — the per-sub baseline × N (ad-hoc 4.2×, CF-with-scout 5.3×). In **dollars**, cheap-tier fan-out lands **−15% vs a solo Opus main** (Haiku workers are ~5× cheaper/token) — but CF's scout is overhead that only pays back above a shared-context threshold, so on THIS small job CF itself costs a little MORE than plain ad-hoc. CF's real lever is **coarse packing** (fewest cheap workers): 2×3 workers = **−67% tokens vs naive ad-hoc**, the cheapest arm overall. The wallet is a **$-via-cheap-tier + right-sizing** bound, not a token saving vs solo. Full table + caveats: [`TheColliery/.github/benchmarks/CoalFace`](https://github.com/TheColliery/.github/tree/main/benchmarks/CoalFace). Benchmark ≠ graduation — CF stays beta.

The structure sets the shape:

- **Wall-clock saturates at wave width.** Wall ≈ ceil(N / width) × unit-time — a 100-spot job at width 4 runs ~25 waves, not 100× faster; slicing finer than ~2-4× the width buys nothing, and a full dependency chain degrades to a pipeline with **no speedup at all**.
- **The wallet is a bound, not free.** Spawn overhead is real; the invariant is that the whole swarm fits **inside the estimated solo cost** — "about solo cost, much faster, with QC", never "zero extra tokens".

## 🧭 Part of TheColliery

CoalFace is the **fan-out discipline** of the mining series, alongside [CoalMine](https://github.com/HetCreep/CoalMine) (quality canaries), [CoalTipple](https://github.com/TheColliery/CoalTipple) (model/effort routing), [CoalBoard](https://github.com/TheColliery/CoalBoard) (consensus & debate), and [CoalHearth](https://github.com/TheColliery/CoalHearth) (session warm-resume). Install one and it stands alone; install all and they compose without conflict — CoalBoard wins on error-not-allowed work (consensus, not throughput; CoalFace may serve as its apply-hand after), CoalTipple tiering is an optional worker-cost bonus. Shared doctrine: Phoenix-13 hooks (zero-dependency, no network, fail-silent, no child processes, deterministic), single-source-of-truth config schemas, and a strict no-overkill discipline. Series doctrine: [`TheColliery/.github`](https://github.com/TheColliery/.github).

Zero-dependency, offline, no API keys.

---

## 📄 License

Apache License 2.0. See [LICENSE](LICENSE).
