/** Says something to screen readers through the page's polite live region. */
export function announce(text) {
  const region = document.getElementById('live');
  // Emptied first, so the same sentence twice in a row is read twice.
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = text;
  });
}
