'use strict';
// Tier B — AI tool artifacts: config/context files present in the tree, or
// deleted from git history (recovered via --diff-filter=D).

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', 'target', '__pycache__']);

function walk(dir, base, out, depth) {
  if (depth > 12 || out.length > 20000) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push({ rel, dir: true });
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), rel, out, depth + 1);
    } else {
      out.push({ rel, dir: false });
    }
  }
}

function matchTool(t, rel, isDir) {
  const relLower = rel.toLowerCase();
  const baseName = rel.split('/').pop().toLowerCase();
  for (const p of t.paths || []) {
    if (relLower === p.toLowerCase()) return `known artifact file "${rel}"`;
  }
  for (const d of t.dirs || []) {
    const dl = d.toLowerCase();
    if (isDir && (baseName === dl)) return `known artifact directory "${rel}/"`;
    if (!isDir && (relLower.startsWith(dl + '/') || relLower.includes('/' + dl + '/'))) {
      return `file inside known artifact directory "${rel}"`;
    }
  }
  for (const pre of t.prefixes || []) {
    if (baseName.startsWith(pre.toLowerCase())) return `known artifact file "${rel}"`;
  }
  return null;
}

function analyze(targetDir, deletedFiles, catalog) {
  const findings = [];
  const entries = [];
  walk(targetDir, '', entries, 0);

  const seen = new Set(); // dedupe: one finding per tool+path
  for (const t of catalog.tools) {
    for (const e of entries) {
      const why = matchTool(t, e.rel, e.dir);
      if (why) {
        const key = `${t.id}:${e.rel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({ tool: t.id, toolName: t.name, tier: 'B', kind: 'artifact present', path: e.rel, detail: why });
      }
    }
    for (const [rel, del] of deletedFiles) {
      const why = matchTool(t, rel.replace(/\\/g, '/'), false);
      if (why) {
        const key = `${t.id}:deleted:${rel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          tool: t.id, toolName: t.name, tier: 'B', kind: 'artifact deleted from history',
          path: rel, detail: `"${rel}" existed and was deleted in commit ${del.shortHash} (${del.date})`,
          commit: del.hash, shortHash: del.shortHash, date: del.date,
        });
      }
    }
  }
  return findings;
}

module.exports = { analyze };
