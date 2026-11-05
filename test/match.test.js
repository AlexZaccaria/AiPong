import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BALL, FIELD, STEP, TIMING } from '../web/js/game/config.js';
import { Match } from '../web/js/game/match.js';
import { bounce } from '../web/js/game/physics.js';
import { seeded } from '../web/js/game/rng.js';

const run = (match, seconds) => {
  for (let t = 0; t < seconds; t += STEP) match.step(STEP);
};

/** A started match whose ball has just been served. */
function served(options = {}) {
  const match = new Match({ rng: seeded(1), ...options });
  match.start();
  run(match, TIMING.serve + STEP);
  assert.equal(match.state, 'playing');
  return match;
}

/** Puts the ball past the left edge, moving out: the AI scores on the next step. */
function concede(match) {
  match.ball.x = -match.ball.r + 0.01;
  match.ball.vx = -50;
  match.ball.vy = 0;
  match.step(STEP);
}

const types = (match) => match.events.splice(0).map((e) => e.type);

describe('a match', () => {
  it('waits for start, then serves after the serve delay', () => {
    const match = new Match({ rng: seeded(2) });
    run(match, 2);
    assert.equal(match.state, 'ready');
    match.start();
    assert.equal(match.state, 'serve');
    run(match, TIMING.serve - 0.05);
    assert.equal(match.state, 'serve');
    run(match, 0.1);
    assert.equal(match.state, 'playing');
    assert.deepEqual(types(match), ['start', 'serve']);
  });

  it('gives the point to the AI when the ball leaves on the left, then serves to the player', () => {
    const match = served();
    concede(match);
    assert.equal(match.state, 'point');
    assert.deepEqual(match.score, { player: 0, ai: 1 });
    run(match, TIMING.point + TIMING.serve + STEP);
    assert.equal(match.state, 'playing');
    assert.ok(match.ball.vx < 0, 'served towards the player, who conceded');
  });

  it('ends when someone reaches the target, after the point pause', () => {
    const match = served({ target: 3 });
    for (let i = 0; i < 3; i++) {
      concede(match);
      if (i < 2) run(match, TIMING.point + TIMING.serve + STEP);
    }
    assert.equal(match.state, 'point');
    run(match, TIMING.point + STEP);
    assert.equal(match.state, 'over');
    assert.equal(match.winner, 'ai');
    assert.ok(types(match).includes('over'));
  });

  it('does not end before the target', () => {
    const match = served({ target: 5 });
    for (let i = 0; i < 4; i++) {
      concede(match);
      run(match, TIMING.point + TIMING.serve + STEP);
    }
    assert.equal(match.state, 'playing');
    assert.equal(match.winner, null);
  });

  it('freezes the ball while paused', () => {
    const match = served();
    const { x, y } = match.ball;
    assert.equal(match.pause(), true);
    run(match, 3);
    assert.deepEqual([match.ball.x, match.ball.y], [x, y]);
    assert.equal(match.resume(), true);
    match.step(STEP);
    assert.notEqual(match.ball.x, x);
  });

  // The old version scheduled the next serve with setTimeout and skipped it if the game was
  // paused at that moment: the ball stayed out of the field for good.
  it('serves again after a pause taken right after a point, however long the pause', () => {
    const match = served();
    concede(match);
    match.pause();
    run(match, 60);
    match.resume();
    run(match, TIMING.point + TIMING.serve + STEP);
    assert.equal(match.state, 'playing');
    assert.ok(match.ball.x > 0 && match.ball.x < FIELD.width);
  });

  // The old version ended the match with setTimeout too, so a reset during the last point's
  // pause was followed by "Computer wins!" on a fresh 0-0.
  it('cannot be ended by the match it replaced', () => {
    const old = served({ target: 1 });
    concede(old);
    const fresh = new Match({ rng: seeded(3), target: 1 });
    run(old, TIMING.point + STEP);
    run(fresh, TIMING.point + STEP);
    assert.equal(old.state, 'over');
    assert.equal(fresh.state, 'ready');
    assert.deepEqual(fresh.score, { player: 0, ai: 0 });
  });

  it('only pauses while running, and resumes where it was', () => {
    const match = new Match({ rng: seeded(4) });
    assert.equal(match.pause(), false);
    match.start();
    assert.equal(match.pause(), true);
    assert.equal(match.state, 'paused');
    assert.equal(match.resume(), true);
    assert.equal(match.state, 'serve');
  });

  it('counts the rally and keeps the longest one and the top speed', () => {
    const match = served();
    // The player's paddle always meets the ball.
    let hits = 0;
    for (let i = 0; i < 120 * 30 && hits < 6; i++) {
      match.control.pointer = match.ball.y;
      match.step(STEP);
      hits += match.events.splice(0).filter((e) => e.type === 'hit').length;
    }
    assert.ok(match.rally >= 2);
    assert.equal(match.longestRally, Math.max(match.longestRally, match.rally));
    assert.ok(match.topSpeed > 1);
  });

  it('lets the ball reach three times its serve speed, and no faster', () => {
    for (const difficulty of ['easy', 'hard']) {
      const match = new Match({ difficulty, rng: seeded(6) });
      const { ball, player } = match;
      ball.vx = -match.serveSpeed;
      ball.vy = 0;
      for (let i = 0; i < 40; i++) {
        bounce(ball, player, 0, match.maxSpeed);
        ball.vx = -Math.abs(ball.vx);
      }
      assert.ok(Math.abs(match.speed - BALL.topSpeed) < 1e-9, `${difficulty}: ${match.speed}`);
    }
  });

  it('moves the player paddle with the keys', () => {
    const match = new Match({ rng: seeded(5) });
    const start = match.player.y;
    match.control.keys = 1;
    run(match, 0.2);
    assert.ok(match.player.y > start);
    match.control.keys = 0;
    const stopped = match.player.y;
    run(match, 0.2);
    assert.equal(match.player.y, stopped);
  });
});
