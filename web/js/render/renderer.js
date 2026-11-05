// Draws a match on the canvas: a dark arena where the game is the loud thing. The game lives in
// field units (160 × 100); here they become device pixels at the screen's density. The static
// arena (gradient, each side's colour, hexagons, goal lines, corners, the net and the centre
// circle, scan lines) is painted once into a cached layer;
// each frame lays it over the previous one at partial opacity, so moving lights leave a short
// phosphor afterglow. Glows are cached radial sprites added with "lighter" blending, cheaper than
// canvas shadows for hundreds of particles.
//
// Landscape: the player on the left. Portrait (a phone held upright): the field turns a quarter,
// the player at the bottom, so a thumb moves the paddle left and right.

import { BALL, FIELD, TIMING } from '../game/config.js';
import { number, t } from '../i18n/i18n.js';
import { GOAL_TIME, MILESTONE_TIME } from './effects.js';
import { HEX, hexCenter, hexPath } from './hex.js';

const lerp = (a, b, k) => a + (b - a) * k;
const easeOutBack = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

/** "#rrggbb" with an alpha, as rgba(). */
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Radius of the centre circle, where the ball waits for the serve (field units). */
const CENTRE = 8;

/** Repeatable pseudo-random numbers in [0, 1) for the floating motes. */
const seed = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Slow shapes drifting in the background, as in the first AiPong (field units). */
const SHAPES = [
  { x: 0.2, y: 0.3, size: 5, type: 'triangle', speed: 0.3 },
  { x: 0.8, y: 0.7, size: 4, type: 'circle', speed: 0.5 },
  { x: 0.1, y: 0.8, size: 3.5, type: 'triangle', speed: 0.4 },
  { x: 0.9, y: 0.2, size: 5.5, type: 'circle', speed: 0.2 },
  { x: 0.5, y: 0.12, size: 2.5, type: 'diamond', speed: 0.6 },
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.sprites = new Map();
    this.portrait = false;
    this.dpr = 1;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.readColors();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.#watchDensity();
  }

  setPortrait(portrait) {
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    this.resize();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.dpr = Math.min(devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const [fw, fh] = this.portrait ? [FIELD.height, FIELD.width] : [FIELD.width, FIELD.height];
    this.scale = Math.min(this.canvas.width / fw, this.canvas.height / fh);
    this.ox = (this.canvas.width - fw * this.scale) / 2;
    this.oy = (this.canvas.height - fh * this.scale) / 2;
    this.#paintLayer();
  }

  /** The arena's colours from the CSS custom properties (css/app.css, `--arena-*`). */
  readColors() {
    const style = getComputedStyle(document.documentElement);
    const v = (name) => style.getPropertyValue(name).trim();
    this.palette = {
      arena: v('--arena'),
      edge: v('--arena-edge'),
      player: v('--arena-player'),
      ai: v('--arena-ai'),
      white: v('--arena-ink'),
      gold: v('--arena-gold'),
      ember: v('--arena-ember'),
      neutral: v('--arena-neutral'),
      confetti: Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`)),
    };
    this.sprites.clear();
    this.#paintLayer();
  }

  /** The field y under a pointer, from its client coordinates. */
  toFieldY(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (this.portrait) return ((clientX - rect.left) * this.dpr - this.ox) / this.scale;
    return ((clientY - rect.top) * this.dpr - this.oy) / this.scale;
  }

  draw(match, alpha, fx) {
    const { ctx, palette } = this;
    if (!this.canvas.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // Phosphor: the previous frame fades out instead of vanishing.
    ctx.globalAlpha = fx.calm ? 1 : 0.5;
    ctx.drawImage(this.layer, 0, 0);
    ctx.globalAlpha = 1;

    const [sx, sy] = fx.shakeOffset();
    this.#fieldTransform(ctx, sx * this.dpr, sy * this.dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();

    const { ball } = match;
    const bx = lerp(ball.prevX, ball.x, alpha);
    const by = lerp(ball.prevY, ball.y, alpha);
    const playing = match.state === 'playing';
    // Violet until a paddle has touched it, so the serve stands out from the white net.
    const tint = fx.heat > 0.3 ? palette.ember : (fx.tint ?? palette.neutral);

    if (!fx.calm) {
      this.#shapes(fx.time);
      this.#motes(fx.time);
      this.#cells(fx.cells);
      this.#netPulse(fx.time);
      this.#floorLights(match, alpha, bx, by, tint, fx);
    }
    if (fx.flash && !fx.calm) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(fx.flash.life, 1) * 0.12;
      ctx.fillStyle = fx.flash.color;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this.#wallFlashes(fx.walls);

    if (playing && !fx.calm) fx.sampleTrail(bx, by);
    else fx.trail.length = 0;

    this.#trail(fx.trail, ball.r, tint);
    if (playing && !fx.calm) this.#speedLines(bx, by, ball, match.speed);
    this.#paddle(match.player, alpha, palette.player, fx.pulse.player);
    this.#paddle(match.opponent, alpha, palette.ai, fx.pulse.ai);
    this.#particles(fx);
    this.#rings(fx.rings);
    if (match.state !== 'point') this.#ball(match, bx, by, tint, fx);
    ctx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#hud(match, fx);
    this.#goal(fx);
  }

  #fieldTransform(ctx, dx = 0, dy = 0) {
    const s = this.scale;
    if (this.portrait) ctx.setTransform(0, -s, s, 0, this.ox + dx, this.oy + FIELD.width * s + dy);
    else ctx.setTransform(s, 0, 0, s, this.ox + dx, this.oy + dy);
  }

  /** The field's box on the canvas, in device pixels. */
  #box() {
    const [fw, fh] = this.portrait ? [FIELD.height, FIELD.width] : [FIELD.width, FIELD.height];
    return { x: this.ox, y: this.oy, w: fw * this.scale, h: fh * this.scale };
  }

  /** A soft radial light of one colour, drawn once and reused. */
  #glow(color) {
    let sprite = this.sprites.get(color);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const g = sprite.getContext('2d');
      const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, rgba(color, 1));
      gradient.addColorStop(0.2, rgba(color, 0.8));
      gradient.addColorStop(0.5, rgba(color, 0.25));
      gradient.addColorStop(1, rgba(color, 0));
      g.fillStyle = gradient;
      g.fillRect(0, 0, 64, 64);
      this.sprites.set(color, sprite);
    }
    return sprite;
  }

  #paintLayer() {
    const { layer, canvas, palette } = this;
    if (!canvas.width || !palette) return;
    layer.width = canvas.width;
    layer.height = canvas.height;
    const ctx = layer.getContext('2d');
    const box = this.#box();
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const reach = Math.hypot(box.w, box.h) / 2;

    const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    base.addColorStop(0, palette.arena);
    base.addColorStop(1, palette.edge);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, layer.width, layer.height);

    this.#fieldTransform(ctx);
    const px = this.dpr / this.scale; // one CSS pixel, in field units
    const { width: W, height: H } = FIELD;
    const mid = W / 2;

    // Each half lit faintly in its side's colour, from its own edge.
    for (const [color, from, to] of [
      [palette.player, 0, W * 0.45],
      [palette.ai, W, W * 0.55],
    ]) {
      const zone = ctx.createLinearGradient(from, 0, to, 0);
      zone.addColorStop(0, rgba(color, 0.16));
      zone.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = zone;
      ctx.fillRect(Math.min(from, to), 0, Math.abs(to - from), H);
    }

    // Hexagons, faint and blue (the effects light them up: hex.js).
    ctx.strokeStyle = 'rgba(120, 160, 255, 0.07)';
    ctx.lineWidth = px;
    for (let row = -1; row * HEX.row < H + HEX.size; row++) {
      for (let col = -1; col * HEX.width < W + HEX.width; col++) {
        const c = hexCenter(row, col);
        ctx.beginPath();
        hexPath(ctx, c.x, c.y, HEX.size * 0.92);
        ctx.stroke();
      }
    }

    // Goal lines and corner brackets in each side's colour.
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([1.2, 1.6]);
    for (const [color, x] of [
      [palette.player, 1.4],
      [palette.ai, W - 1.4],
    ]) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * this.dpr;
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 2 * px;
    const inset = 3;
    const arm = 12;
    for (const [x, y, dx, dy] of [
      [inset, inset, 1, 1],
      [W - inset, inset, -1, 1],
      [inset, H - inset, 1, -1],
      [W - inset, H - inset, -1, -1],
    ]) {
      const color = dx > 0 ? palette.player : palette.ai;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6 * this.dpr;
      ctx.strokeStyle = rgba(color, 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y + dy * arm);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * arm, y);
      ctx.stroke();
    }

    // The net, glowing, broken by the centre circle.
    ctx.shadowColor = 'rgba(180, 220, 255, 0.8)';
    ctx.shadowBlur = 6 * this.dpr;
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.35)';
    ctx.lineWidth = Math.max(2 * px, 0.45);
    ctx.setLineDash([2.2, 2.2]);
    ctx.beginPath();
    ctx.moveTo(mid, 1.1);
    ctx.lineTo(mid, H / 2 - CENTRE - 1);
    ctx.moveTo(mid, H / 2 + CENTRE + 1);
    ctx.lineTo(mid, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // The centre circle: a dark spot where the ball waits for the serve, ringed in its colour.
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(palette.edge, 0.85);
    ctx.beginPath();
    ctx.arc(mid, H / 2, CENTRE, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = palette.neutral;
    ctx.shadowBlur = 10 * this.dpr;
    ctx.strokeStyle = rgba(palette.neutral, 0.6);
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(palette.neutral, 0.22);
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.arc(mid, H / 2, CENTRE * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // Scan lines and a vignette, on the screen's own axes.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.022)';
    const step = Math.max(2, Math.round(3 * this.dpr));
    for (let y = 0; y < layer.height; y += step) ctx.fillRect(0, y, layer.width, Math.max(1, Math.round(this.dpr)));
    const vignette = ctx.createRadialGradient(cx, cy, reach * 0.45, cx, cy, reach);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, layer.width, layer.height);
  }

  #shapes(time) {
    const { ctx } = this;
    ctx.lineWidth = this.dpr / this.scale;
    SHAPES.forEach((shape, i) => {
      const x = shape.x * FIELD.width + Math.sin(time * shape.speed + i) * 3;
      const y = shape.y * FIELD.height + Math.cos(time * shape.speed + i) * 2.4;
      // Drawn every frame over the fading previous one, so they settle at twice this.
      const a = 0.02 + Math.sin(time * 0.5 + i) * 0.012;
      ctx.fillStyle = `rgba(150, 200, 255, ${a})`;
      ctx.strokeStyle = `rgba(200, 230, 255, ${a * 2})`;
      ctx.beginPath();
      const s = shape.size;
      if (shape.type === 'circle') ctx.arc(x, y, s, 0, Math.PI * 2);
      else if (shape.type === 'triangle') {
        ctx.moveTo(x, y - s);
        ctx.lineTo(x - s * 0.866, y + s * 0.5);
        ctx.lineTo(x + s * 0.866, y + s * 0.5);
        ctx.closePath();
      } else {
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    });
  }

  #wallFlashes(walls) {
    if (!walls.length) return;
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const w of walls) {
      ctx.globalAlpha = w.life;
      ctx.drawImage(this.#glow(w.color), w.x - 10, w.y - 1.8, 20, 3.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  #trail(points, r, color) {
    if (!points.length) return;
    const { ctx } = this;
    const sprite = this.#glow(color);
    ctx.globalCompositeOperation = 'lighter';
    points.forEach((p, i) => {
      const k = (i + 1) / (points.length + 1);
      const size = r * (1.2 + 2.2 * k);
      ctx.globalAlpha = 0.55 * k;
      ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Streaks behind a fast ball. */
  #speedLines(x, y, ball, speed) {
    if (speed < 1.3) return;
    const { ctx } = this;
    const v = Math.hypot(ball.vx, ball.vy) || 1;
    const ux = ball.vx / v;
    const uy = ball.vy / v;
    const length = speed * 5;
    const count = Math.min(5, Math.floor(speed * 2));
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min((speed - 1.2) / 2, 0.6)})`;
    ctx.lineWidth = 0.18;
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.7;
      const start = 2 + i * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - ux * start - uy * off, y - uy * start + ux * off);
      ctx.lineTo(x - ux * (start + length) - uy * off, y - uy * (start + length) + ux * off);
      ctx.stroke();
    }
  }

  /** A neon tube: colour on the edges, white in the middle, brighter on a hit. */
  #paddle(paddle, alpha, color, pulse) {
    const { ctx } = this;
    const y = lerp(paddle.prevY, paddle.y, alpha);
    const grow = pulse * 1;
    const x = paddle.x - grow / 2;
    const w = paddle.w + grow;
    const top = y - grow;
    const h = paddle.h + grow * 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = (10 + pulse * 24) * this.dpr;
    const tube = ctx.createLinearGradient(x, 0, x + w, 0);
    tube.addColorStop(0, color);
    tube.addColorStop(0.5, rgba('#ffffff', 0.55 + pulse * 0.45));
    tube.addColorStop(1, color);
    ctx.fillStyle = tube;
    ctx.beginPath();
    ctx.roundRect(x, top, w, h, w / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  #particles(fx) {
    const { ctx } = this;
    for (const p of fx.particles) {
      const fade = Math.min(1, p.life * 1.6);
      if (p.kind === 'confetti') {
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.restore();
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      const twinkle = p.kind === 'sparkle' ? 0.55 + 0.45 * Math.sin(fx.time * p.twinkle + p.x) : 1;
      ctx.globalAlpha = fade * twinkle;
      const glow = p.size * 3.2;
      ctx.drawImage(this.#glow(p.color), p.x - glow, p.y - glow, glow * 2, glow * 2);
      if (p.kind === 'sparkle') {
        // A small four-pointed star.
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = p.size * 0.25;
        ctx.beginPath();
        ctx.moveTo(p.x - p.size * 1.6, p.y);
        ctx.lineTo(p.x + p.size * 1.6, p.y);
        ctx.moveTo(p.x, p.y - p.size * 1.6);
        ctx.lineTo(p.x, p.y + p.size * 1.6);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  #rings(rings) {
    if (!rings.length) return;
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      ctx.globalAlpha = r.life * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * r.life + 0.1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  #ball(match, x, y, tint, fx) {
    const { ctx, palette } = this;
    const { r } = match.ball;
    const speed = match.state === 'playing' ? match.speed : 1;
    // Before a serve the ball fades in at the centre, breathing, while a timer ring fills up.
    const serving = match.state === 'serve';
    const left = serving ? Math.max(match.timer, 0) / TIMING.serve : 0;
    const breath = serving && !fx.calm ? 1 + 0.25 * Math.sin(fx.time * 12) : 1;

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - left * 0.5;
    const halo = r * (3.2 + speed * 1.3 + fx.heat * 4) * breath;
    ctx.drawImage(this.#glow(tint), x - halo, y - halo, halo * 2, halo * 2);
    ctx.globalCompositeOperation = 'source-over';

    const core = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.6, rgba('#ffffff', 0.95));
    core.addColorStop(1, tint);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // A thin dark rim keeps the ball readable over anything light (the net, "GOAL!", sparks).
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 0.22;
    ctx.stroke();

    if (serving) {
      const radius = r + 2.6;
      ctx.lineWidth = 0.45;
      ctx.strokeStyle = rgba(palette.neutral, 0.2);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowColor = palette.neutral;
      ctx.shadowBlur = 8 * this.dpr;
      ctx.strokeStyle = palette.neutral;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (1 - left) * Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.shadowBlur = 0;
    }
    // A spinning dashed ring once the ball is fast.
    if (speed > 1.5) {
      ctx.strokeStyle = rgba(palette.gold, Math.min((speed - 1.5) * 1.2, 0.9));
      ctx.lineWidth = 0.3;
      ctx.setLineDash([0.9, 0.7]);
      ctx.lineDashOffset = -fx.time * 10;
      ctx.beginPath();
      ctx.arc(x, y, r + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  /** Floor cells lit by the ball's path, the hits and the waves after a point. */
  #cells(cells) {
    if (!cells.size) return;
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = (1.5 * this.dpr) / this.scale;
    for (const cell of cells.values()) {
      const g = Math.min(cell.glow, 1);
      ctx.beginPath();
      hexPath(ctx, cell.x, cell.y, HEX.size * 0.86);
      ctx.fillStyle = rgba(cell.color, 0.08 * g);
      ctx.fill();
      ctx.strokeStyle = rgba(cell.color, 0.32 * g);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Light spilled on the floor around the paddles and under the ball. */
  #floorLights(match, alpha, bx, by, tint, fx) {
    const { ctx, palette } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const [paddle, color, pulse] of [
      [match.player, palette.player, fx.pulse.player],
      [match.opponent, palette.ai, fx.pulse.ai],
    ]) {
      const y = lerp(paddle.prevY, paddle.y, alpha);
      ctx.globalAlpha = 0.16 + pulse * 0.3;
      ctx.drawImage(this.#glow(color), paddle.x + paddle.w / 2 - 9, y - 7, 18, paddle.h + 14);
    }
    if (match.state !== 'point') {
      ctx.globalAlpha = 0.14;
      ctx.drawImage(this.#glow(tint), bx - 9, by - 9, 18, 18);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Two pulses of energy running along the net, one down and one up. */
  #netPulse(time) {
    const { ctx } = this;
    const sprite = this.#glow(this.palette.white);
    const span = FIELD.height + 16;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    for (const p of [((time * 28) % span) - 8, FIELD.height - (((time * 28 + span / 2) % span) - 8)]) {
      if (Math.abs(p - FIELD.height / 2) < CENTRE + 2) continue;
      ctx.drawImage(sprite, FIELD.width / 2 - 1.1, p - 5, 2.2, 10);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Dust motes drifting in the light, tinted by the half they float in. */
  #motes(time) {
    const { ctx, palette } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      const drift = time * (1.5 + seed(i + 50) * 2.5);
      const x = (((seed(i) * FIELD.width + drift) % FIELD.width) + FIELD.width) % FIELD.width;
      const y = seed(i + 100) * FIELD.height + Math.sin(time * (0.3 + seed(i + 150) * 0.4) + i) * 4;
      const color = x < FIELD.width * 0.4 ? palette.player : x > FIELD.width * 0.6 ? palette.ai : palette.white;
      const size = 0.5 + seed(i + 200) * 0.8;
      ctx.globalAlpha = 0.12 + 0.12 * Math.sin(time * (1 + seed(i + 250) * 2) + i);
      ctx.drawImage(this.#glow(color), x - size, y - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Rally counter and speed, at the top of the field (above the net when upright). */
  #hud(match, fx) {
    if (match.state !== 'playing' || match.rally < 5) return;
    const { ctx, palette } = this;
    const box = this.#box();
    const unit = Math.min(box.w, box.h);
    const x = box.x + box.w / 2;
    // Below the score in landscape; just above the net when upright.
    const y = box.y + box.h * (this.portrait ? 0.4 : 0.22);
    const hud = t().hud;
    const milestone = fx.milestone;
    const pop = milestone ? Math.max(0, 1 - milestone.age / MILESTONE_TIME) : 0;
    const scale = 1 + fx.rallyPop * 0.18 + pop * 0.5;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(unit * 0.055 * scale)}px "Geist Variable", system-ui, sans-serif`;
    ctx.shadowColor = palette.gold;
    ctx.shadowBlur = (8 + pop * 20) * this.dpr;
    ctx.fillStyle = palette.gold;
    ctx.fillText(`${hud.rally} ${number(match.rally)}${milestone ? '!' : ''}`, x, y);

    if (match.speed > 1.2) {
      const max = match.speed >= BALL.topSpeed - 0.005;
      const flicker = fx.heat > 0.5 && !fx.calm ? 0.75 + 0.25 * Math.sin(fx.time * 30) : 1;
      ctx.globalAlpha = flicker;
      ctx.font = `600 ${Math.round(unit * 0.034)}px "Geist Variable", system-ui, sans-serif`;
      ctx.shadowColor = palette.ember;
      ctx.shadowBlur = 8 * this.dpr;
      ctx.fillStyle = palette.ember;
      ctx.fillText(max ? `${hud.speed} ${hud.max}` : `${hud.speed} ×${number(match.speed, 1)}`, x, y + unit * 0.06);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  /** "GOAL!" in the scorer's colour: it pops, pulses, then shrinks away. */
  #goal(fx) {
    if (!fx.goal) return;
    const { ctx } = this;
    const k = fx.goal.age / GOAL_TIME;
    let scale = 1;
    if (!fx.calm) {
      if (k < 0.15) scale = Math.max(0.01, easeOutBack(k / 0.15));
      else if (k < 0.8) scale = 1 + 0.08 * Math.sin((k - 0.15) * Math.PI * 6);
      else scale = 1 - (k - 0.8) * 0.8;
    }
    const opacity = k < 0.08 ? k / 0.08 : k > 0.85 ? (1 - k) / 0.15 : 1;
    const box = this.#box();
    const x = box.x + box.w / 2;
    const y = box.y + box.h / 2;
    const size = Math.min(box.w, box.h) * 0.2 * scale;
    const text = t().hud.goal;

    ctx.globalAlpha = Math.max(0, opacity);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(size)}px "Geist Variable", system-ui, sans-serif`;
    ctx.shadowColor = fx.goal.color;
    ctx.shadowBlur = 30 * this.dpr;
    ctx.fillStyle = fx.goal.color;
    ctx.fillText(text, x, y);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4 * this.dpr;
    ctx.shadowOffsetY = 2 * this.dpr;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(size * 0.9)}px "Geist Variable", system-ui, sans-serif`;
    ctx.fillText(text, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = Math.max(0, opacity) * 0.55;
    ctx.fillStyle = fx.goal.color;
    ctx.font = `800 ${Math.round(size * 0.8)}px "Geist Variable", system-ui, sans-serif`;
    ctx.fillText(text, x, y - 2 * this.dpr);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /** Moving the window to a screen with another pixel density resizes the canvas too. */
  #watchDensity() {
    const query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        this.resize();
        this.#watchDensity();
      },
      { once: true },
    );
  }
}
