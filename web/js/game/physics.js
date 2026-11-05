// Ball and paddles as plain objects, moved by pure functions: no DOM, no clock, so Node can test
// them step by step. Positions are in field units (config.js); `prevX`/`prevY` hold the previous
// step, used to find where the ball crossed a paddle and by the renderer to interpolate.

import { BALL, FIELD, PADDLE } from './config.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createBall() {
  const ball = { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, r: BALL.radius };
  centerBall(ball);
  return ball;
}

/** Puts the ball still at the centre, with no trail to interpolate from. */
export function centerBall(ball) {
  ball.x = ball.prevX = FIELD.width / 2;
  ball.y = ball.prevY = FIELD.height / 2;
  ball.vx = ball.vy = 0;
}

/** Sends the ball from the centre towards `direction` (-1 left, 1 right) at a random angle. */
export function serve(ball, direction, speed, rng) {
  centerBall(ball);
  const angle = (rng() * 2 - 1) * BALL.serveAngle;
  ball.vx = Math.cos(angle) * speed * direction;
  ball.vy = Math.sin(angle) * speed;
}

export const speedOf = (ball) => Math.hypot(ball.vx, ball.vy);

/** Moves the ball by `dt` and reflects it off the top and bottom walls. Returns true on a wall bounce. */
export function moveBall(ball, dt) {
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const { r } = ball;
  if (ball.y - r < 0) {
    ball.y = 2 * r - ball.y;
    ball.vy = Math.abs(ball.vy);
    return true;
  }
  if (ball.y + r > FIELD.height) {
    ball.y = 2 * (FIELD.height - r) - ball.y;
    ball.vy = -Math.abs(ball.vy);
    return true;
  }
  return false;
}

export function createPaddle(side) {
  const x = side === 'left' ? PADDLE.inset : FIELD.width - PADDLE.inset - PADDLE.width;
  const y = (FIELD.height - PADDLE.height) / 2;
  return { side, x, y, prevY: y, w: PADDLE.width, h: PADDLE.height, vy: 0 };
}

/** The x of the face the ball bounces on: the right edge of the left paddle and vice versa. */
export const faceX = (paddle) => (paddle.side === 'left' ? paddle.x + paddle.w : paddle.x);

/**
 * Moves a paddle's top edge to `y`, inside the field, and updates its velocity. The velocity is
 * smoothed over about 50 ms: pointer events and simulation steps don't tick together, and the spin
 * must follow the hand's movement, not that jitter.
 */
export function placePaddle(paddle, y, dt) {
  paddle.prevY = paddle.y;
  paddle.y = clamp(y, 0, FIELD.height - paddle.h);
  const instant = (paddle.y - paddle.prevY) / dt;
  paddle.vy += (instant - paddle.vy) * (1 - Math.exp(-dt / 0.05));
}

/**
 * Whether the last move took the ball onto the paddle's face. Returns where it met the paddle,
 * from -1 (top end) to 1 (bottom end), or null. A ball already behind the face is not hit: it
 * can't be pulled back into play from behind the paddle.
 */
export function hitPaddle(ball, paddle) {
  const left = paddle.side === 'left';
  if (left ? ball.vx >= 0 : ball.vx <= 0) return null;
  const face = faceX(paddle);
  const { r } = ball;
  const wasInFront = left ? ball.prevX - r >= face : ball.prevX + r <= face;
  const reaches = left ? ball.x - r <= face : ball.x + r >= face;
  if (!wasInFront || !reaches) return null;

  // Where along the move the ball's edge crossed the face, and the height there.
  const t = left ? (ball.prevX - r - face) / (ball.prevX - ball.x) : (face - ball.prevX - r) / (ball.x - ball.prevX);
  const y = ball.prevY + (ball.y - ball.prevY) * t;
  if (y + r < paddle.y || y - r > paddle.y + paddle.h) return null;
  return clamp((y - (paddle.y + paddle.h / 2)) / (paddle.h / 2 + r), -1, 1);
}

/**
 * Sends the ball back from the paddle: the angle comes from where it hit (`offset`) plus the
 * paddle's own movement, the speed grows by BALL.speedUp up to `maxSpeed`.
 */
export function bounce(ball, paddle, offset, maxSpeed) {
  const spin = clamp(paddle.vy / BALL.spinAt, -1, 1) * BALL.maxSpin;
  const angle = clamp(offset * BALL.maxBounce + spin, -BALL.maxAngle, BALL.maxAngle);
  const speed = Math.min(speedOf(ball) * BALL.speedUp, maxSpeed);
  const direction = paddle.side === 'left' ? 1 : -1;
  ball.vx = Math.cos(angle) * speed * direction;
  ball.vy = Math.sin(angle) * speed;
  ball.x = faceX(paddle) + direction * ball.r;
}

/** 'left' or 'right' once the ball has completely left the field on that side. */
export function outSide(ball) {
  if (ball.x + ball.r < 0) return 'left';
  if (ball.x - ball.r > FIELD.width) return 'right';
  return null;
}

/**
 * The height at which the ball will cross `x`. With `reflect` it follows the bounces off the
 * walls; without, it follows the straight line, kept inside the field.
 */
export function predictY(ball, x, reflect) {
  const t = ball.vx === 0 ? 0 : (x - ball.x) / ball.vx;
  if (t <= 0) return ball.y;
  const y = ball.y + ball.vy * t;
  const { r } = ball;
  if (!reflect) return clamp(y, r, FIELD.height - r);
  // Unfold the bounces: positions repeat every two crossings of the free span.
  const span = FIELD.height - 2 * r;
  const p = (((y - r) % (2 * span)) + 2 * span) % (2 * span);
  return r + (p > span ? 2 * span - p : p);
}
