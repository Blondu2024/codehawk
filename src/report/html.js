'use strict';
// Self-contained HTML report — shareable with a non-technical client.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function evidenceRow(f) {
  const where = f.shortHash
    ? `commit <code>${esc(f.shortHash)}</code> · ${esc((f.date || '').slice(0, 10))}`
    : `<code>${esc(f.path || '')}</code>${f.line ? ':' + f.line : ''}`;
  return `<tr><td class="kind">${esc(f.kind)}</td><td>${where}</td><td class="quote">${esc(f.quote || f.detail || f.subject || '')}</td></tr>`;
}

function section(title, badge, intro, rows) {
  if (!rows.length) return '';
  return `<section>
    <h2>${esc(title)} <span class="badge ${badge}">${badge === 'a' ? 'TIER A — DIRECT PROOF' : badge === 'b' ? 'TIER B — STRONG INDICATION' : 'TIER C — WEAK INDICATION'}</span></h2>
    <p class="intro">${intro}</p>
    <div class="tablewrap"><table><thead><tr><th>Evidence type</th><th>Where</th><th>Quote / detail</th></tr></thead>
    <tbody>${rows.join('\n')}</tbody></table></div>
  </section>`;
}

function render(result) {
  const r = result;
  const pct = r.git.commitCount ? Math.round((r.git.attributedCommitCount / r.git.commitCount) * 100) : 0;
  const tierACount = r.tools.reduce((n, t) => n + t.tierA.length, 0);
  const tierBCount = r.tools.reduce((n, t) => n + t.tierB.length, 0) + r.anomalies.length;

  const toolSections = r.tools.map((t) => {
    const parts = [];
    if (t.tierA.length) parts.push(section(`${t.name} — git history evidence`, 'a',
      'Machine-written attribution found in commit metadata. Each row cites the exact commit.', t.tierA.map(evidenceRow)));
    if (t.tierB.length) parts.push(section(`${t.name} — tool artifacts`, 'b',
      'Configuration/context files this AI tool creates, found in the tree or recovered from deleted git history.', t.tierB.map(evidenceRow)));
    return parts.join('\n');
  }).join('\n');

  const summaryVerdict = tierACount > 0
    ? `Direct evidence of AI tooling found: <strong>${r.git.attributedCommitCount} of ${r.git.commitCount} commits (${pct}%)</strong> carry machine-written AI attribution, across <strong>${r.tools.filter((t) => t.tierA.length).length} tool(s)</strong>.`
    : tierBCount > 0
      ? 'No direct git attribution found, but strong indications (artifacts and/or commit anomalies) are present — see Tier B below.'
      : r.stylometry.length > 0
        ? 'No direct proof or strong indication found. Only weak stylistic signals were detected (Tier C) — these alone are not a conclusion.'
        : 'No AI-tooling evidence found by any engine. Note the limitations below: absence of evidence is not proof of human authorship.';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CodeHawk report — ${esc(r.target)}</title>
<style>
  :root{--bg:#0f1115;--panel:#171a21;--text:#e6e8ee;--muted:#9aa3b2;--line:#262b36;--a:#ff5c5c;--b:#ffb020;--c:#8a93a6;--accent:#4ea1ff}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,Segoe UI,Roboto,sans-serif;padding:32px 16px}
  .wrap{max-width:960px;margin:0 auto}
  h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:0 0 8px}
  .meta{color:var(--muted);font-size:13px;margin-bottom:24px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px 22px;margin-bottom:18px}
  .badge{font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 8px;border-radius:99px;vertical-align:2px}
  .badge.a{background:rgba(255,92,92,.15);color:var(--a)}.badge.b{background:rgba(255,176,32,.15);color:var(--b)}.badge.c{background:rgba(138,147,166,.18);color:var(--c)}
  .intro{color:var(--muted);font-size:13px;margin:2px 0 12px}
  .tablewrap{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{text-align:left;padding:7px 10px;border-top:1px solid var(--line);vertical-align:top}
  th{color:var(--muted);font-weight:600;border-top:none}
  td.kind{white-space:nowrap;color:var(--accent)}
  td.quote{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-word}
  code{font-family:ui-monospace,Consolas,monospace;background:rgba(78,161,255,.12);padding:1px 5px;border-radius:4px;font-size:12px}
  section{margin-bottom:22px}
  ul.lim{color:var(--muted);font-size:13px;padding-left:18px}ul.lim li{margin-bottom:6px}
  .verdict{font-size:16px}
  footer{color:var(--muted);font-size:12px;margin-top:28px}
  a{color:var(--accent)}
</style></head><body><div class="wrap">
<h1>🦅 CodeHawk — AI code provenance report</h1>
<div class="meta">Target: <code>${esc(r.target)}</code> · Generated ${esc(r.generatedAt)} · CodeHawk v${esc(r.version)} · Git history: ${r.git.available ? `${r.git.commitCount} commits analyzed` : 'NOT AVAILABLE'}</div>

<div class="card"><h2>Summary</h2><p class="verdict">${summaryVerdict}</p>
<p class="intro">CodeHawk reports evidence, not a score. Tier A = direct machine-written proof · Tier B = strong indication · Tier C = weak stylistic signal. Tiers are never merged.</p></div>

<div class="card">${toolSections || '<p class="intro">No per-tool Tier A/B evidence.</p>'}
${section('Commit anomalies', 'b', 'Commit sizes or cadence implausible for hand-written code. Indication, not proof — bulk imports and generated assets also look like this.', r.anomalies.map(evidenceRow))}
${section('Stylometry', 'c', 'LLM-typical phrasing in comments and docs. WEAK signal: humans write like this too. Supporting evidence only.', r.stylometry.map(evidenceRow))}
</div>

<div class="card"><h2>About the Anthropic watermark</h2>
<p class="intro">Claude models released on/after 2026-08-02 embed a cryptographic watermark in generated text, including code. As of this report, no one outside Anthropic can read it — any tool claiming otherwise is guessing. CodeHawk will integrate Anthropic's official detection API the day it is published.</p></div>

<div class="card"><h2>Limitations — read before drawing conclusions</h2>
<ul class="lim">${r.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>

<footer>Generated locally by <a href="https://github.com/Blondu2024/codehawk">CodeHawk</a> — open source, runs on your machine, your code never leaves it.</footer>
</div></body></html>`;
}

module.exports = { render };
