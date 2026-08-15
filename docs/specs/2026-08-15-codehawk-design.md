# CodeHawk — AI Code Provenance Auditor (Design)

Date: 2026-08-15 · Status: approved

## Problem

A client who paid for custom software wants to know how much of the delivered
code was written by AI tools (Claude Code, Cursor, Copilot, Aider, …), with
concrete evidence — not a classifier score. A developer wants to know what AI
traces their own repo carries before handing it over. Existing tools are
either forward-tracking only (git-ai: agents must self-report while coding) or
public-web score generators (isvibecoded.com, vibedetect.io) that cannot see
private code and output an unexplained percentage.

## Product

Open-source, local-first CLI + local web UI. Zero npm dependencies. The user
points it at a local folder (with or without `.git`); it produces an
**evidence report**, never a single score. Tool-agnostic: detection is driven
by extensible JSON signature catalogs, one entry per AI tool.

## Evidence tiers (never merged into one number)

- **Tier A — Direct proof (git history):** `Co-Authored-By` trailers, tool
  signatures in commit messages ("Generated with Claude Code" etc.), known AI
  author names/emails (`noreply@anthropic.com`, `devin-ai-integration[bot]`,
  "(aider)" author suffix, …). Each finding = commit hash + exact quote.
- **Tier B — Strong indication:**
  - AI tool artifacts present in the tree (`CLAUDE.md`, `.claude/`,
    `.cursorrules`, `.aider*`, `AGENTS.md`, `.github/copilot-instructions.md`, …)
  - Artifacts **deleted from history** (recovered via `git log --diff-filter=D`)
  - Commit anomalies: very large commits (files/insertions thresholds),
    inhuman cadence (large commits seconds/minutes apart).
- **Tier C — Weak indication (labeled as such):** stylometry on comments and
  docs (signature phrases, em-dash density in comments, formulaic README
  structure). Explicitly marked "weak — supporting signal only".
- **Watermark slot:** honest section stating Anthropic's cryptographic text
  watermark (models ≥ 2026-08-02) is not publicly readable yet; the official
  detection API will be integrated when released.

## Architecture

```
codehawk.js            CLI entry: node codehawk.js <path> [--json f] [--html f]
src/scan.js            orchestrator: runs engines, builds result object
src/git.js             git plumbing via child_process (log, numstat, deletions)
src/engines/trailers.js    Tier A
src/engines/artifacts.js   Tier B (present + deleted files)
src/engines/anomalies.js   Tier B (size/cadence)
src/engines/stylometry.js  Tier C
src/report/html.js     self-contained HTML report (client-shareable)
src/server.js          npm start → localhost UI (form: path → report)
signatures/git.json        per-tool git signatures (trailers, emails, msg patterns)
signatures/artifacts.json  per-tool file artifacts
signatures/style.json      Tier C phrase/pattern list
test/run.js            builds synthetic git repos in temp, asserts each engine
```

Result object: `{ target, generatedAt, git: {available, commits}, tools: [
{id, name, tierA: [...], tierB: [...]} ], anomalies: [...], stylometry: [...],
limitations: [...] }` — every finding carries its evidence (hash, file, quote).

## Report

Summary (per-tool counts, % of commits with AI attribution, tiers separated),
then evidence lists, then a Limitations section: no `.git` folder → only Tier
B/C; a rebase can strip trailers; absence of evidence ≠ human-written; Tier C
is stylistic guesswork. Language: English.

## Non-goals (v1)

Public website, single score, CI integration, watermark decoding (impossible
without Anthropic's key), Tauri packaging, npm publish (later: `npx codehawk`).

## Testing

`node test/run.js` — creates fixture repos with git (clean repo; repo with
Claude trailer + deleted CLAUDE.md; repo with oversized commit; folder without
.git containing `.cursorrules`), asserts each engine's findings and that the
clean repo yields zero Tier A/B evidence.
