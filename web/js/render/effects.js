// The show around the game: sparks, sparkles, confetti and embers, shockwave rings, wall flashes,
// floor cells lighting up, the ball's trail and fire, paddle pulses, the arena flash, "GOAL!",
// rally milestones, the stage lights behind the arena and the screen shake. Positions are in field
// units; delayed waves run on this clock, which stops while the match is paused. With "reduce
// motion" only the texts and the paddle pulse remain.

import { FIELD } from '../game/config.js';
import { speedOf } from '../game/physics.js';
import { HEX, hexAt } from './hex.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MAX_PARTICLES = 900;
const TRAIL_LENGTH = 14;
export const GOAL_TIME = 1.5;
export const MILESTONE_TIME = 1.2;

const rand = (min, max) => min + Math.random() * (max - min);
/** How much harder the screen shakes at a given ball speed (1 at the serve, 2.8 at three times it). */
const quake = (speed = 1) => 1 + Math.max(0, speed - 1) * 0.9;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export class Effects {
  constructor() {
    this.clear();
  }

  clear() {
    this.particles = [];
    this.rings = [];
    this.walls = [];
    this.waves = [];
    /** Lit floor cells by key: { x, y, glow, color }. */
    this.cells = new Map();
    /** Stage lights behind the arena, one per side: they flare on hits and points. */
    this.glow = { player: 0, ai: 0 };
    this.trail = [];
    this.pulse = { player: 0, ai: 0 };
    this.flash = null;
    this.goal = null;
    this.milestone = null;
    /** 1 right after a hit, for the rally counter's pop. */
    this.rallyPop = 0;
    /** Colour of the paddle that hit the ball last; null after a serve. */
    this.tint = null;
    /** 0 to 1 above 80% of the ball's top speed: the ball is on fire. */
    this.heat = 0;
    this.embers = 0;
    this.shake = 0;
    this.time = 0;
  }

  get calm() {
    return reducedMotion.matches;
  }

  serve() {
    this.tint = null;
    this.trail.length = 0;
  }

  hit({ side, x, y, offset, speed, rally }, palette) {
    const color = palette[side];
    this.pulse[side] = 1;
    this.tint = color;
    this.rallyPop = 1;
    this.glow[side] = Math.max(this.glow[side], 0.7);
    if (this.calm) return;
    this.#lightAround(x, y, color, 1);
    const direction = side === 'player' ? 0 : Math.PI;
    this.#burst(x, y, { color, count: 10 + Math.min(rally, 20), speed: 24 + speed * 14, spread: 1.3, direction });
    this.#burst(x, y, { color: palette.white, count: 4, speed: 16, spread: Math.PI, kind: 'sparkle', size: 0.5 });
    this.#ring(x, y, color, { grow: 45 + speed * 12, width: 0.7, decay: 3 });
    this.shake = Math.max(this.shake, (2.5 + Math.abs(offset) * 3) * quake(speed));
  }

  /** Every fifth hit of a rally: a golden burst around the ball. */
  rally(count, { x, y, speed }, palette) {
    this.milestone = { count, age: 0 };
    if (this.calm) return;
    this.#lightAround(x, y, palette.gold, 2);
    this.#burst(x, y, { color: palette.gold, count: 28, speed: 36, spread: Math.PI, kind: 'sparkle', size: 0.65 });
    this.#ring(x, y, palette.gold, { grow: 75, width: 1, decay: 1.8 });
    this.shake = Math.max(this.shake, 4 * quake(speed));
  }

  wall({ x, y, speed }, palette) {
    const top = y < FIELD.height / 2;
    const color = this.tint ?? palette.white;
    this.walls.push({ x, y: top ? 0 : FIELD.height, life: 1, color });
    if (this.calm) return;
    this.#burst(x, top ? 0.5 : FIELD.height - 0.5, { color, count: 8, speed: 22, spread: 1.1, direction: top ? Math.PI / 2 : -Math.PI / 2 });
    this.shake = Math.max(this.shake, 1.5 * quake(speed));
  }

  /** "GOAL!" and the five waves of the first AiPong's goal explosion, from the edge the ball crossed. */
  point({ scorer, x, y, speed }, palette) {
    const color = palette[scorer];
    this.goal = { color, age: 0 };
    this.flash = { color, life: 1 };
    this.glow[scorer] = 1.6;
    this.tint = null;
    this.heat = 0;
    if (this.calm) return;
    const edge = clamp(x, 0, FIELD.width);
    const inward = edge === 0 ? 0 : Math.PI;
    const side = edge === 0 ? 1 : -1;
    this.#floorWave(edge, side, color);
    const secondary = scorer === 'player' ? palette.gold : palette.ember;
    this.#burst(edge, y, { color, count: 40, speed: 62, spread: 1.4, direction: inward, size: 0.9 });
    this.#ring(edge, y, color, { grow: 120, width: 1.6, decay: 1.3 });
    this.#later(0.1, () => this.#burst(edge, y, { color: secondary, count: 30, speed: 46, spread: 1.5, direction: inward }));
    this.#later(0.2, () => this.#burst(edge, y, { color: palette.white, count: 25, speed: 36, spread: Math.PI, kind: 'sparkle' }));
    palette.confetti.slice(0, 5).forEach((c, i) => this.#later(0.3 + i * 0.05, () => this.#confetti(edge, y, c, 15, inward)));
    for (let i = 0; i < 5; i++) {
      this.#later(0.5 + i * 0.1, () => {
        const sx = clamp(edge + side * rand(6, 40), 2, FIELD.width - 2);
        const sy = clamp(y + rand(-25, 25), 2, FIELD.height - 2);
        this.#burst(sx, sy, { color: palette.white, count: 8, speed: 14, spread: Math.PI, kind: 'sparkle' });
      });
    }
    this.shake = 10 + 5 * quake(speed);
  }

  /** The player won: confetti from the top and fireworks across the field. */
  win(palette) {
    this.flash = { color: palette.player, life: 1.4 };
    this.glow.player = 2;
    if (this.calm) return;
    // The floor twinkles in every colour of the palette.
    for (let i = 0; i < 30; i++) {
      this.#later(i * 0.06, () => {
        for (let k = 0; k < 6; k++) this.#light(rand(0, FIELD.width), rand(0, FIELD.height), pick(palette.confetti), 1);
      });
    }
    for (let i = 0; i < 160; i++) {
      this.#add({
        kind: 'confetti',
        x: rand(0, FIELD.width),
        y: rand(-30, -2),
        vx: rand(-12, 12),
        vy: rand(10, 34),
        gravity: 22,
        drag: 0.35,
        life: 1,
        decay: 1 / rand(2.4, 3.6),
        size: rand(0.6, 1.3),
        spin: rand(-8, 8),
        angle: rand(0, Math.PI),
        color: palette.confetti[i % palette.confetti.length],
      });
    }
    for (let i = 0; i < 7; i++) {
      this.#later(i * 0.28 + rand(0, 0.12), () => {
        const x = rand(20, FIELD.width - 20);
        const y = rand(15, FIELD.height - 30);
        const color = pick(palette.confetti);
        this.#burst(x, y, { color, count: 46, speed: 50, spread: Math.PI, size: 0.75, gravity: 18 });
        this.#burst(x, y, { color: palette.white, count: 10, speed: 22, spread: Math.PI, kind: 'sparkle' });
        this.#ring(x, y, color, { grow: 62, width: 0.8, decay: 1.6 });
      });
    }
    this.shake = 10;
  }

  /** The AI won: embers drifting down over the field. */
  lose(palette) {
    this.flash = { color: palette.ai, life: 1.4 };
    this.glow.ai = 2;
    if (this.calm) return;
    this.#floorWave(FIELD.width, -1, palette.ai);
    for (let i = 0; i < 90; i++) {
      this.#add({
        kind: 'spark',
        x: rand(0, FIELD.width),
        y: rand(-10, FIELD.height * 0.6),
        vx: rand(-4, 4),
        vy: rand(4, 14),
        gravity: 0,
        drag: 0.2,
        life: 1,
        decay: 1 / rand(1.6, 2.8),
        size: rand(0.3, 0.8),
        spin: 0,
        angle: 0,
        color: pick([palette.ai, palette.ember, palette.gold]),
      });
    }
    this.shake = 8;
  }

  /** Records where the ball was drawn; a jump (a new serve) starts a new trail. */
  sampleTrail(x, y) {
    const last = this.trail.at(-1);
    if (last && Math.hypot(x - last.x, y - last.y) > 12) this.trail.length = 0;
    this.trail.push({ x, y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  update(dt, match, palette) {
    this.time += dt;
    for (const wave of this.waves) wave.at -= dt;
    const due = this.waves.filter((w) => w.at <= 0);
    this.waves = this.waves.filter((w) => w.at > 0);
    for (const wave of due) wave.run();

    this.#burn(dt, match, palette);
    // The floor lights up under the ball, in its colour.
    if (match.state === 'playing' && !this.calm) this.#light(match.ball.x, match.ball.y, this.tint ?? palette.neutral, 0.9);
    for (const [key, cell] of this.cells) {
      if ((cell.glow -= dt * 1.5) <= 0) this.cells.delete(key);
    }
    this.glow.player = Math.max(0, this.glow.player - dt * 1.2);
    this.glow.ai = Math.max(0, this.glow.ai - dt * 1.2);

    for (const p of this.particles) {
      const drag = Math.exp(-dt * p.drag);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.life -= p.decay * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.r += r.grow * dt * r.life;
      r.life -= r.decay * dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const w of this.walls) w.life -= dt * 3;
    this.walls = this.walls.filter((w) => w.life > 0);

    if (this.flash && (this.flash.life -= dt * 1.4) <= 0) this.flash = null;
    if (this.goal && (this.goal.age += dt) >= GOAL_TIME) this.goal = null;
    if (this.milestone && (this.milestone.age += dt) >= MILESTONE_TIME) this.milestone = null;
    this.pulse.player = Math.max(0, this.pulse.player - dt * 4);
    this.pulse.ai = Math.max(0, this.pulse.ai - dt * 4);
    this.rallyPop = Math.max(0, this.rallyPop - dt * 4);
    this.shake = this.shake < 0.05 ? 0 : this.shake * Math.exp(-dt * 9);
  }

  /** This frame's shake, in CSS pixels. */
  shakeOffset() {
    if (!this.shake || this.calm) return [0, 0];
    return [(Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake];
  }

  /** Above 80% of its top speed the ball heats up and sheds embers behind it. */
  #burn(dt, match, palette) {
    if (match.state !== 'playing') {
      this.heat = 0;
      return;
    }
    const { ball } = match;
    this.heat = clamp((speedOf(ball) / match.maxSpeed - 0.8) / 0.2, 0, 1);
    if (!this.heat || this.calm) return;
    // A ball on fire makes the whole arena tremble.
    this.shake = Math.max(this.shake, this.heat * 2.5);
    this.embers += this.heat * 110 * dt;
    while (this.embers >= 1) {
      this.embers -= 1;
      this.#add({
        kind: 'spark',
        x: ball.x + rand(-0.6, 0.6),
        y: ball.y + rand(-0.6, 0.6),
        vx: -ball.vx * 0.12 + rand(-6, 6),
        vy: -ball.vy * 0.12 + rand(-6, 6),
        gravity: 0,
        drag: 2,
        life: 1,
        decay: 1 / rand(0.25, 0.5),
        size: rand(0.35, 0.8),
        spin: 0,
        angle: 0,
        color: pick([palette.ember, palette.gold, palette.ai]),
      });
    }
  }

  #burst(x, y, { color, count, speed, spread, direction = 0, kind = 'spark', size = 0.6, gravity = 0 }) {
    for (let i = 0; i < count; i++) {
      const angle = direction + (Math.random() * 2 - 1) * spread;
      const s = speed * rand(0.35, 1);
      this.#add({
        kind,
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        gravity,
        drag: kind === 'sparkle' ? 2.5 : 3,
        life: 1,
        decay: 1 / rand(0.35, kind === 'sparkle' ? 0.9 : 0.7),
        size: size * rand(0.5, 1.2),
        spin: 0,
        angle: 0,
        twinkle: rand(14, 26),
        color,
      });
    }
  }

  #confetti(x, y, color, count, direction) {
    for (let i = 0; i < count; i++) {
      const angle = direction + (Math.random() * 2 - 1) * 1.4;
      const s = rand(18, 50);
      this.#add({
        kind: 'confetti',
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s - 12,
        gravity: 30,
        drag: 1.2,
        life: 1,
        decay: 1 / rand(1.2, 1.9),
        size: rand(0.5, 1),
        spin: rand(-10, 10),
        angle: rand(0, Math.PI),
        color,
      });
    }
  }

  #light(x, y, color, strength) {
    if (x < -HEX.size || x > FIELD.width + HEX.size || y < -HEX.size || y > FIELD.height + HEX.size) return;
    const cell = hexAt(x, y);
    const lit = this.cells.get(cell.key);
    if (lit && lit.glow >= strength) return;
    this.cells.set(cell.key, { x: cell.x, y: cell.y, glow: strength, color });
  }

  /** The cell under (x, y) and the `rings` rings of cells around it. */
  #lightAround(x, y, color, rings) {
    this.#light(x, y, color, 1);
    for (let ring = 1; ring <= rings; ring++) {
      const count = 6 * ring;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count;
        this.#light(x + Math.cos(a) * HEX.width * ring, y + Math.sin(a) * HEX.width * ring, color, 1 - ring * 0.25);
      }
    }
  }

  /** A wave of lit cells sweeping across the floor from an edge (`side` 1 = rightwards). */
  #floorWave(edge, side, color) {
    const columns = Math.ceil(FIELD.width / HEX.width) + 1;
    for (let k = 0; k < columns; k++) {
      this.#later(k * 0.045, () => {
        for (let y = 0; y <= FIELD.height; y += HEX.row / 2) this.#light(edge + side * k * HEX.width, y, color, 1 - k * 0.035);
      });
    }
  }

  #ring(x, y, color, { grow, width, decay }) {
    this.rings.push({ x, y, r: 0.5, grow, width, decay, life: 1, color });
  }

  #later(delay, run) {
    this.waves.push({ at: delay, run });
  }

  #add(particle) {
    this.particles.push(particle);
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }
}
