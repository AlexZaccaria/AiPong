// Installable and playable offline: registers the service worker and shows an "Install" button
// where the browser allows installing. Chromium browsers get their own prompt; Safari on iPhone and
// iPad has no prompt, so the button shows the two taps that add the game to the Home Screen. The
// button stays hidden once the game runs as an installed app.

const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initPwa() {
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  const button = document.getElementById('btn-install');
  const help = document.getElementById('install-help');
  if (!button) return;
  let prompt = null;
  const show = (visible) => {
    button.hidden = !visible || installed();
  };

  // Chromium: keep the browser's install event, to fire it from the button.
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    show(true);
  });
  addEventListener('appinstalled', () => {
    prompt = null;
    show(false);
  });
  if (apple) show(true);

  button.addEventListener('click', () => {
    if (prompt) {
      // A prompt shows once: the button comes back if the browser sends a new event.
      prompt.prompt();
      prompt = null;
      show(false);
    } else if (apple) {
      help?.togglePopover?.();
    }
  });
}
