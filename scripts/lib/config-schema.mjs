// Single source of truth for every .coalface.json key (flat, mirrors CoalTipple's
// config-schema.mjs pattern). verify.mjs validates the factory config against it —
// a key added here is automatically validated and documented. No speculative keys:
// every key has a live consumer (the conductor hook or the SKILL contract).
//
// Spec fields:
//   key     canonical .coalface.json key
//   type    'int' | 'enum'
//   min/max bounds for 'int'
//   values  allowed values for 'enum' (compared case-insensitively)
//   help    one-line description

export const CONFIG_SCHEMA = [
  { key: 'coalfaceMode', type: 'enum', values: ['auto', 'on', 'off'], help: 'Fan-out discipline mode: auto (default — a fan-out of >= autoFanoutFloor units rides the /coalface contract), on (scout every prompt, fan out everything decomposable), off (CoalFace fully out; native fan-out untouched)' },
  { key: 'bandwidth', type: 'int', min: 1, max: 100, help: 'Percent of the platform\'s available subagent width a wave may use (effective width = floor(platform width x bandwidth%)). 100 = saturate — fastest AND starves every sibling session on the box; never the default. Orthogonal to the wallet (speed of burn, not amount). Range 1-100, default 25' },
  { key: 'autoFanoutFloor', type: 'int', min: 1, max: 50, help: 'Fan-out size (units) at/above which an auto-mode fan-out must ride the CoalFace contract; below it, 1-2-sub ad-hoc spawns keep zero ceremony. Range 1-50, default 4' },
  { key: 'updateMode', type: 'enum', values: ['ask', 'auto', 'remind', 'off'], help: 'Self-update behavior at session start (ask, auto, remind, off). The hook never networks — the agent verifies + offers, consent-gated. Orthogonal to coalfaceMode — its own off-switch. Default ask' },
  { key: 'updateCheckDays', type: 'int', min: 1, max: 365, help: 'Days between self-update checks/reminders (range 1-365; the hook CLAMPS an out-of-range value to the default on read). Default 14' },
];

// Validate an already-parsed JSON value against a spec entry.
// Returns an error message fragment ("must be ...") or null when valid.
export function validateValue(spec, v) {
  switch (spec.type) {
    case 'int':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'must be a finite number';
      if (!Number.isInteger(v)) return 'must be an integer';
      if (spec.min != null && v < spec.min) return `must be >= ${spec.min}`;
      if (spec.max != null && v > spec.max) return `must be <= ${spec.max}`;
      return null;
    case 'enum':
      return typeof v === 'string' && spec.values.includes(v.toLowerCase())
        ? null
        : `must be one of: ${spec.values.join(', ')}`;
    default:
      return `has an unknown spec type '${spec.type}'`;
  }
}

// Validate a full parsed config object. Unknown keys are reported, never thrown
// (fail loud at the gate, degrade silent in the hook — the hook clamps on read).
export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return ['config must be a JSON object'];
  for (const [key, v] of Object.entries(cfg)) {
    const spec = CONFIG_SCHEMA.find((s) => s.key === key);
    if (!spec) { errors.push(`'${key}' not in schema`); continue; }
    const err = validateValue(spec, v);
    if (err) errors.push(`'${key}' ${err}`);
  }
  return errors;
}
