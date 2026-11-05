// AiPong's service worker: the game plays offline.
//
// Every file of the site is cached at install (FILES: test/pwa.test.js keeps it equal to web/).
// Requests go to the network first, so an online visit always gets the published version and
// refreshes the cache with it; the cache answers when the network is missing, or slower than
// TIMEOUT. Nothing can stay stuck on an old version, and there is no version number to bump.

const CACHE = 'aipong';
const TIMEOUT = 3000;

const FILES = [
  './',
  'manifest.webmanifest',
  'favicon.svg',
  'css/app.css',
  'fonts/geist-latin-wght-normal.woff2',
  'fonts/geist-latin-ext-wght-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/boot.js',
  'js/main.js',
  'js/controller.js',
  'js/input.js',
  'js/audio.js',
  'js/pwa.js',
  'js/project.js',
  'js/settings.js',
  'js/stats.js',
  'js/store.js',
  'js/game/ai.js',
  'js/game/config.js',
  'js/game/match.js',
  'js/game/physics.js',
  'js/game/rng.js',
  'js/i18n/i18n.js',
  'js/i18n/it.js',
  'js/i18n/en.js',
  'js/render/effects.js',
  'js/render/hex.js',
  'js/render/renderer.js',
  'js/ui/about-view.js',
  'js/ui/html.js',
  'js/ui/icon-paths.js',
  'js/ui/icons.js',
  'js/ui/live.js',
  'js/ui/play-view.js',
  'js/ui/preferences.js',
  'js/ui/segmented.js',
  'js/ui/theme.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// Take over the pages already open, so the first visit is covered too.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;

  // The response is copied into the cache before the page reads it, even when it arrives after
  // the cache has already answered.
  let saved = Promise.resolve();
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      saved = caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
  event.waitUntil(network.then(() => saved, () => {}));
  event.respondWith(answer(request, network));
});

async function answer(request, network) {
  const late = new Promise((resolve) => setTimeout(resolve, TIMEOUT, null));
  try {
    const response = await Promise.race([network, late]);
    if (response) return response;
  } catch {
    // Offline: the cache answers.
  }
  const cached =
    (await caches.match(request, { ignoreSearch: true })) ??
    (request.mode === 'navigate' ? await caches.match('./') : undefined);
  // Nothing cached for it: wait for the network after all, and its error if there is one.
  return cached ?? network;
}
