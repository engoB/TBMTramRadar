/* Service worker TBM Tram Radar.
   BUILD est remplacé à chaque déploiement : un nouveau build = un nouveau cache = mise à jour automatique. */
const BUILD = '__BUILD__';
const CACHE = 'tbm-radar-' + BUILD;
const CORE = [
  './', 'index.html', 'assets/app.css', 'assets/app.js', 'assets/config.js',
  'manifest.webmanifest', 'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'data/network.json', 'version.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).catch(() => {}));
  // Première installation : activation immédiate. Mises à jour : attente du signal de l'application.
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('tbm-radar-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Réseau d'abord pour nos fichiers (toujours la dernière version en ligne), cache en secours hors ligne.
// Les API externes (TBM, itinéraires, tuiles) ne sont jamais mises en cache.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // toujours frais, contrôlé par l'application
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
