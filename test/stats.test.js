import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSettings } from '../web/js/settings.js';
import { emptyStats, parseStats, recordMatch } from '../web/js/stats.js';

describe('stats', () => {
  it('count matches, wins and streaks', () => {
    let stats = emptyStats();
    for (const won of [true, true, false, true]) {
      ({ stats } = recordMatch(stats, { won, longestRally: 3, topSpeed: 1.2 }));
    }
    assert.equal(stats.played, 4);
    assert.equal(stats.won, 3);
    assert.equal(stats.streak, 1);
    assert.equal(stats.bestStreak, 2);
  });

  it('report the records a match broke, but none on the first match', () => {
    const first = recordMatch(emptyStats(), { won: true, longestRally: 5, topSpeed: 1.4 });
    assert.deepEqual(first.records, []);
    const second = recordMatch(first.stats, { won: true, longestRally: 9, topSpeed: 1.3 });
    assert.deepEqual(second.records, ['rally', 'streak']);
    assert.equal(second.stats.topSpeed, 1.4);
  });

  it('read broken or foreign values as zero', () => {
    assert.deepEqual(parseStats(null), emptyStats());
    const stats = parseStats({ played: 3, won: 'many', bestRally: -2, topSpeed: Infinity, extra: 1 });
    assert.equal(stats.played, 3);
    assert.equal(stats.won, 0);
    assert.equal(stats.bestRally, 0);
    assert.equal(stats.topSpeed, 0);
    assert.equal('extra' in stats, false);
  });
});

describe('settings', () => {
  it('fall back to the defaults for unknown values', () => {
    assert.deepEqual(parseSettings({ difficulty: 'hard', target: 7 }), { difficulty: 'hard', target: 7 });
    assert.deepEqual(parseSettings({ difficulty: 'insane', target: 4 }), { difficulty: 'medium', target: 5 });
    assert.deepEqual(parseSettings('garbage'), { difficulty: 'medium', target: 5 });
  });
});
