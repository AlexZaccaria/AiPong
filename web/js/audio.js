// Sounds synthesised with the Web Audio API, no audio files: the arcade palette of the first
// AiPong (square-wave hits, fanfares, sawtooth for the AI's points), scheduled on the audio clock
// instead of timers, through a master gain and a compressor so that chords never clip.

import { read, write } from './store.js';

const KEY = 'aipong.sound';

export class Sound {
  constructor() {
    this.enabled = read(KEY) !== 'off';
    this.ctx = null;
    this.out = null;
  }

  /** Call from a user gesture: creates or wakes the audio context. */
  unlock() {
    if (!this.ctx) {
      if (!window.AudioContext) return;
      this.ctx = new AudioContext();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.32;
      this.out.connect(compressor).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    write(KEY, enabled ? 'on' : 'off');
  }

  start() {
    this.#tone(800, { duration: 0.2, type: 'square', gain: 0.4 });
  }

  serve() {
    this.#tone(520, { duration: 0.06, type: 'sine', gain: 0.25, slide: 1.6 });
  }

  /** Pitch rises with the ball's speed, the steepness of the shot and the length of the rally. */
  hit(side, { speed, offset, rally }) {
    const base = side === 'player' ? 660 : 440;
    const frequency = base + speed * 50 + Math.abs(offset) * 80 + Math.min(rally * 15, 200);
    this.#tone(frequency, { duration: 0.12, type: 'square', gain: 0.35 });
  }

  wall() {
    this.#tone(280, { duration: 0.08, type: 'square', gain: 0.25 });
  }

  /** Every fifth hit of a rally. */
  milestone(rally) {
    const lift = Math.min(rally / 5 - 1, 4) * 0.06;
    [1318.5, 1568, 1975.5].forEach((f, i) => this.#tone(f * (1 + lift), { at: i * 0.06, duration: 0.1, type: 'sine', gain: 0.35 }));
  }

  point(won) {
    if (won) {
      // A fanfare, then sparkles.
      [523.25, 659.25, 783.99].forEach((f, i) => this.#tone(f, { at: i * 0.15, duration: 0.15, type: 'square', gain: 0.6 }));
      this.#tone(1046.5, { at: 0.45, duration: 0.3, type: 'square', gain: 0.7 });
      [1318.5, 1568, 1975.5].forEach((f, i) => this.#tone(f, { at: 0.6 + i * 0.1, duration: i === 2 ? 0.15 : 0.1, type: 'sine', gain: 0.45 }));
    } else {
      // Dramatic and ominous.
      [196, 220, 246.94].forEach((f, i) => this.#tone(f, { at: i * 0.2, duration: 0.2, type: 'sawtooth', gain: 0.5 }));
      this.#tone(130.81, { at: 0.6, duration: 0.4, type: 'sawtooth', gain: 0.6 });
      [110, 98, 87.31].forEach((f, i) => this.#tone(f, { at: 0.8 + i * 0.1, duration: i === 2 ? 0.2 : 0.1, type: 'triangle', gain: 0.35 }));
    }
  }

  over(won) {
    if (won) {
      [523.25, 659.25, 783.99].forEach((f, i) => this.#tone(f, { at: i * 0.2, duration: i === 2 ? 0.4 : 0.2, type: 'square', gain: 0.45 }));
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.#tone(f, { at: 0.7 + i * 0.09, duration: 0.14, type: 'sine', gain: 0.35 }));
    } else {
      this.#tone(220, { duration: 0.8, type: 'sawtooth', gain: 0.35, slide: 0.5 });
    }
  }

  pause() {
    this.#tone(400, { duration: 0.1, type: 'sine', gain: 0.3 });
  }

  resume() {
    this.#tone(600, { duration: 0.1, type: 'sine', gain: 0.3 });
  }

  /** One note: a 10 ms attack, an exponential release, optionally sliding to `slide` × the pitch. */
  #tone(frequency, { at = 0, duration = 0.1, type = 'sine', gain = 0.3, slide = 1 } = {}) {
    const { ctx } = this;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(frequency * slide, t0 + duration);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(env).connect(this.out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}
