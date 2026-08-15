'use strict';
// Tier C — WEAK stylistic signals in comments and docs. LLM-typical phrasing
// also occurs in human writing; findings here are supporting signal only and
// must always be presented as such.

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', 'target', '__pycache__']);
const MAX_FILES = 2000;
const MAX_FINDINGS = 100;
const MAX_FILE_BYTES = 1024 * 1024;

function listFiles(dir, base, exts, out, depth) {
  if (depth > 12 || out.length >= MAX_FILES) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= MAX_FILES) return;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) listFiles(path.join(dir, e.name), rel, exts, out, depth + 1);
    } else if (exts.has(path.extname(e.name).toLowerCase()) || /^readme(\.md)?$/i.test(e.name)) {
      out.push(rel);
    }
  }
}

function commentText(line) {
  const m = line.match(/(?:\/\/|#(?!!)|\/\*+|\*|<!--)\s?(.*)$/);
  return m ? m[1] : null;
}

function analyze(targetDir, catalog) {
  const findings = [];
  const exts = new Set(catalog.codeExtensions || []);
  const phrases = (catalog.commentPhrases || []).map((p) => ({ p, re: new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
  const files = [];
  listFiles(targetDir, '', exts, files, 0);

  for (const rel of files) {
    if (findings.length >= MAX_FINDINGS) break;
    let text;
    try {
      const st = fs.statSync(path.join(targetDir, rel));
      if (st.size > MAX_FILE_BYTES) continue;
      text = fs.readFileSync(path.join(targetDir, rel), 'utf8');
    } catch { continue; }

    const isReadme = /^readme(\.md)?$/i.test(rel.split('/').pop());
    const lines = text.split('\n');

    if (isReadme && catalog.readmeEmojiHeaders) {
      const emojiHeaders = lines.filter((l) => /^#{1,3}\s/.test(l) && /[\u{1F300}-\u{1FAFF}✀-➿☀-⛿]/u.test(l));
      if (emojiHeaders.length >= 3) {
        findings.push({
          tier: 'C', kind: 'formulaic README', path: rel,
          detail: `${emojiHeaders.length} emoji-decorated headers (LLM-typical README structure)`,
          quote: emojiHeaders[0].trim().slice(0, 120),
        });
      }
    }

    for (let i = 0; i < lines.length && findings.length < MAX_FINDINGS; i++) {
      const ct = isReadme ? lines[i] : commentText(lines[i]);
      if (ct == null || !ct.trim()) continue;
      if (catalog.commentEmDash && !isReadme && ct.includes('—')) {
        findings.push({ tier: 'C', kind: 'em-dash in code comment', path: rel, line: i + 1, quote: lines[i].trim().slice(0, 160) });
        continue;
      }
      for (const { p, re } of phrases) {
        if (re.test(ct)) {
          findings.push({ tier: 'C', kind: `LLM-typical phrase ("${p}")`, path: rel, line: i + 1, quote: lines[i].trim().slice(0, 160) });
          break;
        }
      }
    }
  }
  return findings;
}

module.exports = { analyze };
