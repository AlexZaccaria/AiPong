// The UI language. Switching re-renders every text at once; boot.js picked the starting language
// (the saved one, else Italian for Italian browsers and English for everyone else).

import { read, write } from '../store.js';
import { en } from './en.js';
import { it } from './it.js';

const DICTS = { it, en };
const LOCALES = { it: 'it-IT', en: 'en-GB' };
const KEY = 'aipong.lang';
const listeners = new Set();

export const LANGS = Object.keys(DICTS);

let lang = DICTS[document.documentElement.lang] ? document.documentElement.lang : (read(KEY) ?? 'en');

export const t = () => DICTS[lang];
export const currentLang = () => lang;

export function setLang(next) {
  if (!DICTS[next] || next === lang) return;
  lang = next;
  write(KEY, next);
  document.documentElement.lang = next;
  translate(document);
  for (const fn of listeners) fn();
}

export const onLangChange = (fn) => listeners.add(fn);

/**
 * Fills the static markup: `data-i18n="nav.play"` sets the text, `data-i18n-attr="aria-label:
 * nav.main; title: …"` sets attributes.
 */
export function translate(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = lookup(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      el.setAttribute(attr, lookup(key));
    }
  }
}

function lookup(path) {
  const value = path.split('.').reduce((node, key) => node?.[key], t());
  return typeof value === 'string' ? value : path;
}

const formats = new Map();

/** A number in the current language with exactly `digits` decimals. */
export function number(value, digits = 0) {
  const key = `${lang}:${digits}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formats.set(key, format);
  }
  return format.format(value);
}
