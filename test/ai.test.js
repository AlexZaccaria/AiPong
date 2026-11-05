import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DIFFICULTIES, DIFFICULTY_IDS, FIELD, STEP } from '../web/js/game/config.js';
import { createAi, steerAi } from '../web/js/game/ai.js';
import { Match } from '../web/js/game/match.js';
import { createBall, createPaddle, faceX, predictY } from '../web/js/game/physics.js';
import { seeded } from '../web/js/game/rng.js';

describe('the AI', () => {
  it('never moves faster than its level allows', () => {
    const level = DIFFICULTIES.medium;
    const ai = createAi(level, seeded(1));
    const paddle = createPaddle('right');
    const ball = createBall();
    ball.x = 100;
    ball.y = 2;
    ball.vx = 80;
    ball.vy = 0;
    const next = steerAi(ai, paddle, ball, STEP);
    assert.ok(Math.abs(next - paddle.y) <= level.speed * STEP + 1e-9);
  });

  it('heads for where the ball will arrive, within its aiming error', () => {
    const level = DIFFICULTIES.hard;
    const ai = createAi(level, seeded(2));
    const paddle = createPaddle('right');
    const ball = createBall();
    ball.x = 40;
    ball.y = 80;
    ball.vx = 70;
    ball.vy = -60;
    steerAi(ai, paddle, ball, STEP);
    const arrival = predictY(ball, faceX(paddle), true);
    assert.ok(Math.abs(ai.aim - arrival) <= level.error);
  });

  it('drifts back to the centre while the ball moves away', () => {
    const ai = createAi(DIFFICULTIES.easy, seeded(3));
    const paddle = createPaddle('right');
    const ball = createBall();
    ball.vx = -60;
    steerAi(ai, paddle, ball, STEP);
    assert.equal(ai.aim, FIELD.height / 2);
  });

  it('gets harder from easy to medium to hard', () => {
    // Matches against a player who reaches every ball: the AI's returns per point it loses.
    const returns = DIFFICULTY_IDS.map((difficulty) => {
      const rng = seeded(7);
      let hits = 0;
      let misses = 0;
      for (let game = 0; game < 40; game++) {
        const match = new Match({ difficulty, target: 3, rng });
        match.start();
        let aim = 0;
        for (let i = 0; i < 120 * 300 && match.state !== 'over'; i++) {
          const { ball } = match;
          if (ball.vx < 0) match.control.pointer = predictY(ball, faceX(match.player), true) - aim;
          else aim = (rng() * 2 - 1) * 9;
          match.step(STEP);
          for (const e of match.events.splice(0)) {
            if (e.type === 'hit' && e.side === 'ai') hits++;
            if (e.type === 'point' && e.scorer === 'player') misses++;
          }
        }
      }
      return hits / misses;
    });
    assert.ok(returns[0] < returns[1] && returns[1] < returns[2], returns.join(' < '));
  });
});
