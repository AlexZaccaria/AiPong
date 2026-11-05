// The player's record across matches, kept in this browser. Pure functions on plain objects; the
// caller loads and saves.

const FIELDS = ['played', 'won', 'streak', 'bestStreak', 'bestRally', 'topSpeed'];

export const emptyStats = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));

/** Whatever was stored, as valid stats: unknown or broken values count as zero. */
export function parseStats(value) {
  const stats = emptyStats();
  if (value && typeof value === 'object') {
    for (const f of FIELDS) {
      const n = value[f];
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) stats[f] = n;
    }
  }
  return stats;
}

/**
 * Adds a finished match. Returns the new stats and the records it broke ('rally', 'speed',
 * 'streak'); the very first match breaks none, there was nothing to beat.
 */
export function recordMatch(stats, { won, longestRally, topSpeed }) {
  const streak = won ? stats.streak + 1 : 0;
  const next = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    bestRally: Math.max(stats.bestRally, longestRally),
    topSpeed: Math.max(stats.topSpeed, topSpeed),
  };
  const records = [];
  if (stats.played > 0) {
    if (longestRally > stats.bestRally) records.push('rally');
    if (topSpeed > stats.topSpeed) records.push('speed');
    if (streak > stats.bestStreak && streak > 1) records.push('streak');
  }
  return { stats: next, records };
}
