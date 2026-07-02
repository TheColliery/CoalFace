# CoalFace receipt + heads-up formats

Both are USER-FACING: speak the user's language (auto-detect from their messages), keep
technical terms verbatim (paths, config keys, model/tier names). Plain wording first —
a layman reads the receipt without knowing what a "wave" is; the compact block below the
plain summary serves the programmer.

## The heads-up (conditional, NON-blocking)

Fires only when the scout finds the job MUCH bigger than the prompt implies (the swarm
finishes before a human could react, so this one line restores the Esc brake a slow solo
run gives for free). ONE line, then proceed — NEVER a question-box, never a wait:

- EN: `[CoalFace] Found 87 spots (~3x what the prompt implies), est ~140k tokens — starting now; Esc to stop.`
- TH-style plain: `[CoalFace] เจอ 87 จุด (~3 เท่าของที่สั่ง) ประมาณ ~140k tokens — เริ่มเลยนะ กด Esc ถ้าจะหยุด`

## The receipt (always, post-run)

Plain summary first (2-4 lines, the user's language), then the compact block. Every line
maps to a wallet/QC/journal fact — no marketing.

Plain-summary examples:

- EN: `Done: 87 of 87 spots applied. Used 61 workers in 5 waves (width settled at 6/14 —
  account tier). Whole swarm ~128k tokens vs ~150k solo estimate. 2 items quarantined
  (spec check failed twice) — listed below for your call. 3 spots have no covering test —
  worth a look.`
- TH-style plain: `เสร็จแล้ว: ลง 87 จาก 87 จุด ใช้คนงาน 61 ตัวใน 5 รอบ (ความกว้างจริง 6/14 —
  ระดับบัญชี) ทั้งฝูงใช้ ~128k tokens เทียบกับประมาณเดี่ยว ~150k มี 2 ชิ้นถูกกักไว้
  (ตรวจสเปกไม่ผ่านสองครั้ง) — ลิสต์ไว้ให้ตัดสินใจ และมี 3 จุดที่ไม่มีเทสต์คุม — ควรดูเอง`

Compact block (English keys, always the same shape):

```text
[CoalFace] RECEIPT
Task        : <one line>
Spots       : <found> found -> <units> units (merged <n> overlaps, <n> tiny)
Workers     : <spawned> spawned · <ok> ok · <reworked> reworked once · <quarantined> quarantined
Waves       : <n>   Effective width: <settled>/<platform cap> (<why, e.g. "account tier" | "as configured">)
Tokens      : swarm ~<Y> vs solo est ~<X>  (wallet: Y <= X)
Applied     : <n> orders · <n> skip-and-flag (anchor miss) · gate: <PASS | RED -> rolled back>
Quarantined : <unit>: <reason>  (one line each; empty -> "none")
Uncovered   : <spots with no covering test; empty -> "none">
Friction    : <worker friction-line themes, if any -> feeds contract tightening>
```

Field notes:

- **Effective width** shows the AIMD-settled value, not the configured wish — `6/14 —
  account tier` tells the user their `bandwidth` % settled at real capacity (correct
  behavior, not an error).
- **Tokens vs solo** is an ESTIMATE both sides (char-heuristic class) — honest wording:
  "~" always, never a precise claim.
- **Quarantined** items are the human's queue: each carries the unit, the QC reason, and
  the worker's last return location (journal) so the human can finish or drop it.
- **Uncovered** = the honest ceiling made visible: in-scope, on-spec, semantically-wrong
  work with no covering test WOULD pass QC — these spots are where that risk lives. The
  escalation for that class is CoalBoard, not another swarm.
- A PARTIAL/rolled-back run keeps the same shape — `Applied` says what rolled back and the
  journal preserves every returned order for a re-run on the remainder.
