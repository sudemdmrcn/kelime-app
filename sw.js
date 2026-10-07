// Önbellek sürümünü her yayında artırın (VERSION). Ağ öncelikli, çevrimdışıyken önbellekten açılır.
const VERSION = 'kelime-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'store.js', 'quiz.js', 'words-yds.js', 'words-legacy.js', 'manifest.json', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('index.html')))
  );
});
