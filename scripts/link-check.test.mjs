import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractHeadingSlugs, extractLinks, checkFile, checkFiles } from './lib/link-check.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'scripts', 'link-check.mjs');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repo, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// extractHeadingSlugs — GitHub's dedup-with-suffix behaviour is the sharp case: this
// room's own CHANGELOG.md repeats "### Fixed"/"### Added" every release.
// ---------------------------------------------------------------------------

test('extractHeadingSlugs: a plain ATX heading slugs to lowercase-hyphenated', () => {
  const slugs = extractHeadingSlugs('# A Real Heading\n');
  assert.ok(slugs.has('a-real-heading'));
});

test('extractHeadingSlugs: a repeated heading is numbered -1, -2, ... on each further repeat', () => {
  const slugs = extractHeadingSlugs('### Fixed\n\ntext\n\n### Fixed\n\nmore\n\n### Fixed\n');
  assert.deepEqual([...slugs].sort(), ['fixed', 'fixed-1', 'fixed-2']);
});

test('extractHeadingSlugs: a heading inside a fenced code block is not a real heading', () => {
  const slugs = extractHeadingSlugs('```\n# Not A Heading\n```\n');
  assert.equal(slugs.size, 0);
});

test('extractHeadingSlugs: punctuation is stripped, brackets and periods included', () => {
  const slugs = extractHeadingSlugs('## [0.9.0] - 2026-09-10\n');
  assert.ok(slugs.has('090---2026-09-10'), `got: ${[...slugs]}`);
});

// r33 bounce1 F1 — GitHub's real heading-to-slug algorithm KEEPS non-ASCII letters/numbers;
// the pre-fix `\w`-based strip is ASCII-only and collapses any Thai/CJK heading to the empty
// string, so two distinct non-ASCII headings collided into "" and "-1" — a false positive on
// a link that renders and resolves correctly on GitHub. Probes are the reviewer's own.

test('extractHeadingSlugs: a Thai heading keeps its script (GitHub does not delete non-ASCII)', () => {
  const slugs = extractHeadingSlugs('# ภาษาไทย\n');
  assert.ok(slugs.has('ภาษาไทย'), `got: ${JSON.stringify([...slugs])}`);
});

test('extractHeadingSlugs: a CJK heading keeps its script', () => {
  const slugs = extractHeadingSlugs('# 概要\n');
  assert.ok(slugs.has('概要'), `got: ${JSON.stringify([...slugs])}`);
});

test('extractHeadingSlugs: two distinct non-ASCII headings do not collide into "" / "-1"', () => {
  const slugs = extractHeadingSlugs('# ภาษาไทย\n\ntext\n\n# 概要\n');
  assert.deepEqual([...slugs].sort(), ['ภาษาไทย', '概要'].sort());
});

test('extractHeadingSlugs: an emoji heading still drops the emoji — GitHub agrees here, must not regress', () => {
  const slugs = extractHeadingSlugs('# 🤝 Proposing a Change\n');
  assert.ok(slugs.has('proposing-a-change'), `got: ${JSON.stringify([...slugs])}`);
});


// r33 bounce2 M1 -- p{M} alone is TOO WIDE: it also keeps VARIATION SELECTOR-16 (Mn) and
// COMBINING ENCLOSING KEYCAP (Me), both DEFAULT-IGNORABLE/enclosing marks GitHub strips.
// This room's own house-style headings are an emoji immediately followed by VS16
// (README's H1 among them) -- built from code points, never a pasted glyph, so the
// invisible character under test is legible in the test's own source.

test('extractHeadingSlugs: an emoji+VS16 heading (this rooms own house style) drops the WHOLE emoji, matching GitHub -- not a leading invisible character', () => {
  const pick = String.fromCodePoint(0x26CF, 0xFE0F); // pickaxe + VARIATION SELECTOR-16
  const slugs = extractHeadingSlugs(`# ${pick} CoalFace
`);
  assert.ok(slugs.has('coalface'), `got: ${JSON.stringify([...slugs])}`);
});

test('extractHeadingSlugs: a second emoji+VS16 heading, same shape, same result', () => {
  const gear = String.fromCodePoint(0x2699, 0xFE0F); // gear + VARIATION SELECTOR-16
  const slugs = extractHeadingSlugs(`# ${gear} Configure
`);
  assert.ok(slugs.has('configure'), `got: ${JSON.stringify([...slugs])}`);
});

test('extractHeadingSlugs: a keycap emoji (digit + VS16 + COMBINING ENCLOSING KEYCAP, category Me) keeps the digit, drops the keycap marks', () => {
  const keycap1 = '1' + String.fromCodePoint(0xFE0F, 0x20E3);
  const slugs = extractHeadingSlugs(`# ${keycap1} First
`);
  assert.ok(slugs.has('1-first'), `got: ${JSON.stringify([...slugs])}`);
});

