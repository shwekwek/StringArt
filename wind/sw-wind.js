// Shweka Wind — Service Worker v1.5
// Caches the app for fully offline use.
// version-wind.json is NEVER cached so version checks always hit the network.

const CACHE = 'shweka-wind-v1.14';
const PRECACHE = [
  './indexwind.html',
  './manifest-wind.json',
  './wind-icon.svg',
  './wind-icon-192.png',
  './wind-icon-512.png'
];

// Install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  // Tell all open windows to reload so they get the fresh version from new cache
  self.clients.matchAll({type:'window'}).then(clients=>{
    clients.forEach(c=>c.postMessage({type:'SW_UPDATED'}));
  });
});

// Fetch: version-wind.json always goes to network (never cached).
// Everything else: cache-first for same-origin, pass-through for external.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache the version file — always fresh from network
  if (url.pathname.endsWith('version-wind.json')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{}', {headers:{'Content-Type':'application/json'}})));
    return;
  }

  // Pass external requests (fonts, TTS) straight through
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
