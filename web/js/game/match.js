// One match, as a state machine advanced in fixed steps. Every wait (the serve, the pause after a
// point) is counted in game time inside `step`: pausing freezes it, and a new match is a new
// object, so nothing scheduled by the old one can fire into it.
//
//   ready
//     └─ start() → serve
//          └─ playing
//               └─ point
//                    ├─ serve again, while nobody has reached the target
//                    └─ over
//   serve, playing, point
//     └─ pause() → paused
//          └─ resume() → back where it was

import { BALL, DIFFICULTIES, PADDLE, TIMING } from './config.js';
import { createAi, steerAi } from './ai.js';
import { bounce, centerBall, createBall, createPaddle, hitPaddle, moveBall, outSide, placePaddle, serve, speedOf } from './physics.js';

const RUNNING = new Set(['serve', 'playing', 'point']);

export class Match {
  constructor({ difficulty = 'medium', target = 5, rng = Math.random } = {}) {
    this.difficulty = difficulty;
    this.target = target;
    this.rng = rng;
    const level = DIFFICULTIES[difficulty];
    this.serveSpeed = BALL.serveSpeed * level.ballScale;
    this.maxSpeed = this.serveSpeed * BALL.topSpeed;

    this.ball = createBall();
    this.player = createPaddle('left');
    this.opponent = createPaddle('right');
    this.ai = createAi(level, rng);
    /** The player's paddle follows `pointer` (a centre y) or, while held, the keys (-1, 0, 1). */
    this.control = { pointer: null, keys: 0 };

    this.state = 'ready';
    this.pausedIn = null;
    this.timer = 0;
    this.receiver = rng() < 0.5 ? 'player' : 'ai';
    this.score = { player: 0, ai: 0 };
    this.winner = null;
    this.rally = 0;
    this.longestRally = 0;
    /** Fastest ball of the match, as a multiple of the standard serve. */
    this.topSpeed = 0;
    /** What happened since the caller last drained it: sounds, effects and announcements. */
    this.events = [];
  }

  get running() {
    return RUNNING.has(this.state);
  }

  start() {
    if (this.state !== 'ready') return false;
    this.#toServe();
    this.events.push({ type: 'start' });
    return true;
  }

  pause() {
    if (!this.running) return false;
    this.pausedIn = this.state;
    this.state = 'paused';
    this.events.push({ type: 'pause' });
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = this.pausedIn;
    this.pausedIn = null;
    this.events.push({ type: 'resume' });
    return true;
  }

  /** The ball's speed as a multiple of this match's serve: from 1 to BALL.topSpeed. */
  get speed() {
    return speedOf(this.ball) / this.serveSpeed;
  }

  step(dt) {
    if (this.state === 'paused') return;
    this.#movePlayer(dt);
    if (this.state === 'ready' || this.state === 'over') {
      placePaddle(this.opponent, this.opponent.y, dt);
      return;
    }
    placePaddle(this.opponent, steerAi(this.ai, this.opponent, this.ball, dt), dt);

    if (this.state === 'serve') {
      this.timer -= dt;
      if (this.timer <= 0) {
        serve(this.ball, this.receiver === 'player' ? -1 : 1, this.serveSpeed, this.rng);
        this.state = 'playing';
        this.events.push({ type: 'serve' });
      }
      return;
    }
    if (this.state === 'point') {
      this.timer -= dt;
      if (this.timer <= 0) this.#afterPoint();
      return;
    }

    const { ball } = this;
    if (moveBall(ball, dt)) this.events.push({ type: 'wall', x: ball.x, y: ball.y, speed: this.speed });
    for (const paddle of [this.player, this.opponent]) {
      const offset = hitPaddle(ball, paddle);
      if (offset === null) continue;
      bounce(ball, paddle, offset, this.maxSpeed);
      this.rally += 1;
      this.longestRally = Math.max(this.longestRally, this.rally);
      this.topSpeed = Math.max(this.topSpeed, this.speed);
      const side = paddle === this.player ? 'player' : 'ai';
      this.events.push({ type: 'hit', side, x: ball.x, y: ball.y, offset, speed: this.speed, rally: this.rally });
    }
    const out = outSide(ball);
    if (out) this.#point(out === 'left' ? 'ai' : 'player');
  }

  #movePlayer(dt) {
    const { control, player } = this;
    let y = player.y;
    if (control.keys) {
      y += control.keys * PADDLE.keySpeed * dt;
      control.pointer = null;
    } else if (control.pointer !== null) {
      y = control.pointer - player.h / 2;
    }
    placePaddle(player, y, dt);
  }

  #toServe() {
    centerBall(this.ball);
    this.rally = 0;
    this.state = 'serve';
    this.timer = TIMING.serve;
  }

  #point(scorer) {
    this.score[scorer] += 1;
    // The next serve goes to whoever conceded.
    this.receiver = scorer === 'player' ? 'ai' : 'player';
    const { ball } = this;
    const speed = this.speed;
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.vx = ball.vy = 0;
    this.state = 'point';
    this.timer = TIMING.point;
    this.events.push({ type: 'point', scorer, score: { ...this.score }, x: ball.x, y: ball.y, speed });
  }

  #afterPoint() {
    const { player, ai } = this.score;
    if (player < this.target && ai < this.target) {
      this.#toServe();
      return;
    }
    this.winner = player >= this.target ? 'player' : 'ai';
    this.state = 'over';
    centerBall(this.ball);
    this.events.push({ type: 'over', winner: this.winner });
  }
}
