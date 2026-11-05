// The opponent. It plays like a person rather than a machine: it looks at the ball only every
// `reaction` seconds, picks a slightly wrong spot each time the ball comes its way, moves at a
// limited speed and, below the hard level, doesn't see a bounce off the wall coming until the
// ball is close.

import { FIELD } from './config.js';
import { faceX, predictY } from './physics.js';

/** Distance from its paddle within which every level works out the bounces. */
const CLOSE = 30;

export function createAi(level, rng) {
  return { level, rng, cooldown: 0, aim: FIELD.height / 2, error: 0, approaching: false };
}

/** Where the AI moves its paddle in this step: the paddle's new top edge. */
export function steerAi(ai, paddle, ball, dt) {
  const { level } = ai;
  const approaching = paddle.side === 'right' ? ball.vx > 0 : ball.vx < 0;
  // A new error for each shot, not each look: aiming errors don't wobble mid-flight.
  if (approaching && !ai.approaching) ai.error = (ai.rng() * 2 - 1) * level.error;
  ai.approaching = approaching;

  ai.cooldown -= dt;
  if (ai.cooldown <= 0) {
    ai.cooldown += level.reaction;
    if (approaching) {
      const face = faceX(paddle);
      const close = Math.abs(face - ball.x) < CLOSE;
      ai.aim = predictY(ball, face, level.predictBounces || close) + ai.error;
    } else {
      ai.aim = FIELD.height / 2;
    }
    if (ai.cooldown < 0) ai.cooldown = level.reaction;
  }

  const gap = ai.aim - (paddle.y + paddle.h / 2);
  const reach = level.speed * dt;
  return paddle.y + (Math.abs(gap) <= reach ? gap : Math.sign(gap) * reach);
}
