'use strict';
const fs = require('fs');
const path = require('path');
const git = require('./git');
const trailers = require('./engines/trailers');
const artifacts = require('./engines/artifacts');
const anomalies = require('./engines/anomalies');
const stylometry = require('./engines/stylometry');
const blame = require('./engines/blame');

const SIG_DIR = path.join(__dirname, '..', 'signatures');

function loadCatalog(name) {
  return JSON.parse(fs.readFileSync(path.join(SIG_DIR, name), 'utf8'));
}

function scan(targetDir, options = {}) {
  const target = path.resolve(targetDir);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`Not a directory: ${target}`);
  }

  const gitCatalog = loadCatalog('git.json');
  const artifactCatalog = loadCatalog('artifacts.json');
  const styleCatalog = loadCatalog('style.json');

  const gitAvailable = git.isRepo(target);
  let commits = [];
  let stats = new Map();
  let deleted = new Map();
  if (gitAvailable) {
    commits = git.getCommits(target);
    stats = git.getCommitStats(target);
    deleted = git.getDeletedFiles(target);
  }

  const tierA = gitAvailable ? trailers.analyze(commits, gitCatalog) : [];
  const tierBArtifacts = artifacts.analyze(target, deleted, artifactCatalog);
  const tierBAnomalies = gitAvailable ? anomalies.analyze(commits, stats) : [];
  const tierC = stylometry.analyze(target, styleCatalog);

  // Group Tier A/B evidence per detected tool.
  const toolMap = new Map();
  const toolOf = (id, name) => {
    if (!toolMap.has(id)) toolMap.set(id, { id, name, tierA: [], tierB: [] });
    return toolMap.get(id);
  };
  for (const f of tierA) toolOf(f.tool, f.toolName).tierA.push(f);
  for (const f of tierBArtifacts) toolOf(f.tool, f.toolName).tierB.push(f);

  const attributedCommits = new Set(tierA.map((f) => f.commit));

  // Optional line-level attribution via git blame (slow on big repos).
  let blameResult = { enabled: false };
  if (options.blame && gitAvailable && attributedCommits.size > 0) {
    const attrMap = new Map();
    for (const f of tierA) if (!attrMap.has(f.commit)) attrMap.set(f.commit, { tool: f.tool, toolName: f.toolName });
    const commitMeta = new Map(commits.map((c) => [c.hash, c]));
    blameResult = blame.analyze(target, attrMap, commitMeta, styleCatalog, options.onProgress);
  } else if (options.blame) {
    blameResult = { enabled: false, reason: gitAvailable ? 'no AI-attributed commits to trace' : 'no git history' };
  }

  const limitations = [
    'A detected signature proves an AI tool touched those commits/files — it does not measure what fraction of the final code the tool wrote.',
    'Absence of evidence is NOT proof the code is human-written: a rebase can strip co-author trailers, artifacts can be deleted without git, and a code ZIP without .git history removes Tier A entirely.',
    'Tier C stylometry is weak by nature: the same phrasing occurs in human writing. Never treat Tier C alone as a conclusion.',
    'Line-level attribution (git blame) shows who LAST touched a line: a human edit on top of AI code re-attributes the line to the human, and vice versa. Treat percentages as a lower bound on AI involvement, not an exact measure.',
    "Anthropic's cryptographic text watermark (Claude models released on/after 2026-08-02) is not publicly readable yet. CodeHawk will integrate the official detection API when Anthropic releases it.",
  ];
  if (!gitAvailable) {
    limitations.unshift('No .git directory found: git-history evidence (Tier A, deleted artifacts, commit anomalies) is unavailable. Ask the vendor for the repository with full history.');
  }

  return {
    tool: 'CodeHawk',
    version: require('../package.json').version,
    target,
    generatedAt: new Date().toISOString(),
    git: { available: gitAvailable, commitCount: commits.length, attributedCommitCount: attributedCommits.size },
    tools: [...toolMap.values()].sort((a, b) => (b.tierA.length - a.tierA.length) || (b.tierB.length - a.tierB.length)),
    anomalies: tierBAnomalies,
    stylometry: tierC,
    blame: blameResult,
    limitations,
  };
}

module.exports = { scan };
