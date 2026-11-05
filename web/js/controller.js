// Runs the game: owns the current match, advances it in fixed steps on every animation frame,
// turns its events into sounds, effects, announcements and stats, and answers the UI's actions.

import { STEP } from './game/config.js';
import { Match } from './game/match.js';
import { Sound } from './audio.js';
import { t } from './i18n/i18n.js';
import { Effects } from './render/effects.js';
import { Renderer } from './render/renderer.js';
import { parseSettings } from './settings.js';
import { emptyStats, parseStats, recordMatch } from './stats.js';
import { readJson, writeJson } from './store.js';
import { announce } from './ui/live.js';

const SETTINGS_KEY = 'aipong.settings';
const STATS_KEY = 'aipong.stats';

export class Controller {
  constructor({ canvas, fullscreen }) {
    /** What goes full screen: the whole app, so the controls stay at hand. */
    this.fullscreenTarget = fullscreen;
    this.settings = parseSettings(readJson(SETTINGS_KEY));
    this.stats = parseStats(readJson(STATS_KEY));
    this.sound = new Sound();
    this.effects = new Effects();
    this.renderer = new Renderer(canvas);
    this.match = new Match(this.settings);
    /** The last finished match, for the game-over panel: { won, records }. */
    this.result = null;
    /** Called after every drawn frame (the view syncs the DOM there). */
    this.onFrame = () => {};
    this.acc = 0;
    this.last = performance.now();
    requestAnimationFrame(this.#frame);
  }

  #frame = (now) => {
    // A long gap (a hidden tab) is not caught up: the match is paused by then anyway. The first
    // frame's timestamp can precede the constructor's clock reading, hence the floor at zero.
    const dt = Math.min(Math.max(now - this.last, 0) / 1000, 0.1);
    this.last = now;
    if (this.match.state !== 'paused') {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.match.step(STEP);
        this.acc -= STEP;
      }
      this.effects.update(dt, this.match, this.renderer.palette);
    }
    this.#handleEvents();
    this.renderer.draw(this.match, this.acc / STEP, this.effects);
    this.onFrame();
    requestAnimationFrame(this.#frame);
  };

  #handleEvents() {
    const { match, effects, sound } = this;
    const { palette } = this.renderer;
    const live = t().live;
    for (const e of match.events.splice(0)) {
      switch (e.type) {
        case 'start':
          sound.start();
          announce(live.start(match.target));
          break;
        case 'serve':
          sound.serve();
          effects.serve();
          break;
        case 'wall':
          sound.wall();
          effects.wall(e, palette);
          break;
        case 'hit':
          sound.hit(e.side, e);
          effects.hit(e, palette);
          if (e.rally % 5 === 0) {
            sound.milestone(e.rally);
            effects.rally(e.rally, e, palette);
          }
          break;
        case 'point':
          sound.point(e.scorer === 'player');
          effects.point(e, palette);
          announce(live.point(e.scorer, e.score.player, e.score.ai));
          break;
        case 'over':
          this.#finish(e.winner === 'player');
          break;
        case 'pause':
          sound.pause();
          announce(live.paused);
          break;
        case 'resume':
          sound.resume();
          announce(live.resumed);
          break;
      }
    }
  }

  #finish(won) {
    const { match } = this;
    const { stats, records } = recordMatch(this.stats, { won, longestRally: match.longestRally, topSpeed: match.topSpeed });
    this.stats = stats;
    writeJson(STATS_KEY, stats);
    this.result = { won, records };
    this.sound.over(won);
    if (won) this.effects.win(this.renderer.palette);
    else this.effects.lose(this.renderer.palette);
    announce(t().live.over(won, match.score.player, match.score.ai));
  }

  #newMatch() {
    this.match = new Match(this.settings);
    this.result = null;
    this.effects.clear();
    this.acc = 0;
  }

  /** The one obvious action of the moment: play, pause, resume or rematch (Space, the main button). */
  primary() {
    this.sound.unlock();
    const { match } = this;
    if (match.state === 'ready') match.start();
    else if (match.state === 'paused') match.resume();
    else if (match.state === 'over') {
      this.#newMatch();
      this.match.start();
    } else match.pause();
  }

  togglePause() {
    if (this.match.state === 'paused') this.primary();
    else this.match.pause();
  }

  restart() {
    this.#newMatch();
  }

  /** Settings apply to the next match; one not started yet is simply replaced. */
  setSetting(key, value) {
    this.settings = { ...this.settings, [key]: value };
    writeJson(SETTINGS_KEY, this.settings);
    if (this.match.state === 'ready') this.#newMatch();
  }

  toggleSound() {
    this.sound.setEnabled(!this.sound.enabled);
    this.sound.unlock();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.fullscreenEnabled) this.fullscreenTarget.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }

  resetStats() {
    this.stats = emptyStats();
    writeJson(STATS_KEY, this.stats);
  }
}
