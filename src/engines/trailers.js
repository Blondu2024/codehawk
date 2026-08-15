'use strict';
// Tier A — direct proof from git history: co-author trailers, tool signatures
// in commit messages, known AI author identities.

function compile(patterns) {
  return (patterns || []).map((p) => new RegExp(p, 'im'));
}

function quoteLine(text, re) {
  const m = text.match(re);
  if (!m) return null;
  const idx = text.indexOf(m[0]);
  const start = text.lastIndexOf('\n', idx) + 1;
  let end = text.indexOf('\n', idx);
  if (end === -1) end = text.length;
  return text.slice(start, end).trim();
}

function analyze(commits, catalog) {
  const findings = [];
  const tools = catalog.tools.map((t) => ({
    ...t,
    _trailers: compile(t.trailers),
    _message: compile(t.message),
    _authorName: compile(t.authorName),
    _authorEmail: compile(t.authorEmail),
  }));

  for (const c of commits) {
    for (const t of tools) {
      let kind = null;
      let quote = null;
      for (const re of t._trailers) {
        quote = quoteLine(c.message, re);
        if (quote) { kind = 'co-author trailer'; break; }
      }
      if (!kind) {
        for (const re of t._message) {
          quote = quoteLine(c.message, re);
          if (quote) { kind = 'commit message signature'; break; }
        }
      }
      if (!kind) {
        if (t._authorName.some((re) => re.test(c.authorName)) ||
            t._authorEmail.some((re) => re.test(c.authorEmail))) {
          kind = 'AI author identity';
          quote = `${c.authorName} <${c.authorEmail}>`;
        }
      }
      if (kind) {
        findings.push({
          tool: t.id,
          toolName: t.name,
          tier: 'A',
          kind,
          commit: c.hash,
          shortHash: c.shortHash,
          date: c.date,
          subject: c.message.split('\n')[0].slice(0, 120),
          quote,
        });
      }
    }
  }
  return findings;
}

module.exports = { analyze };
