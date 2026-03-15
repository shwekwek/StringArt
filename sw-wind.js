// Shweka Wind — Service Worker v1.4
// Caches the app for fully offline use.
// On update: notifies the open page so user can reload cleanly.

const CACHE = 'shweka-wind-v1.4';
const PRECACHE = [
  './indexwind.html',
  './manifest-wind.json',
  './wind-icon.svg'
];

// Install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting(); // take over immediately, don't wait for tabs to close
});

// Activate: delete old cache versions, then tell all open windows to show update toast
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => {
        // Notify all open clients that a new version is live
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients => {
            clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', cache: CACHE }));
          });
      })
  );
  self.clients.claim();
});

// Fetch: cache-first for same-origin, pass-through for external (fonts, TTS audio)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // let external requests go through normally

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
