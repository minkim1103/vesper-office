// 앱 화면(껍데기)만 캐시해서 빠르게 열리게 합니다. 일정 데이터(/api)는 항상 서버에서 새로 받습니다.
const CACHE = 'vesper-shell-2.36';
const FONTS = 'vesper-fonts-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/fonts/v1/fonts.css', '/app.js', '/assistant.js', '/search.js', '/i18n.js', '/manifest.webmanifest', '/icons/logo.svg', '/icons/chatgpt-logo.svg', '/icons/icon-192.png', '/icons/chatgpt-icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('vesper-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/mcp')) return;
  if (url.pathname.startsWith('/fonts/v1/') && url.pathname.endsWith('.woff2')) {
    // Cache only requested Unicode subsets, never the entire Korean font at startup.
    e.respondWith(caches.open(FONTS).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) await cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
