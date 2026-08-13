// Unit tests for the machine-derived admission-control slot count (board #90).
// Zero-dep (node:test only). No real timers -- concurrent "local gate work" is
// simulated with microtask-boundary yields (deterministic interleaving, no clock).
import { test } from 'node:test';
import assert from 'node:assert';
import { deriveMachineCap, resolveCap, createAdmissionGate } from './admission-control.mjs';

test('deriveMachineCap: formula on a mid-size box', () => {
  // 16 cores, reserve 2, weight 2 -> floor(14/2) = 7
  assert.strictEqual(deriveMachineCap({ cpuCount: 16 }), 7);
});

test('deriveMachineCap: never returns 0 or negative on a starved box', () => {
  assert.strictEqual(deriveMachineCap({ cpuCount: 2 }), 1); // floor(0/2) = 0 -> clamped to 1
  assert.strictEqual(deriveMachineCap({ cpuCount: 1 }), 1); // floor(-1/2) = -1 -> clamped to 1
});

test('deriveMachineCap: clamps at the ceiling on a huge box', () => {
  assert.strictEqual(deriveMachineCap({ cpuCount: 256 }), 16); // floor(254/2) = 127 -> clamped to 16
});

test('deriveMachineCap: custom reserve/weight/ceiling override the defaults', () => {
  assert.strictEqual(deriveMachineCap({ cpuCount: 32, reserve: 4, workerCoreWeight: 4, ceiling: 5 }), 5); // floor(28/4)=7 -> clamped to 5
});

test('deriveMachineCap: rejects a non-positive-integer cpuCount', () => {
  assert.throws(() => deriveMachineCap({ cpuCount: 0 }), RangeError);
  assert.throws(() => deriveMachineCap({ cpuCount: 1.5 }), RangeError);
  assert.throws(() => deriveMachineCap({}), RangeError);
});

test('resolveCap: an explicit positive config value wins over derivation', () => {
  assert.strictEqual(resolveCap(3, { cpuCount: 16 }), 3);
});

test('resolveCap: 0 or absent falls through to deriveMachineCap', () => {
  assert.strictEqual(resolveCap(0, { cpuCount: 16 }), 7);
  assert.strictEqual(resolveCap(undefined, { cpuCount: 16 }), 7);
});

test('createAdmissionGate: rejects a non-positive-integer capacity', () => {
  assert.throws(() => createAdmissionGate(0), RangeError);
  assert.throws(() => createAdmissionGate(-1), RangeError);
});

// The exhibit shape (board #89): more lanes than the cap, none denied, none ever
// concurrent past it. The test tracks concurrency with its OWN counter -- never the
// gate's internal `peak` alone -- so a gate that under-counts its own admissions
// (a bug in the primitive itself, not just in a caller) still gets caught.
test('createAdmissionGate: N workers above capacity queue, none denied, peak never exceeds the cap', async () => {
  const CAPACITY = 5;
  const WORKER_COUNT = 13; // board #89's runtime count, used as the fan-out size here
  const gate = createAdmissionGate(CAPACITY);

  let liveCount = 0;
  let observedPeak = 0;
  let sawQueueing = false;
  const completed = [];

  async function worker(id) {
    if (gate.queued > 0 || gate.current >= CAPACITY) sawQueueing = true;
    await gate.acquire();
    liveCount += 1;
    if (liveCount > observedPeak) observedPeak = liveCount;
    assert.ok(liveCount <= CAPACITY, `over-admission: ${liveCount} concurrent workers with capacity ${CAPACITY}`);
    // simulated local gate work -- microtask-boundary yields, no real clock
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
    liveCount -= 1;
    gate.release();
    completed.push(id);
  }

  await Promise.all(Array.from({ length: WORKER_COUNT }, (_, i) => worker(i)));

  assert.strictEqual(completed.length, WORKER_COUNT, 'every worker completed -- excess queued, none denied');
  assert.ok(observedPeak <= CAPACITY, `peak concurrency ${observedPeak} exceeded capacity ${CAPACITY}`);
  assert.ok(sawQueueing, 'fan-out above capacity should have produced at least one queued admission');
  assert.strictEqual(gate.current, 0, 'gate returns to zero once every worker has released');
});
