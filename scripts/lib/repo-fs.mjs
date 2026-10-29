// CWK2-042 (16f wave 2) -- the parent folder of a project write is made ONLY after the chain from the write root is judged. Ported from CoalLedger's scripts/lib/repo-fs.mjs
// (31a1c3f + ed36168, mkdirRepoParents) into this room's idiom: the refusal is this room's own FAIL line (scripts/configure.mjs), the root is the level the write is contained to.
//
// WHY it is still owed here: configure.mjs pins the write target BEFORE anything is made (containedWriteTarget, 14a), so a link that already exists is refused up front. What
// the up-front pin leaves open is (1) a component that exists and is NOT a folder (a FILE named `.claude`): the pin passes it and the recursive mkdir then fails with a raw
// errno (EEXIST/ENOTDIR), not a sentence a user can act on; and (2) the gap between the pin and the make, where a recursive mkdir would follow a link swapped in. This walk closes
// both: one lstat per component from the root down, a missing component made with a plain NON-recursive mkdir and lstat-ed again right after, so a refused target makes nothing
// beyond a checked component.
//
// Why a non-shipped scripts/lib/ module: configure.mjs is repo tooling (it is not copied into plugin/), so no plugin byte moves and no version follows.
// Residual, named: the walk and the later write are separate acts, so a link swapped in after the last re-check is not caught here (microseconds, as the pin's own residue).
// 17c (c)(d) adds writeFileAtomic: the write itself, per node/runtime.md section 5.
// M8 of the exemplar's mutation table, named as a narrow gap: `dir === root` with the root itself reached through a link returns at once (the root is never walked, so a
// project opened through a linked path keeps working).
import fs from 'node:fs';
import path from 'node:path';

// The largest config any reader loads. A project or global config over this size is refused
// before anything parses it. The conductor hook carries its own copy of the number, and the
// witness test keeps the two equal.
export const MAX_CONFIG_BYTES = 1024 * 1024;

// Reads a config through ONE descriptor: the file type and the size are judged on that
// descriptor (fstat), then the same descriptor is read, so nothing is read that was not judged.
// A directory keeps EISDIR, a non-file gets ENOTFILE, and an oversize file is refused with
// ECONFIGTOOLARGE and a message that names the file.
export function readConfigBounded(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      const e = new Error(`${file}: not a regular file`);
      e.code = st.isDirectory() ? 'EISDIR' : 'ENOTFILE';
      throw e;
    }
    if (st.size > MAX_CONFIG_BYTES) {
      const e = new Error(`${file}: config is larger than 1 MiB (${MAX_CONFIG_BYTES} bytes), so it is not read`);
      e.code = 'ECONFIGTOOLARGE';
      throw e;
    }
    const buf = Buffer.alloc(st.size);
    let got = 0;
    while (got < st.size) {
      const n = fs.readSync(fd, buf, got, st.size - got, got);
      if (n === 0) break;
      got += n;
    }
    return buf.subarray(0, got).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// A relative path escapes its root when its FIRST SEGMENT is `..` (or it is absolute, a different drive on Windows). A lexical `startsWith('..')` would also refuse a real
// child folder named `..cfg`, so the test is on the segment.
export function escapesRoot(rel) {
  return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
}

const FOLDER_FIX = 'make that path a real folder inside the project (remove the link or the file that sits there)';

const TEMP_FIX = 'remove the leftover temp file or fix the folder';

export class RepoWriteRefused extends Error {
  constructor(target, why, fix = FOLDER_FIX) {
    super(`${target}: ${why} -- ${fix} and re-run`);
    this.name = 'RepoWriteRefused';
    this.target = target;
  }
}

