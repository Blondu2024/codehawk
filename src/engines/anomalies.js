'use strict';
// Tier B — commit anomalies: oversized commits and bursts of large commits at
// a cadence implausible for hand-written code. Indication, not proof.

const OVERSIZED_FILES = 20;
const OVERSIZED_INSERTIONS = 1000;
const BURST_GAP_SECONDS = 180;
const BURST_MIN_INSERTIONS = 200;

function analyze(commits, stats) {
  const findings = [];

  for (const c of commits) {
    const s = stats.get(c.hash);
    if (!s) continue;
    if (s.files >= OVERSIZED_FILES || s.insertions >= OVERSIZED_INSERTIONS) {
      findings.push({
        tier: 'B', kind: 'oversized commit',
        commit: c.hash, shortHash: c.shortHash, date: c.date,
        subject: c.message.split('\n')[0].slice(0, 120),
        detail: `${s.files} files changed, +${s.insertions}/-${s.deletions} lines in a single commit`,
      });
    }
  }

  // Burst cadence: sort by author date, look at consecutive large commits by the same author.
  const sorted = commits
    .map((c) => ({ c, s: stats.get(c.hash), t: Date.parse(c.date) }))
    .filter((x) => x.s && !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = (cur.t - prev.t) / 1000;
    if (
      cur.c.authorEmail === prev.c.authorEmail &&
      gap >= 0 && gap <= BURST_GAP_SECONDS &&
      prev.s.insertions >= BURST_MIN_INSERTIONS &&
      cur.s.insertions >= BURST_MIN_INSERTIONS
    ) {
      findings.push({
        tier: 'B', kind: 'burst cadence',
        commit: cur.c.hash, shortHash: cur.c.shortHash, date: cur.c.date,
        subject: cur.c.message.split('\n')[0].slice(0, 120),
        detail: `+${cur.s.insertions} lines committed only ${Math.round(gap)}s after previous commit of +${prev.s.insertions} lines (${prev.c.shortHash}) by the same author`,
      });
    }
  }

  return findings;
}

module.exports = { analyze, thresholds: { OVERSIZED_FILES, OVERSIZED_INSERTIONS, BURST_GAP_SECONDS, BURST_MIN_INSERTIONS } };
