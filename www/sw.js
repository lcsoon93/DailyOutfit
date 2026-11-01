// Service worker per la versione web: tiene in cache i file dell'app così
// funziona anche offline. Nell'app Android non viene registrato.
const CACHE = 'dailyoutfit-v1';
const FILES = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'css/app.css',
  'fonts/dm-sans-latin.woff2', 'fonts/fraunces-latin.woff2', 'fonts/fraunces-italic-latin.woff2',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'js/icons.js', 'js/db.js', 'js/data.js', 'js/colors.js', 'js/generator.js', 'js/imaging.js',
  'js/render.js', 'js/native.js', 'js/ui.js', 'js/editor.js', 'js/demo.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// prima la rete (per avere sempre l'ultima versione), poi la cache se offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
