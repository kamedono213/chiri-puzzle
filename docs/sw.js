// 自動生成(tools/build-pages.js)。手で編集しない。
const CACHE = 'chiri-37252fab14';
const PRECACHE = ["./","app.js","data/jp.json","data/world.json","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","manifest.webmanifest"];
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.concat(LIBS))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('chiri-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Google Fonts は使うたびに保存(オフラインでは代わりの書体で表示)
  const isFont = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(e.request).then(res => {
      if (res.ok && (isFont || url.host === 'cdnjs.cloudflare.com' || url.origin === location.origin)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => e.request.mode === 'navigate' ? caches.match('./') : Response.error());
  }));
});