// Make `dir` (and any missing parents) under `root`, judging every component first. `root = null` (the user-global config, the user's own file) keeps the plain recursive make.
// Throws RepoWriteRefused, never a raw errno.
export function mkdirRepoParents(dir, root) {
  if (root == null) { fs.mkdirSync(dir, { recursive: true }); return; }
  const rel = path.relative(root, dir);
  if (rel === '') return;
  if (escapesRoot(rel)) throw new RepoWriteRefused(dir, 'it is outside the project root');
  let cur = root;
  for (const part of rel.split(path.sep)) {
    cur = path.join(cur, part);
    let st = null;
    try { st = fs.lstatSync(cur); } catch (e) { if (e.code !== 'ENOENT') throw new RepoWriteRefused(cur, `it could not be inspected (${e.code})`); }
    if (st === null) {
      try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw new RepoWriteRefused(cur, `its folder could not be made (${e.code})`); }
      try { st = fs.lstatSync(cur); } catch (e) { throw new RepoWriteRefused(cur, `it could not be inspected after it was made (${e.code})`); }
    }
    if (st.isSymbolicLink()) throw new RepoWriteRefused(cur, 'a link or junction sits on the path to the config folder, wherever it points');
    if (!st.isDirectory()) throw new RepoWriteRefused(cur, 'it exists and is not a directory');
  }
}

// 17c (c)(d), node/runtime.md section 5: a state file the tool reads back later is NEVER rewritten in place. A plain writeFileSync follows a link (or a hard link) at the target and
// is torn by a kill mid-write. This writes a per-pid temp in the SAME directory opened O_EXCL (a brand-new name, so a link planted at the temp name is never followed), then
// renames it over the target: a rename REPLACES the directory entry, it does not write through whatever the entry names, and a reader sees the old file or the new one.
// The failure branch keeps the old file, deletes the temp in finally, and NEVER falls back to an in-place write. A rename over a target another process holds open can fail on
// Windows (EPERM/EBUSY/EACCES): that is a RepoWriteRefused sentence, never a raw errno. Closes: a link or hard link swapped in at the TARGET after the check (the old file is
// replaced, never written through) and a torn write. Leaves open: the folder above the target swapped for a junction between the check and the temp's creation (the temp and the
// rename then land through it); and the temp's own folder is the one the walk judged, not re-judged here.
//
// 17c E1 (CodeRabbit t161): (1) the rename installs the TEMP's mode (0o666 & umask), where the old in-place write kept an existing file's bits. A REPLACED regular file keeps its own
// permission bits, and `modeFrom` names another regular file whose bits the result takes (the .bak of a config takes the config's, what copyFileSync gave it); a NEW file with no
// source keeps the default creation mode, no restrictive default nobody asked for. (2) the whole buffer is written through the descriptor (writeFileSync on an fd loops until
// every byte is out), because a single fs.writeSync may write short without throwing and the rename would then install a truncated file.
function modeOf(p) {
  try { const st = fs.lstatSync(p); return st.isFile() ? st.mode & 0o7777 : undefined; } catch { return undefined; }
}
export function writeFileAtomic(target, content, modeFrom = target) {
  const temp = `${target}.coalface-tmp-${process.pid}`;
  const mode = modeOf(modeFrom);
  let fd;
  try {
    fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL);
  } catch (e) {
    if (e.code === 'EEXIST') throw new RepoWriteRefused(target, `a leftover temp file blocks the write (${temp})`, TEMP_FIX);
    throw new RepoWriteRefused(target, `its temp file could not be made (${e.code})`, TEMP_FIX);
  }
  let renamed = false;
  try {
    try {
      if (mode !== undefined) { try { fs.fchmodSync(fd, mode); } catch { /* a volume with no POSIX bits keeps its own */ } }
      fs.writeFileSync(fd, content);
    } finally { fs.closeSync(fd); }
    try { fs.renameSync(temp, target); renamed = true; } catch (e) {
      throw new RepoWriteRefused(target, `it could not be replaced (${e.code}); an older copy is kept`, 'close whatever holds that file open, or make it a regular file');
    }
  } catch (e) {
    if (e instanceof RepoWriteRefused) throw e;
    throw new RepoWriteRefused(target, `it could not be written (${e.code || e.message})`, TEMP_FIX);
  } finally {
    if (!renamed) { try { fs.unlinkSync(temp); } catch {} }
  }
}
