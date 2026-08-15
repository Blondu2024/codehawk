'use strict';
// Line-level AI attribution via `git blame`. Cross-references every line's
// origin commit with the set of AI-attributed commits (Tier A). Real evidence
// with a real limitation: blame shows who LAST touched a line — a human edit
// on top of AI code re-attributes that line to the human, and vice versa.

const fs = require('fs');
const path = require('path');
const { run } = require('../git');

const MAX_FILES = 1000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_REPORTED_FILES = 200;

function listTrackedCodeFiles(cwd, exts) {
  const r = run(['ls-files'], cwd);
  if (r.code !== 0) return [];
  const files = [];
  for (const line of r.out.split('\n')) {
    const rel = line.trim();
    if (!rel) continue;
    const ext = path.extname(rel).toLowerCase();
    if (exts.has(ext)) files.push(rel);
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

// Returns per final-line commit hash. --line-porcelain repeats the
// "<sha> <orig> <final>" header for every line; content lines start with \t.
function blameFile(cwd, rel) {
  const r = run(['blame', '--line-porcelain', '--', rel], cwd);
  if (r.code !== 0) return null;
  const lines = [];
  for (const line of r.out.split('\n')) {
    const m = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (m) lines[parseInt(m[2], 10)] = m[1];
  }
  return lines; // sparse array indexed by line number (1-based)
}

function analyze(targetDir, attributedCommits, commitMeta, styleCatalog, onProgress) {
  const exts = new Set(styleCatalog.codeExtensions || []);
  const allFiles = listTrackedCodeFiles(targetDir, exts);
  const files = [];
  let scanned = 0;

  for (const rel of allFiles) {
    try {
      const st = fs.statSync(path.join(targetDir, rel));
      if (st.size > MAX_FILE_BYTES) continue;
    } catch { continue; }

    const byLine = blameFile(targetDir, rel);
    scanned++;
    if (onProgress && scanned % 50 === 0) onProgress(scanned, allFiles.length);
    if (!byLine) continue;

    let totalLines = 0;
    let aiLines = 0;
    const ranges = [];
    let cur = null;

    for (let n = 1; n < byLine.length; n++) {
      const hash = byLine[n];
      if (hash === undefined) continue;
      totalLines++;
      const attr = attributedCommits.get(hash);
      if (attr) {
        aiLines++;
        if (cur && cur.end === n - 1 && cur.commit === hash) {
          cur.end = n;
        } else {
          const meta = commitMeta.get(hash);
          cur = {
            start: n, end: n, commit: hash, shortHash: meta ? meta.shortHash : hash.slice(0, 7),
            date: meta ? meta.date : null, tool: attr.tool, toolName: attr.toolName,
          };
          ranges.push(cur);
        }
      } else {
        cur = null;
      }
    }

    if (aiLines > 0) {
      files.push({ path: rel, totalLines, aiLines, pct: Math.round((aiLines / totalLines) * 100), ranges });
    }
  }

  files.sort((a, b) => b.pct - a.pct || b.aiLines - a.aiLines);
  const truncated = files.length > MAX_REPORTED_FILES;
  return {
    enabled: true,
    scannedFiles: scanned,
    totalTrackedCodeFiles: allFiles.length,
    filesWithAiLines: files.length,
    truncated,
    files: files.slice(0, MAX_REPORTED_FILES),
  };
}

module.exports = { analyze };
