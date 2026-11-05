// Mouse, touch and keyboard into the match's controls and the controller's actions.

const CONTROLS = 'button, a, input, select, textarea, [role="radio"]';

export function bindInput(game, { field, isActive }) {
  const aim = (e) => {
    game.match.control.pointer = game.renderer.toFieldY(e.clientX, e.clientY);
  };

  // The mouse steers from anywhere on the page: only its height counts, as in the original.
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && isActive()) aim(e);
  });

  // A finger or a pen steers by dragging on the field; the canvas has touch-action: none.
  field.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.tagName !== 'CANVAS') return;
    field.setPointerCapture(e.pointerId);
    aim(e);
  });
  field.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && field.hasPointerCapture(e.pointerId)) aim(e);
  });

  // Up/down move the paddle; with the field upright on a phone, left/right do.
  const held = new Map(); // physical key -> direction, so keyup works after an orientation change
  const norm = (key) => (key.length === 1 ? key.toLowerCase() : key);
  const direction = (key) => {
    const k = norm(key);
    if (k === 'ArrowUp' || k === 'w') return 'up';
    if (k === 'ArrowDown' || k === 's') return 'down';
    if (!game.renderer.portrait) return null;
    if (k === 'ArrowLeft' || k === 'a') return 'up';
    if (k === 'ArrowRight' || k === 'd') return 'down';
    return null;
  };
  const steer = () => {
    const dirs = new Set(held.values());
    game.match.control.keys = (dirs.has('down') ? 1 : 0) - (dirs.has('up') ? 1 : 0);
  };

  document.addEventListener('keydown', (e) => {
    if (!isActive() || e.ctrlKey || e.metaKey || e.altKey) return;
    const inControl = e.target.closest?.(CONTROLS);
    const dir = direction(e.key);
    if (dir) {
      // Radio groups use the arrows themselves, and outside a match the arrows scroll the page.
      if (e.target.closest?.('[role="radiogroup"]') || !game.match.running) return;
      e.preventDefault();
      held.set(norm(e.key), dir);
      steer();
      return;
    }
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
      case ' ':
        if (inControl) return; // Space presses the focused button instead.
        e.preventDefault();
        game.primary();
        steer(); // primary() may start a new match with keys = 0; re-apply keys still held

        break;
      case 'p':
        game.togglePause();
        break;
      case 'escape':
        game.match.pause();
        break;
      case 'r':
        game.restart();
        steer(); // the new match starts with keys = 0; re-apply keys still held
        break;
      case 'm':
        game.toggleSound();
        break;
      case 'f':
        game.toggleFullscreen();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (!held.delete(norm(e.key))) return;
    steer();
  });

  addEventListener('blur', () => {
    held.clear();
    steer();
  });
}