test('extractHeadingSlugs: the live README.md H1 slugs to what GitHub renders, not a synthetic fixture', () => {
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  const h1 = readme.match(/^#\s+(.+)$/m);
  assert.ok(h1, 'README.md must have an H1 to test against');
  const slugs = extractHeadingSlugs(`# ${h1[1]}
`);
  const msg = "README.md's own H1 (" + JSON.stringify(h1[1]) + ") must slug to 'coalface' (GitHub's own render) -- got: " + JSON.stringify([...slugs]);
  assert.ok(slugs.has('coalface'), msg);
});
// ---------------------------------------------------------------------------
// extractLinks — parsing only; classification (external/root-relative/anchor) is
// checkFile's job, tested below.
// ---------------------------------------------------------------------------

test('extractLinks: an inline link is split into target + anchor with a 1-based line number', () => {
  const links = extractLinks('line one\n[text](./x.md#slug)\n');
  assert.deepEqual(links, [{ line: 2, target: './x.md', anchor: 'slug' }]);
});

test('extractLinks: a link with no anchor has anchor === null', () => {
  const links = extractLinks('[text](./x.md)\n');
  assert.equal(links[0].anchor, null);
});

test('extractLinks: an example link literal inside single backticks is not extracted', () => {
  const links = extractLinks('a real example: `[Name](url)` — see above\n');
  assert.deepEqual(links, []);
});

// r33 bounce1 F2 — only ``` fences were neutralized; CommonMark's ~~~ fence form is equally
// real markdown and a link literal shown inside one false-flagged as a real link.

test('extractHeadingSlugs: a heading inside a ~~~ tilde fence is not a real heading', () => {
  const slugs = extractHeadingSlugs('~~~\n# Not A Heading\n~~~\n');
  assert.equal(slugs.size, 0);
});

test('extractLinks: a link literal inside a ~~~ tilde fence is not extracted', () => {
  const links = extractLinks('~~~\n[text](./x.md)\n~~~\n');
  assert.deepEqual(links, []);
});

test('extractLinks: an image link is extracted the same as a text link', () => {
  const links = extractLinks('![alt](./pic.png)\n');
  assert.equal(links[0].target, './pic.png');
});

// ---------------------------------------------------------------------------
// checkFile — pure, DI'd. No real fs anywhere in this block.
// ---------------------------------------------------------------------------

function stubIO({ files = {}, dirs = new Set() } = {}) {
  return {
    // path.posix, not path.resolve — this unit test's fake paths ('/repo/a.md') are
    // POSIX-shaped and must resolve identically on every OS this suite runs on; the real
    // CLI (scripts/link-check.mjs) uses native path.resolve against REAL platform paths.
    resolveTarget: (fromFile, target) => path.posix.resolve(path.posix.dirname(fromFile), target),
    stat: (p) => {
      if (dirs.has(p)) return { isFile: false, isDir: true };
      if (Object.prototype.hasOwnProperty.call(files, p)) return { isFile: true, isDir: false };
      return null;
    },
    readText: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
  };
}

test('checkFile: a relative link to a non-existent file is a finding', () => {
  const findings = checkFile('/repo/a.md', '[x](./missing.md)\n', stubIO());
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /does not exist/);
});

test('checkFile: a relative link to an existing file is clean', () => {
  const io = stubIO({ files: { '/repo/b.md': '# B\n' } });
  const findings = checkFile('/repo/a.md', '[x](./b.md)\n', io);
  assert.equal(findings.length, 0);
});

test('checkFile: a same-file anchor with no matching heading is a finding', () => {
  const findings = checkFile('/repo/a.md', '# A\n[x](#nope)\n', stubIO());
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no matching heading in this file/);
});

test('checkFile: a same-file anchor matching a real heading is clean', () => {
  const findings = checkFile('/repo/a.md', '# A Heading\n[x](#a-heading)\n', stubIO());
  assert.equal(findings.length, 0);
});

// r33 bounce1 F1b (head's own finding) — GitHub's own "copy link to heading" percent-encodes
// a non-ASCII anchor; the raw markdown source can carry EITHER form (a literal non-ASCII
// anchor typed by hand, or GitHub's own percent-encoded copy-paste), and both must resolve
// against the same (un-encoded) heading slug set.

test('checkFile: a literal non-ASCII same-file anchor resolves directly', () => {
  const findings = checkFile('/repo/a.md', '# หัวข้อ ไทย\n[x](#หัวข้อ-ไทย)\n', stubIO());
  assert.equal(findings.length, 0);
});

test('checkFile: a percent-encoded same-file anchor (GitHub "copy link" form) decodes and resolves against the same heading', () => {
  const findings = checkFile(
    '/repo/a.md',
    '# หัวข้อ ไทย\n[thai](#%E0%B8%AB%E0%B8%B1%E0%B8%A7%E0%B8%82%E0%B9%89%E0%B8%AD-%E0%B9%84%E0%B8%97%E0%B8%A2)\n',
    stubIO(),
  );
  assert.equal(findings.length, 0, `got: ${JSON.stringify(findings)}`);
});

