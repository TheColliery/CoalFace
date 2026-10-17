# Link-check fixture — DELIBERATE DEFECTS, do not fix

Referenced by `scripts/link-check.test.mjs` and excluded from the real gate by
`.github/workflows/link-check.yml`'s own `scripts/fixtures/**` scope exclusion. Every
defect below is INTENTIONAL — this file's whole job is to go RED.

## Defects (must FAIL)

1. Missing file: [nowhere](./does-not-exist.md)
2. Missing same-file anchor: [nope](#does-not-exist)
3. Missing cross-file anchor: [nope too](./link-check-target.md#does-not-exist)

## Controls (must NOT FAIL)

4. External link, never fetched: [ok](https://example.com/nope)
5. Root-relative, out of scope by design: [ok too](/does-not-exist)

## A Real Heading

6. Good same-file anchor: [ok](#a-real-heading)
7. Good cross-file link+anchor: [ok](./link-check-target.md#a-real-heading)
8. Good plain relative link: [ok](./link-check-target.md)
9. A link shown as a literal EXAMPLE inside backticks, never a real link:
   `[Name](url)` — must NOT be flagged.
