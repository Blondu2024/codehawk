'use strict';
const { spawnSync } = require('child_process');

const SEP = '\x1f';
const REC = '\x1e';

function run(args, cwd) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  return { code: res.status, out: res.stdout || '', err: res.stderr || '' };
}

function isRepo(cwd) {
  try {
    const r = run(['rev-parse', '--is-inside-work-tree'], cwd);
    return r.code === 0 && r.out.trim() === 'true';
  } catch {
    return false;
  }
}

// All commits with author metadata and full message.
function getCommits(cwd) {
  const fmt = ['%H', '%h', '%an', '%ae', '%aI'].join(SEP) + SEP;
  const r = run(['log', '--all', `--pretty=format:${fmt}%B${REC}`], cwd);
  if (r.code !== 0) return [];
  const commits = [];
  for (const rec of r.out.split(REC)) {
    if (!rec.trim()) continue;
    const [hash, shortHash, authorName, authorEmail, date, ...rest] = rec.replace(/^\n/, '').split(SEP);
    if (!hash) continue;
    commits.push({ hash, shortHash, authorName, authorEmail, date, message: (rest.join(SEP) || '').trim() });
  }
  return commits;
}

// Per-commit file counts and insertion/deletion totals (for anomaly detection).
function getCommitStats(cwd) {
  const r = run(['log', '--all', '--numstat', '--pretty=format:@@%H'], cwd);
  if (r.code !== 0) return new Map();
  const stats = new Map();
  let cur = null;
  for (const line of r.out.split('\n')) {
    if (line.startsWith('@@')) {
      cur = { files: 0, insertions: 0, deletions: 0 };
      stats.set(line.slice(2).trim(), cur);
    } else if (cur && line.trim()) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t/);
      if (m) {
        cur.files += 1;
        if (m[1] !== '-') cur.insertions += parseInt(m[1], 10);
        if (m[2] !== '-') cur.deletions += parseInt(m[2], 10);
      }
    }
  }
  return stats;
}

// Files ever deleted from history: path -> {hash, shortHash, date} of the deleting commit.
function getDeletedFiles(cwd) {
  const fmt = ['%H', '%h', '%aI'].join(SEP);
  const r = run(['log', '--all', '--diff-filter=D', '--name-only', `--pretty=format:@@${fmt}`], cwd);
  if (r.code !== 0) return new Map();
  const deleted = new Map();
  let cur = null;
  for (const line of r.out.split('\n')) {
    if (line.startsWith('@@')) {
      const [hash, shortHash, date] = line.slice(2).split(SEP);
      cur = { hash, shortHash, date };
    } else if (cur && line.trim()) {
      const p = line.trim();
      if (!deleted.has(p)) deleted.set(p, cur);
    }
  }
  return deleted;
}

module.exports = { run, isRepo, getCommits, getCommitStats, getDeletedFiles };
