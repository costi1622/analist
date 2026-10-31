// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Analist service worker: aplicația pornește instant și fără rețea.
// Cache versionat: o versiune nouă se instalează în fundal și așteaptă până apeși „Reîncarcă”.
// Datele din GitHub NU trec pe aici (alt domeniu); aplicația le ține singură, cu ETag.
const CACHE = 'analist-0.30.0';
const SHELL = ['./', 'index.html', 'app.js', 'garda.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'motor/engine.js', 'motor/config.js', 'font/space-grotesk-latin-500-normal.woff2', 'font/space-grotesk-latin-700-normal.woff2', 'font/space-grotesk-latin-ext-500-normal.woff2', 'font/space-grotesk-latin-ext-700-normal.woff2'];
self.addEventListener('install', e => {
  // fișier cu fișier: unul lipsă nu blochează instalarea
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('message', e => { if (e.data === 'activeaza') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('analist-') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.endsWith('.webmanifest')) return;
  // cache întâi (instant), rețea doar pentru ce lipsește
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit ||
    fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => c.match('index.html')))));
});
