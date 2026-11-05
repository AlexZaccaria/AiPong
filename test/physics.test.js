import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BALL, FIELD, STEP } from '../web/js/game/config.js';
import { bounce, createBall, createPaddle, faceX, hitPaddle, moveBall, outSide, placePaddle, predictY, speedOf } from '../web/js/game/physics.js';

/** A ball about to reach the left paddle's face at height `y`, moving left at `speed`. */
function incomingLeft(paddle, y, speed = 60) {
  const ball = createBall();
  ball.x = faceX(paddle) + ball.r + 0.2;
  ball.y = y;
  ball.vx = -speed;
  ball.vy = 0;
  return ball;
}

describe('walls', () => {
  it('reflects the ball off the top wall and keeps it inside', () => {
    const ball = createBall();
    ball.y = ball.r + 0.1;
    ball.vx = 10;
    ball.vy = -60;
    assert.equal(moveBall(ball, STEP), true);
    assert.ok(ball.y - ball.r >= 0);
    assert.ok(ball.vy > 0);
  });

  it('reflects the ball off the bottom wall', () => {
    const ball = createBall();
    ball.y = FIELD.height - ball.r - 0.1;
    ball.vy = 60;
    assert.equal(moveBall(ball, STEP), true);
    assert.ok(ball.y + ball.r <= FIELD.height);
    assert.ok(ball.vy < 0);
  });
});

describe('paddle hits', () => {
  it('sends a ball hitting the centre straight back, 5% faster', () => {
    const paddle = createPaddle('left');
    const ball = incomingLeft(paddle, paddle.y + paddle.h / 2);
    moveBall(ball, STEP);
    const offset = hitPaddle(ball, paddle);
    assert.ok(Math.abs(offset) < 0.01);
    bounce(ball, paddle, offset, 1000);
    assert.ok(ball.vx > 0);
    assert.ok(Math.abs(ball.vy) < 0.5);
    assert.ok(Math.abs(speedOf(ball) - 60 * BALL.speedUp) < 1e-9);
  });

  it('angles the return by where the ball meets the paddle', () => {
    const paddle = createPaddle('left');
    const ball = incomingLeft(paddle, paddle.y + paddle.h);
    moveBall(ball, STEP);
    const offset = hitPaddle(ball, paddle);
    assert.ok(offset > 0.8);
    bounce(ball, paddle, offset, 1000);
    const angle = Math.atan2(ball.vy, ball.vx);
    assert.ok(angle > 0.7 * BALL.maxBounce && angle <= BALL.maxAngle);
  });

  it('adds spin in the direction the paddle is moving', () => {
    const still = createPaddle('left');
    const moving = createPaddle('left');
    moving.vy = BALL.spinAt;
    const a = incomingLeft(still, still.y + still.h / 2);
    const b = incomingLeft(moving, moving.y + moving.h / 2);
    bounce(a, still, 0, 1000);
    bounce(b, moving, 0, 1000);
    assert.ok(Math.abs(Math.atan2(b.vy, b.vx) - BALL.maxSpin) < 1e-9);
    assert.ok(Math.abs(a.vy) < 1e-9);
  });

  it('never returns the ball steeper than the maximum angle', () => {
    const paddle = createPaddle('left');
    paddle.vy = 10 * BALL.spinAt;
    const ball = incomingLeft(paddle, paddle.y + paddle.h);
    bounce(ball, paddle, 1, 1000);
    assert.ok(Math.atan2(ball.vy, ball.vx) <= BALL.maxAngle + 1e-9);
  });

  it('caps the speed', () => {
    const paddle = createPaddle('left');
    const ball = incomingLeft(paddle, paddle.y + paddle.h / 2, 99);
    bounce(ball, paddle, 0, 100);
    assert.equal(speedOf(ball), 100);
  });

  it('does not pull back a ball that is already behind the face', () => {
    const paddle = createPaddle('left');
    const ball = incomingLeft(paddle, paddle.y + paddle.h / 2);
    ball.x = faceX(paddle) - 0.5;
    moveBall(ball, STEP);
    assert.equal(hitPaddle(ball, paddle), null);
  });

  it('misses a ball passing above the paddle', () => {
    const paddle = createPaddle('left');
    const ball = incomingLeft(paddle, paddle.y - BALL.radius - 1);
    moveBall(ball, STEP);
    assert.equal(hitPaddle(ball, paddle), null);
  });

  it('hits the right paddle from the left only', () => {
    const paddle = createPaddle('right');
    const ball = createBall();
    ball.x = faceX(paddle) - ball.r - 0.2;
    ball.y = paddle.y + paddle.h / 2;
    ball.vx = 60;
    moveBall(ball, STEP);
    const offset = hitPaddle(ball, paddle);
    assert.notEqual(offset, null);
    bounce(ball, paddle, offset, 1000);
    assert.ok(ball.vx < 0);
    assert.ok(ball.x + ball.r <= faceX(paddle));
  });
});

describe('paddles', () => {
  it('stay inside the field', () => {
    const paddle = createPaddle('left');
    placePaddle(paddle, -50, STEP);
    assert.equal(paddle.y, 0);
    placePaddle(paddle, 500, STEP);
    assert.equal(paddle.y, FIELD.height - paddle.h);
  });

  it('track a smoothed velocity', () => {
    const paddle = createPaddle('left');
    for (let i = 0; i < 60; i++) placePaddle(paddle, paddle.y + 0.5, STEP);
    assert.ok(Math.abs(paddle.vy - 0.5 / STEP) < 1);
  });
});

describe('prediction', () => {
  it('matches where the ball actually crosses, bounces included', () => {
    const ball = createBall();
    ball.x = 20;
    ball.y = 30;
    ball.vx = 70;
    ball.vy = -110;
    const x = 140;
    const predicted = predictY(ball, x, true);
    while (ball.x < x) moveBall(ball, STEP / 20);
    assert.ok(Math.abs(ball.y - predicted) < 0.5, `${ball.y} vs ${predicted}`);
  });

  it('ignores the walls when asked to', () => {
    const ball = createBall();
    ball.x = 20;
    ball.y = 30;
    ball.vx = 70;
    ball.vy = -110;
    assert.equal(predictY(ball, 140, false), ball.r);
  });
});

describe('out of the field', () => {
  it('tells which side the ball left from', () => {
    const ball = createBall();
    ball.x = -ball.r - 0.01;
    assert.equal(outSide(ball), 'left');
    ball.x = FIELD.width + ball.r + 0.01;
    assert.equal(outSide(ball), 'right');
    ball.x = FIELD.width / 2;
    assert.equal(outSide(ball), null);
  });
});
