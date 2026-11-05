import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// input.js listens on `document` and on the window: in Node they are plain event targets, and
// each scenario gets a fresh document so listeners don't pile up.
globalThis.addEventListener = () => {};
const { bindInput } = await import('../web/js/input.js');

const match = (state) => ({
  state,
  get running() {
    return ['serve', 'playing', 'point'].includes(this.state);
  },
  control: { keys: 0, pointer: null },
});

/** A controller stand-in: primary() and restart() replace or advance the match like the real one. */
function setup({ portrait = false, state = 'playing' } = {}) {
  globalThis.document = new EventTarget();
  const game = {
    match: match(state),
    renderer: { portrait, toFieldY: () => 0 },
    primary() {
      if (this.match.state === 'over') this.match = match('serve');
      else if (this.match.state === 'ready') this.match.state = 'serve';
      else this.match.state = 'paused';
    },
    restart() {
      this.match = match('ready');
    },
    togglePause() {},
    toggleSound() {},
    toggleFullscreen() {},
  };
  const field = Object.assign(new EventTarget(), { hasPointerCapture: () => false, setPointerCapture() {} });
  bindInput(game, { field, isActive: () => true });
  return game;
}

function key(type, value) {
  const e = new Event(type, { cancelable: true });
  const props = { key: value, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: { closest: () => null } };
  for (const [name, v] of Object.entries(props)) Object.defineProperty(e, name, { value: v });
  document.dispatchEvent(e);
}

describe('held keys', () => {
  it('steer the paddle while held and stop it when released', () => {
    const game = setup();
    key('keydown', 'ArrowDown');
    assert.equal(game.match.control.keys, 1);
    key('keyup', 'ArrowDown');
    assert.equal(game.match.control.keys, 0);
  });

  it('are released even after the field turned', () => {
    const game = setup({ portrait: true });
    key('keydown', 'ArrowLeft');
    assert.equal(game.match.control.keys, -1);
    game.renderer.portrait = false;
    key('keyup', 'ArrowLeft');
    assert.equal(game.match.control.keys, 0);
  });

  it('keep steering while another key for the same direction is down', () => {
    const game = setup();
    key('keydown', 'ArrowUp');
    key('keydown', 'w');
    key('keyup', 'ArrowUp');
    assert.equal(game.match.control.keys, -1);
  });

  it('are released whatever Shift does to the letter', () => {
    const game = setup();
    key('keydown', 'w');
    key('keyup', 'W');
    assert.equal(game.match.control.keys, 0);
  });

  it('steer the rematch started with Space at once', () => {
    const game = setup();
    key('keydown', 'ArrowDown');
    game.match.state = 'over';
    key('keydown', ' ');
    assert.equal(game.match.state, 'serve');
    assert.equal(game.match.control.keys, 1);
  });

  it('do not steer the menu after R', () => {
    const game = setup();
    key('keydown', 'ArrowDown');
    key('keydown', 'r');
    assert.equal(game.match.state, 'ready');
    assert.equal(game.match.control.keys, 0);
  });

  it('are ignored outside a match', () => {
    const game = setup({ state: 'ready' });
    key('keydown', 'ArrowDown');
    assert.equal(game.match.control.keys, 0);
    game.match.state = 'playing';
    key('keyup', 'ArrowDown');
    assert.equal(game.match.control.keys, 0);
  });
});