test('checkFile: a malformed percent-encoded anchor never throws, and reports as a normal unresolved anchor', () => {
  assert.doesNotThrow(() => checkFile('/repo/a.md', '# A\n[x](#%zz)\n', stubIO()));
  const findings = checkFile('/repo/a.md', '# A\n[x](#%zz)\n', stubIO());
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no matching heading in this file/);
});

test('checkFile: a cross-file anchor with no matching heading in the target is a finding', () => {
  const io = stubIO({ files: { '/repo/b.md': '# B\n' } });
  const findings = checkFile('/repo/a.md', '[x](./b.md#nope)\n', io);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no matching heading in `\.\/b\.md`/);
});

test('checkFile: a cross-file anchor matching a real heading in the target is clean', () => {
  const io = stubIO({ files: { '/repo/b.md': '# The Target\n' } });
  const findings = checkFile('/repo/a.md', '[x](./b.md#the-target)\n', io);
  assert.equal(findings.length, 0);
});

test('checkFile: an external link is never fetched and never flagged, even with a bad path shape', () => {
  const findings = checkFile('/repo/a.md', '[x](https://example.com/does-not-exist)\n', stubIO());
  assert.equal(findings.length, 0);
});

test('checkFile: a root-relative link is out of scope by design and never flagged', () => {
  const findings = checkFile('/repo/a.md', '[x](/does-not-exist)\n', stubIO());
  assert.equal(findings.length, 0);
});

test('checkFile: a link to an existing directory is clean, anchor check skipped', () => {
  const io = stubIO({ dirs: new Set(['/repo/dir']) });
  const findings = checkFile('/repo/a.md', '[x](./dir#anything)\n', io);
  assert.equal(findings.length, 0);
});

test('checkFile: a link to an existing non-markdown file with an anchor skips the anchor check', () => {
  const io = stubIO({ files: { '/repo/x.mjs': 'code' } });
  const findings = checkFile('/repo/a.md', '[x](./x.mjs#anything)\n', io);
  assert.equal(findings.length, 0);
});

test('checkFiles: an unreadable file is one finding, not a crash, and does not lose other files', () => {
  const io = stubIO({ files: { '/repo/ok.md': '[x](./ok.md)\n' } });
  const findings = checkFiles(['/repo/missing.md', '/repo/ok.md'], { ...io, readText: (p) => (p === '/repo/ok.md' ? '# ok\n' : null) });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, '/repo/missing.md');
  assert.match(findings[0].message, /could not be read/);
});

// ---------------------------------------------------------------------------
// Hermetic spawn tests — the real CLI, real fixture files on disk. RED-PROVE BOTH
// DIRECTIONS per the r33 order: exit 1 against real broken links, exit 0 against this
// room's actual tracked docs.
// ---------------------------------------------------------------------------

test('link-check.mjs: no args prints usage and fails loud', () => {
  const r = run([]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: node scripts\/link-check\.mjs/);
});

test('link-check.mjs: the planted-defect fixture FAILs with exactly its 3 named defects, controls unflagged', () => {
  const r = run(['scripts/fixtures/link-check-defects.md']);
  assert.equal(r.status, 1, `must exit 1 against real broken links, got:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /does not exist$/m);
  assert.match(r.stdout, /no matching heading in this file/);
  assert.match(r.stdout, /no matching heading in `\.\/link-check-target\.md`/);
  assert.match(r.stdout, /^3 finding\(s\) across 1 file\(s\)$/m,
    `exactly the 3 planted defects, none of the 6 controls (external/root-relative/anchors/backticked-example), got:\n${r.stdout}`);
});

test('link-check.mjs: the clean target fixture alone is 0 findings, exit 0', () => {
  const r = run(['scripts/fixtures/link-check-target.md']);
  assert.equal(r.status, 0, `got:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /^0 finding\(s\) across 1 file\(s\)$/m);
});

test('link-check.mjs: this room\'s actual tracked-and-shipped docs are clean, exit 0', () => {
  // Mirrors the workflow's own derivation — never hand-kept, re-derived at test time so a
  // new doc is covered automatically and this test cannot silently drift narrower than CI.
  const ls = spawnSync('git', ['ls-files', '*.md'], { cwd: repo, encoding: 'utf8' });
  const files = ls.stdout.trim().split('\n').filter(Boolean)
    .filter((f) => !f.startsWith('plugin/') && !f.startsWith('scripts/fixtures/'));
  assert.ok(files.length > 0, 'the derived scope must not be empty, or this test proves nothing');
  const r = run(files);
  assert.equal(r.status, 0, `this room's own shipped docs must be link-clean, got:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /^0 finding\(s\)/m);
});
