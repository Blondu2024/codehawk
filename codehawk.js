#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { scan } = require('./src/scan');
const { render } = require('./src/report/html');

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(`CodeHawk — AI code provenance auditor (local, evidence-based)

Usage:
  node codehawk.js <folder> [--html report.html] [--json report.json]
  npm start                  launch the local web UI (http://localhost:4480)

Scans a codebase (with or without .git) for evidence of AI coding tools:
  Tier A  direct proof     git co-author trailers, tool signatures, AI authors
  Tier B  strong indication tool artifacts (present or deleted), commit anomalies
  Tier C  weak indication  LLM-typical phrasing in comments/docs`);
    process.exit(args.length ? 0 : 1);
  }

  const target = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--html' && args[args.indexOf(a) - 1] !== '--json');
  const htmlOut = args.includes('--html') ? args[args.indexOf('--html') + 1] : path.join(process.cwd(), 'codehawk-report.html');
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

  const result = scan(target);

  const tierA = result.tools.reduce((n, t) => n + t.tierA.length, 0);
  const tierB = result.tools.reduce((n, t) => n + t.tierB.length, 0) + result.anomalies.length;
  console.log(`CodeHawk v${result.version} — ${result.target}`);
  console.log(`Git history: ${result.git.available ? result.git.commitCount + ' commits' : 'not available'}`);
  if (result.git.available) {
    const pct = result.git.commitCount ? Math.round((result.git.attributedCommitCount / result.git.commitCount) * 100) : 0;
    console.log(`Commits with direct AI attribution: ${result.git.attributedCommitCount} (${pct}%)`);
  }
  console.log(`Evidence: Tier A ${tierA} · Tier B ${tierB} · Tier C ${result.stylometry.length}`);
  for (const t of result.tools) {
    console.log(`  - ${t.name}: ${t.tierA.length} direct, ${t.tierB.length} artifacts`);
  }

  fs.writeFileSync(htmlOut, render(result));
  console.log(`\nHTML report: ${htmlOut}`);
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));
    console.log(`JSON report: ${jsonOut}`);
  }
}

main();
