import { currentLang, LANGS, onLangChange, setLang, t } from '../i18n/i18n.js';
import { flag, icon } from './icons.js';
import { segmented } from './segmented.js';
import { onThemeChange, resolvedTheme, setTheme } from './theme.js';

/**
 * Theme and language controls in every `[data-prefs]` slot (the sidebar and the mobile header),
 * kept in step with each other.
 */
export function mountPreferences() {
  const controls = [];
  for (const slot of document.querySelectorAll('[data-prefs]')) {
    const theme = document.createElement('div');
    const lang = document.createElement('div');
    theme.className = lang.className = 'segmented';
    slot.append(theme, lang);
    controls.push({
      theme: segmented(theme, {
        value: resolvedTheme(),
        options: () => [
          { value: 'light', name: t().theme.light, content: icon('sun', 14) },
          { value: 'dark', name: t().theme.dark, content: icon('moon', 14) },
        ],
        onChange: setTheme,
      }),
      lang: segmented(lang, {
        value: currentLang(),
        options: () => LANGS.map((l) => ({ value: l, name: t().lang[l], content: flag(l) })),
        onChange: setLang,
      }),
      themeGroup: theme,
      langGroup: lang,
    });
  }

  const label = () => {
    for (const c of controls) {
      c.themeGroup.setAttribute('aria-label', t().theme.label);
      c.langGroup.setAttribute('aria-label', t().lang.label);
    }
  };
  label();
  onThemeChange(() => controls.forEach((c) => c.theme.set(resolvedTheme())));
  onLangChange(() => {
    label();
    for (const c of controls) {
      c.theme.refresh();
      c.lang.set(currentLang());
    }
  });
}
