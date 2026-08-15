# 🦅 CodeHawk

**Find out who really wrote a codebase — with evidence, not a score.**

You paid for custom software. How much of it was written by AI tools —
Claude Code, Cursor, GitHub Copilot, Aider, Devin? CodeHawk audits a codebase
**locally** and produces an evidence report: exact commits, exact quotes,
exact files. No cloud upload, no "78% AI" guesswork.

```
CodeHawk v0.1.0 — C:\audit\purchased-code
Git history: 2182 commits
Commits with direct AI attribution: 434 (20%)
Evidence: Tier A 434 · Tier B 116 · Tier C 100
  - Claude Code (Anthropic): 433 direct, 3 artifacts
  - Cursor: 0 direct, 2 artifacts
```

## Why not an AI detector website?

- **Your code never leaves your machine.** Web tools can't see private repos;
  you shouldn't upload purchased code anywhere anyway.
- **Evidence, not scores.** A "confidence score" doesn't hold up in a dispute.
  "These 37 commits carry the machine-written trailer `Co-Authored-By: Claude
  <noreply@anthropic.com>` — here they are" does.
- **Retroactive.** Tools like git-ai only track AI code going forward, with
  the agents' cooperation. CodeHawk audits history that already exists.

## What it detects

| Tier | Meaning | Signals |
|------|---------|---------|
| **A** | Direct proof | `Co-Authored-By` trailers, tool signatures in commit messages ("🤖 Generated with Claude Code"), known AI author identities (`noreply@anthropic.com`, `devin-ai-integration[bot]`, `(aider)` …) |
| **B** | Strong indication | Tool artifacts in the tree or **deleted from git history** (`CLAUDE.md`, `.claude/`, `.cursorrules`, `.aider*`, `AGENTS.md` …); oversized commits; inhuman commit cadence |
| **C** | Weak indication | LLM-typical phrasing in comments/docs — always labeled weak, never a conclusion on its own |

Tiers are reported separately and never merged into a single number.

Covered tools (extensible via `signatures/*.json` — PRs welcome): Claude Code,
GitHub Copilot, Cursor, Aider, Devin, gpt-engineer/Lovable, OpenAI Codex,
Gemini/Jules, Windsurf, Cline, Continue, Roo, Sweep.

## Usage

Requires Node.js ≥ 18 and git. Zero npm dependencies — clone and run.

```bash
git clone https://github.com/Blondu2024/codehawk
cd codehawk

# CLI: audit a folder (works with or without .git), get an HTML + JSON report
node codehawk.js /path/to/code --html report.html --json report.json

# Or the local web UI
npm start          # → http://localhost:4480
```

The HTML report is a single self-contained file you can hand to a client,
a manager, or a lawyer.

## Honest limitations

- A detected signature proves an AI tool **touched those commits** — it does
  not measure what fraction of the final code the tool wrote.
- **Absence of evidence is not proof of human authorship.** A rebase strips
  co-author trailers; a code ZIP without `.git` removes Tier A entirely.
  Always ask the vendor for the repository with full history.
- Tier C stylometry is weak by nature. Humans write like that too.
- Anthropic's cryptographic text watermark (Claude models released on/after
  2026-08-02) is **not publicly readable yet** — any tool claiming to read it
  today is guessing. CodeHawk will integrate the official Anthropic detection
  API the day it ships.

## Testing

```bash
npm test   # builds synthetic git repos in temp and asserts every engine
```

## License

MIT
