import { html, render } from './html.js';

/**
 * A segmented control: buttons on a filled track, the chosen one raised. It is a
 * radiogroup: only the chosen button is in the tab order and the arrow keys move the choice.
 *
 * `options()` is called on every render (so labels follow the language) and returns
 * `{ value, text }` for a labelled segment or `{ value, name, content }` for an icon or flag,
 * where `name` becomes its accessible name and tooltip.
 */
export function segmented(element, { options, value, onChange }) {
  let current = value;
  element.setAttribute('role', 'radiogroup');

  const draw = () => {
    const hadFocus = element.contains(document.activeElement);
    render(
      element,
      html`${options().map((o, i) => {
        const on = o.value === current;
        const name = o.text ? null : o.name;
        return html`<button type="button" role="radio" data-index="${i}" aria-checked="${on}" tabindex="${on ? 0 : -1}" ${name ? html`aria-label="${name}" title="${name}"` : ''}>${o.text ?? o.content}</button>`;
      })}`,
    );
    if (hadFocus) element.querySelector('[aria-checked="true"]')?.focus();
  };

  const choose = (index) => {
    const option = options()[index];
    if (!option || option.value === current) return;
    current = option.value;
    draw();
    onChange(current);
  };

  element.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-index]');
    if (button) choose(Number(button.dataset.index));
  });

  element.addEventListener('keydown', (e) => {
    const count = options().length;
    const index = options().findIndex((o) => o.value === current);
    const moves = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: count - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    e.stopPropagation();
    choose((moves[e.key] + count) % count);
  });

  draw();
  return {
    refresh: draw,
    /** Shows a value chosen elsewhere, without calling onChange. */
    set(next) {
      current = next;
      draw();
    },
  };
}
