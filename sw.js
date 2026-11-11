// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Analist service worker: aplicația pornește instant și fără rețea.
// Cache versionat: o versiune nouă se instalează în fundal și așteaptă până apeși „Reîncarcă”.
// Datele din GitHub NU trec pe aici (alt domeniu); aplicația le ține singură, cu ETag.
const CACHE = 'analist-0.51.0';
const SHELL = ['./', 'index.html', 'app.js', 'garda.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'badge-96.png', 'motor/engine.js', 'motor/config.js', 'font/space-grotesk-latin-500-normal.woff2', 'font/space-grotesk-latin-700-normal.woff2', 'font/space-grotesk-latin-ext-500-normal.woff2', 'font/space-grotesk-latin-ext-700-normal.woff2'];
self.addEventListener('install', e => {
  // fișier cu fișier: unul lipsă nu blochează instalarea
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('message', e => { if (e.data === 'activeaza') self.skipWaiting(); });
// Chitanțele de primire (IndexedDB): doar id-ul notificării și ora. Aplicația vede așa ce n-a ajuns pe telefon.
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('analist', 1); r.onupgradeneeded = () => r.result.createObjectStore('primite', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const chitanta = (id, doarDacaLipseste) => idb().then(db => new Promise(res => { const st = db.transaction('primite', 'readwrite').objectStore('primite');
  const scrie = () => st.put({ id, t: Date.now() });
  if (doarDacaLipseste) { const g = st.get(id); g.onsuccess = () => { if (!g.result) scrie(); }; } else scrie();
  // cel mult 300 de chitanțe: cele mai vechi pleacă
  const c = st.getAll(); c.onsuccess = () => { const l = (c.result || []).filter(x => x.id !== '_start').sort((a, b) => a.t - b.t); for (const x of l.slice(0, Math.max(0, l.length - 300))) st.delete(x.id); };
  st.transaction.oncomplete = () => { db.close(); res(); }; st.transaction.onerror = () => { db.close(); res(); }; })).catch(() => {});
self.addEventListener('activate', e => {
  e.waitUntil(chitanta('_start', true));
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('analist-') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.endsWith('.webmanifest')) return;
  // v0.46: codul analizei publicat pentru actualizare și amprentele lui se citesc mereu din rețea, niciodată din cache
  if (u.pathname.includes('/analiza/') || u.pathname.endsWith('/amprente.json')) return;
  // cache întâi (instant), rețea doar pentru ce lipsește
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit ||
    fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => c.match('index.html')))));
});

// Notificările analistului (Web Push). Mesajul vine criptat cap-coadă; browserul îl decriptează și îl dă aici.
// Linkul se deschide doar în aplicație (aceeași adresă); orice altceva duce la pagina principală.
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch { m = {}; }
  const scope = self.registration.scope, sir = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
  const url = typeof m.url === 'string' && m.url.startsWith(scope) ? m.url : scope;
  const tag = sir(m.tag, 60) || undefined, id = /^[A-Za-z0-9_-]{12}$/.test(m.id || '') ? m.id : null;
  // aplicația deschisă aduce imediat noutatea (fără conținut în mesaj)
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.forEach(c => c.postMessage({ tip: 'push' }))));
  if (id) e.waitUntil(chitanta(id));
  e.waitUntil(self.registration.showNotification(sir(m.titlu, 120) || 'Analist', {
    body: sir(m.text, 500), icon: 'icon-192.png', badge: 'badge-96.png', tag, renotify: !!tag,
    silent: m.silentios === true, requireInteraction: m.urgent === true, data: { url }, lang: 'ro', timestamp: Date.now() }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const scope = self.registration.scope, url = e.notification.data?.url || scope, h = url.includes('#') ? url.slice(url.indexOf('#')) : '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const w = lista.find(c => c.url.startsWith(scope));
    if (w) { w.postMessage({ tip: 'ancora', h }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
