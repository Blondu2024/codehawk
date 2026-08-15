'use strict';
// CodeHawk test suite. Builds synthetic git repos in a temp dir and asserts
// each engine's findings. Run: node test/run.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan } = require('../src/scan');
const { render } = require('../src/report/html');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'codehawk-test-'));
let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

function git(cwd, args, env) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Dev', GIT_AUTHOR_EMAIL: 'dev@example.com',
      GIT_COMMITTER_NAME: 'Test Dev', GIT_COMMITTER_EMAIL: 'dev@example.com',
      ...env,
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function repo(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-b', 'main']);
  return dir;
}

function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function commit(dir, msg, env) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', msg, '--no-gpg-sign'], env);
}

// ---------- Fixture A: clean human repo ----------
{
  const dir = repo('clean');
  write(dir, 'index.js', 'const x = 1;\nmodule.exports = x;\n');
  commit(dir, 'initial commit');
  write(dir, 'index.js', 'const x = 2;\nmodule.exports = x;\n');
  commit(dir, 'bump value');

  const r = scan(dir);
  console.log('\nFixture A — clean repo:');
  check('git history detected', r.git.available && r.git.commitCount === 2);
  check('no Tier A findings', r.tools.every((t) => t.tierA.length === 0));
  check('no Tier B artifact findings', r.tools.every((t) => t.tierB.length === 0));
  check('no anomalies', r.anomalies.length === 0);
  check('0% attributed commits', r.git.attributedCommitCount === 0);
}

// ---------- Fixture B: Claude Code traces + deleted artifact + cursor file ----------
{
  const dir = repo('claude');
  write(dir, 'app.js', 'console.log("hi");\n');
  commit(dir, 'Add app\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
  write(dir, 'CLAUDE.md', '# project instructions\n');
  commit(dir, 'add claude config');
  fs.unlinkSync(path.join(dir, 'CLAUDE.md'));
  commit(dir, 'cleanup');
  write(dir, '.cursorrules', 'be nice\n');
  commit(dir, 'editor config');

  const r = scan(dir);
  console.log('\nFixture B — Claude + deleted CLAUDE.md + .cursorrules:');
  const claude = r.tools.find((t) => t.id === 'claude-code');
  check('claude-code detected in Tier A', !!claude && claude.tierA.length >= 1);
  check('trailer quote captured', !!claude && claude.tierA.some((f) => /Co-Authored-By: Claude/i.test(f.quote || '')));
  check('deleted CLAUDE.md recovered from history', !!claude && claude.tierB.some((f) => f.kind === 'artifact deleted from history' && f.path === 'CLAUDE.md'));
  const cursor = r.tools.find((t) => t.id === 'cursor');
  check('.cursorrules artifact found', !!cursor && cursor.tierB.some((f) => f.path === '.cursorrules'));
  check('attributed commit count = 1', r.git.attributedCommitCount === 1);
  const html = render(r);
  check('HTML report names Claude Code', html.includes('Claude Code (Anthropic)'));
  check('HTML report has limitations section', html.includes('Limitations'));
}

// ---------- Fixture C: anomalies (oversized + burst cadence) ----------
{
  const dir = repo('anomaly');
  write(dir, 'seed.txt', 'seed\n');
  commit(dir, 'seed', { GIT_AUTHOR_DATE: '2026-01-01T10:00:00', GIT_COMMITTER_DATE: '2026-01-01T10:00:00' });
  for (let i = 0; i < 25; i++) write(dir, `src/f${i}.js`, 'x\n'.repeat(50));
  commit(dir, 'big drop', { GIT_AUTHOR_DATE: '2026-01-01T10:10:00', GIT_COMMITTER_DATE: '2026-01-01T10:10:00' });
  write(dir, 'gen1.js', 'y\n'.repeat(300));
  commit(dir, 'feature one', { GIT_AUTHOR_DATE: '2026-01-01T11:00:00', GIT_COMMITTER_DATE: '2026-01-01T11:00:00' });
  write(dir, 'gen2.js', 'z\n'.repeat(300));
  commit(dir, 'feature two', { GIT_AUTHOR_DATE: '2026-01-01T11:01:00', GIT_COMMITTER_DATE: '2026-01-01T11:01:00' });

  const r = scan(dir);
  console.log('\nFixture C — anomalies:');
  check('oversized commit flagged', r.anomalies.some((f) => f.kind === 'oversized commit'));
  check('burst cadence flagged', r.anomalies.some((f) => f.kind === 'burst cadence'));
  check('no Tier A findings (anomalies are Tier B only)', r.tools.every((t) => t.tierA.length === 0));
}

// ---------- Fixture D: no .git (code ZIP scenario) ----------
{
  const dir = path.join(ROOT, 'nogit');
  write(dir, '.cursorrules', 'rules\n');
  write(dir, 'main.py', '# This ensures that the loop terminates — always\nprint(1)\n');

  const r = scan(dir);
  console.log('\nFixture D — folder without .git:');
  check('git marked unavailable', r.git.available === false);
  check('artifact still found without git', r.tools.some((t) => t.id === 'cursor' && t.tierB.length >= 1));
  check('stylometry hit (em-dash or phrase)', r.stylometry.length >= 1);
  check('no-git limitation listed first', /No \.git directory/.test(r.limitations[0]));
  check('JSON serializable', (() => { try { JSON.stringify(r); return true; } catch { return false; } })());
}

// ---------- Fixture E: other tools' signatures ----------
{
  const dir = repo('multi');
  write(dir, 'a.js', '1\n');
  commit(dir, 'Add feature\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>');
  write(dir, 'b.js', '2\n');
  commit(dir, 'aider: refactor helpers', { GIT_AUTHOR_NAME: 'Test Dev (aider)' });
  write(dir, 'c.js', '3\n');
  commit(dir, 'automated PR', { GIT_AUTHOR_NAME: 'devin-ai-integration[bot]', GIT_AUTHOR_EMAIL: 'bot@devin.ai' });

  const r = scan(dir);
  console.log('\nFixture E — Copilot / Aider / Devin:');
  check('Copilot trailer detected', r.tools.some((t) => t.id === 'github-copilot' && t.tierA.length >= 1));
  check('Aider author suffix detected', r.tools.some((t) => t.id === 'aider' && t.tierA.length >= 1));
  check('Devin bot author detected', r.tools.some((t) => t.id === 'devin' && t.tierA.length >= 1));
}

console.log(`\n${passed} passed, ${failed} failed (fixtures in ${ROOT})`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
process.exit(failed ? 1 : 0);
