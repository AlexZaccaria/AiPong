// Wires the page together: static texts and icons, preferences, the game, the About sheet.

import { Controller } from './controller.js';
import { onLangChange, t, translate } from './i18n/i18n.js';
import { bindInput } from './input.js';
import { renderAbout } from './ui/about-view.js';
import { hydrateIcons } from './ui/icons.js';
import { PlayView } from './ui/play-view.js';
import { PROJECT } from './project.js';
import { mountPreferences } from './ui/preferences.js';
import { initTheme, onThemeChange } from './ui/theme.js';

translate(document);
hydrateIcons(document);
document.getElementById('repo-link').href = PROJECT.repoUrl;
initTheme();
mountPreferences();

const field = document.getElementById('field');
const about = document.getElementById('about');
const game = new Controller({ canvas: document.getElementById('canvas'), fullscreen: document.getElementById('app') });
const view = new PlayView(document, game);
game.onFrame = () => view.sync();
bindInput(game, { field, isActive: () => !about.open });

// A phone held upright gets the field upright too (css/app.css sizes it from the same attribute).
const portrait = matchMedia('(orientation: portrait) and (max-width: 767px)');
const orient = () => {
  field.dataset.orientation = portrait.matches ? 'portrait' : 'landscape';
  game.renderer.setPortrait(portrait.matches);
};
portrait.addEventListener('change', orient);
orient();

// "About" is a sheet over the game: opening it pauses the match, #about links straight to it.
const setTitle = () => {
  document.title = `AiPong · ${t().app.tagline}`;
};
const openAbout = () => {
  if (about.open) return;
  game.match.pause();
  renderAbout(document.getElementById('about-body'));
  about.showModal();
  document.getElementById('about-body').scrollTop = 0;
  history.replaceState(null, '', '#about');
};
document.getElementById('btn-about').addEventListener('click', openAbout);
document.getElementById('about-close').addEventListener('click', () => about.close());
about.addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));
// A click on the backdrop (outside the sheet's box) closes it too.
about.addEventListener('click', (e) => {
  if (e.target === about) about.close();
});
if (location.hash === '#about') openAbout();

setTitle();
onLangChange(() => {
  view.relabel();
  setTitle();
  if (about.open) renderAbout(document.getElementById('about-body'));
});
onThemeChange(() => game.renderer.readColors());

// Leaving the page, or the window, pauses the match.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.match.pause();
});
addEventListener('blur', () => game.match.pause());
