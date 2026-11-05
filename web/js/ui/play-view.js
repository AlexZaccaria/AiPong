// Everything around the canvas: the score on the arena, the match controls, the stage lights and
// the panel over the field. The start panel is the game's menu (difficulty, points, stats, keys);
// pause and game over have their own. `sync` runs every frame and touches the DOM only where
// something changed.

import { DIFFICULTY_IDS, TARGETS } from '../game/config.js';
import { number, t } from '../i18n/i18n.js';
import { html, render } from './html.js';
import { icon } from './icons.js';
import { segmented } from './segmented.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const PANEL_STATES = new Set(['ready', 'paused', 'over']);

export class PlayView {
  constructor(root, game) {
    this.game = game;
    const $ = (selector) => root.querySelector(selector);
    this.el = {
      field: $('#field'),
      overlay: $('#overlay'),
      scorePlayer: $('#score-player'),
      scoreAi: $('#score-ai'),
      chip: $('#match-chip'),
      primary: $('#btn-primary'),
      restart: $('#btn-restart'),
      sound: $('#btn-sound'),
      fullscreen: $('#btn-fullscreen'),
      glowPlayer: $('#glow-player'),
      glowAi: $('#glow-ai'),
    };
    /** Last value rendered for each part, so that `sync` can skip what didn't change. */
    this.shown = new Map();
    this.score = { player: 0, ai: 0 };

    const { el } = this;
    el.primary.addEventListener('click', () => game.primary());
    el.restart.addEventListener('click', () => game.restart());
    el.sound.addEventListener('click', () => game.toggleSound());
    el.fullscreen.addEventListener('click', () => game.toggleFullscreen());
    el.fullscreen.hidden = !document.fullscreenEnabled;
    el.overlay.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'reset-stats') this.#resetStats(button);
      else game[button.dataset.action]();
    });
  }

  /** After a language change everything is drawn again. */
  relabel() {
    this.shown.clear();
  }

  sync() {
    const { game, el } = this;
    const { match } = game;
    const g = t().game;

    this.#score(el.scorePlayer, 'player', match.score.player);
    this.#score(el.scoreAi, 'ai', match.score.ai);
    this.#when('chip', `${match.difficulty}|${match.target}`, () => {
      el.chip.textContent = `${t().difficulty[match.difficulty]} · ${g.firstTo(match.target)}`;
    });

    this.#when('primary', match.state, (state) => {
      const [name, label] = {
        ready: ['play', g.play],
        paused: ['play', g.resume],
        over: ['rotate-ccw', g.rematch],
      }[state] ?? ['pause', g.pause];
      render(el.primary, html`${icon(name)}<span>${label}</span>`);
      el.restart.disabled = state === 'ready';
    });

    // The stage lights behind the arena follow the effects: a hit or a point flares its side.
    const { glow } = game.effects;
    this.#when('glow-player', Math.round(Math.min(glow.player, 1) * 20), (k) => {
      el.glowPlayer.style.opacity = String(0.45 + (k / 20) * 0.55);
    });
    this.#when('glow-ai', Math.round(Math.min(glow.ai, 1) * 20), (k) => {
      el.glowAi.style.opacity = String(0.45 + (k / 20) * 0.55);
    });

    this.#when('sound', game.sound.enabled, (on) => {
      const label = on ? g.mute : g.unmute;
      render(el.sound, icon(on ? 'volume-2' : 'volume-x', 18));
      el.sound.setAttribute('aria-label', label);
      el.sound.title = label;
    });
    this.#when('fullscreen', Boolean(document.fullscreenElement), (full) => {
      const label = full ? g.exitFullscreen : g.fullscreen;
      render(el.fullscreen, icon(full ? 'minimize' : 'maximize', 18));
      el.fullscreen.setAttribute('aria-label', label);
      el.fullscreen.title = label;
    });

    // The panel is redrawn when the state changes, not when a setting does: the setting controls
    // live inside it and must keep the focus.
    this.#when('panel', [match.state, match.score.player, match.score.ai, game.stats.played].join('|'), () =>
      this.#renderPanel(match),
    );
  }

  #when(key, value, update) {
    if (this.shown.has(key) && this.shown.get(key) === value) return;
    this.shown.set(key, value);
    update(value);
  }

  /**
   * A score that goes up flashes white, jumps and settles back into its colour, and the arena's
   * edge flashes with it; a new match just resets the numbers.
   */
  #score(element, side, value) {
    if (this.score[side] === value && this.shown.has(`score-${side}`)) return;
    const grew = value > this.score[side];
    this.score[side] = value;
    this.shown.set(`score-${side}`, value);
    element.textContent = number(value);
    if (!grew || reducedMotion.matches) return;
    const color = this.game.renderer.palette[side];
    const rest = getComputedStyle(element);
    element.animate(
      [
        { transform: 'scale(1.7)', color: '#ffffff', textShadow: `0 0 0.6em ${color}, 0 0 1.2em ${color}` },
        { transform: 'scale(1)', color: rest.color, textShadow: rest.textShadow },
      ],
      { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    this.el.field.animate(
      [
        { boxShadow: `0 0 0 2px ${color}, 0 0 48px 6px ${color}` },
        { boxShadow: '0 0 0 0 transparent, 0 0 0 0 transparent' },
      ],
      { duration: 1100, easing: 'ease-out' },
    );
  }

  #renderPanel(match) {
    const { overlay, primary, restart } = this.el;
    const visible = PANEL_STATES.has(match.state);
    const active = document.activeElement;
    // Keyboard focus follows the panel as it opens and closes, unless the player is busy
    // elsewhere; a panel redrawn while focused keeps it.
    const toggled = this.panelVisible !== undefined && this.panelVisible !== visible;
    const followFocus = overlay.contains(active) || (toggled && (active === document.body || active === primary || active === restart));
    this.panelVisible = visible;

    overlay.hidden = !visible;
    if (visible) {
      render(overlay, this.#panel(match));
      if (match.state === 'ready') this.#mountSettings();
    }
    if (!followFocus) return;
    if (visible) overlay.querySelector('[data-action]')?.focus({ preventScroll: true });
    else primary.focus({ preventScroll: true });
  }

  #panel(match) {
    const g = t().game;
    const o = t().overlay;
    const { player, ai } = match.score;

    if (match.state === 'ready') {
      const s = t().settings;
      return html`<div class="overlay-card card">
        <h2>${o.readyTitle}</h2>
        <p class="overlay-body">${o.readyBody}</p>
        <div class="menu-settings">
          <div class="setting"><span class="label" id="difficulty-label">${s.difficulty}</span><div class="segmented segmented-text" id="difficulty" aria-labelledby="difficulty-label"></div></div>
          <div class="setting"><span class="label" id="target-label">${s.target}</span><div class="segmented segmented-text" id="target" aria-labelledby="target-label"></div></div>
        </div>
        <button type="button" class="btn btn-primary btn-lg menu-play" data-action="primary">${icon('play')}${g.play}</button>
        <p class="overlay-hint">${o.readyHint}</p>
        ${this.#hints()}
        ${this.#stats()}
      </div>`;
    }

    if (match.state === 'paused') {
      return html`<div class="overlay-card card">
        <p class="eyebrow num">${g.you} ${player} – ${ai} ${g.ai}</p>
        <h2>${o.pausedTitle}</h2>
        <div class="overlay-actions">
          <button type="button" class="btn btn-primary" data-action="primary">${icon('play')}${g.resume}</button>
          <button type="button" class="btn btn-outline" data-action="restart">${icon('rotate-ccw')}${g.restart}</button>
        </div>
      </div>`;
    }

    const won = match.winner === 'player';
    const records = this.game.result?.records ?? [];
    return html`<div class="overlay-card card">
      <p class="eyebrow overlay-eyebrow"><span class="dot ${won ? 'dot-player' : 'dot-ai'}"></span>${won ? o.won : o.lost}</p>
      <h2 class="overlay-score num">${player}<span aria-hidden="true">–</span><span class="sr-only">:</span>${ai}</h2>
      <dl class="overlay-stats">
        <div><dt>${o.longestRally}</dt><dd class="num">${number(match.longestRally)}</dd></div>
        <div><dt>${o.topSpeed}</dt><dd class="num">×${number(match.topSpeed, 1)}</dd></div>
      </dl>
      ${records.length ? html`<p class="chip chip-record">${icon('trophy', 13)}${o.record}</p>` : ''}
      <div class="overlay-actions">
        <button type="button" class="btn btn-primary" data-action="primary">${icon('rotate-ccw')}${g.rematch}</button>
        <button type="button" class="btn btn-outline" data-action="restart">${icon('sliders-horizontal')}${o.settings}</button>
      </div>
    </div>`;
  }

  #mountSettings() {
    const { game } = this;
    const overlay = this.el.overlay;
    segmented(overlay.querySelector('#difficulty'), {
      value: game.settings.difficulty,
      options: () => DIFFICULTY_IDS.map((id) => ({ value: id, text: t().difficulty[id] })),
      onChange: (value) => game.setSetting('difficulty', value),
    });
    segmented(overlay.querySelector('#target'), {
      value: game.settings.target,
      options: () => TARGETS.map((n) => ({ value: n, text: String(n) })),
      onChange: (value) => game.setSetting('target', value),
    });
  }

  #hints() {
    const c = t().controls;
    const key = (k) => html`<kbd class="kbd">${k}</kbd>`;
    const rows = [
      [html`${key('↑')}${key('↓')}`, c.moveDo],
      [key(c.space), c.spaceDo],
      [key('R'), c.restartDo],
      [key('M'), c.soundDo],
    ];
    if (document.fullscreenEnabled) rows.push([key('F'), c.fullscreenDo]);
    return html`<ul class="hints">${rows.map(([keys, label]) => html`<li>${keys}<span>${label}</span></li>`)}</ul>`;
  }

  #stats() {
    const { stats } = this.game;
    if (!stats.played) return '';
    const s = t().stats;
    const stat = (value, label) => html`<div class="stat"><span class="stat-value num">${value}</span><span class="stat-label">${label}</span></div>`;
    return html`<section class="menu-stats" aria-labelledby="stats-title">
      <div class="menu-stats-head">
        <h3 class="label" id="stats-title">${s.title} · ${s.played(stats.played)}</h3>
        <button type="button" class="btn btn-ghost btn-sm" data-action="reset-stats">${s.reset}</button>
      </div>
      <div class="stats">
        ${stat(number(stats.won), s.wins)}
        ${stat(number(stats.bestRally), s.bestRally)}
        ${stat(`×${number(stats.topSpeed, 1)}`, s.topSpeed)}
        ${stat(number(stats.bestStreak), s.bestStreak)}
      </div>
    </section>`;
  }

  /** Two clicks: the first asks, the second (within a few seconds) clears the stats. */
  #resetStats(button) {
    if (button.dataset.confirm) {
      this.game.resetStats();
      return;
    }
    button.dataset.confirm = 'yes';
    button.textContent = t().stats.confirmReset;
    button.classList.add('btn-danger');
    setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.confirm;
      button.textContent = t().stats.reset;
      button.classList.remove('btn-danger');
    }, 3000);
  }
}
