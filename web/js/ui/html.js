// Markup from tagged templates. Every interpolated value is escaped unless it is itself the result
// of `html` (or `trusted`), so text from the dictionaries can never turn into markup.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Markup {
  constructor(value) {
    this.value = value;
  }
}

/** Markup written in this codebase (icons, flags): inserted as is. */
export const trusted = (value) => new Markup(value);

function piece(value) {
  if (value instanceof Markup) return value.value;
  if (Array.isArray(value)) return value.map(piece).join('');
  if (value === null || value === undefined || value === false) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += piece(value) + strings[i + 1];
  });
  return new Markup(out);
}

export function render(element, markup) {
  element.innerHTML = markup.value;
}
