// Light or dark. Until the user picks one, the OS setting decides and is followed live; boot.js
// applied it before the first paint. Dark is its own set of colours (css/app.css), not an inversion.

import { read, write } from '../store.js';

const KEY = 'aipong.theme';
const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

const stored = read(KEY);
let choice = stored === 'light' || stored === 'dark' ? stored : null;

export const resolvedTheme = () => choice ?? (media.matches ? 'dark' : 'light');

export function setTheme(mode) {
  choice = mode;
  write(KEY, mode);
  apply();
}

export const onThemeChange = (fn) => listeners.add(fn);

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  // The browser's own bars follow the page's theme, not only the OS one.
  const page = getComputedStyle(root).getPropertyValue('--page').trim();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = page;
  for (const fn of listeners) fn();
}

media.addEventListener('change', () => {
  if (!choice) apply();
});

export const initTheme = apply;
