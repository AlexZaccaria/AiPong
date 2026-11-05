import { ICONS } from './icon-paths.js';
import { trusted } from './html.js';

/** A Lucide icon, decorative: the control around it carries the name. */
export function icon(name, size = 16, className = '') {
  return trusted(
    `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`,
  );
}

let flagId = 0;

/** A language as a flag (Windows has no flag emoji), decorative like the icons. */
export function flag(lang) {
  if (lang === 'it') {
    return trusted(
      '<svg class="flag" viewBox="0 0 3 2" width="18" height="12" aria-hidden="true"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#ffffff"/><rect x="2" width="1" height="2" fill="#ce2b37"/></svg>',
    );
  }
  // The counterchanged red diagonals need a clip path, whose id must be unique in the page.
  const id = `flag-clip-${flagId++}`;
  return trusted(
    `<svg class="flag" viewBox="0 0 60 30" width="18" height="12" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="${id}"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#ffffff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" stroke="#c8102e" stroke-width="4" clip-path="url(#${id})"/><path d="M30,0v30M0,15h60" stroke="#ffffff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#c8102e" stroke-width="6"/></svg>`,
  );
}

/** Replaces each `<span data-icon="name" data-size="16">` of the static markup with its icon. */
export function hydrateIcons(root) {
  for (const slot of root.querySelectorAll('[data-icon]')) {
    slot.outerHTML = icon(slot.dataset.icon, Number(slot.dataset.size ?? 16), slot.className).value;
  }
}
