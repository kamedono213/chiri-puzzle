// GitHub Pages 用のPWA版を docs/ に書き出す。
// app/index.html は Artifact 用(外枠なし)なので、ここで <!doctype> と <head> を付け、マニフェストとサービスワーカーを足す。
// 実行: node tools/build-pages.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const APP = path.join(__dirname, '../app');
const OUT = path.join(__dirname, '../docs');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(APP, OUT, { recursive: true });

// index.html: <div id="app"> より前(title/meta/link/style)を head へ、残りを body へ
const src = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const cut = src.indexOf('<div id="app">');
const head = src.slice(0, cut), body = src.slice(cut);
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f4efe4">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ちりパズル">
<style>:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); } body { margin: 0; }</style>
${head.trim()}
</head>
<body>
${body.trim()}
<script>
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);

fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'ちりパズル',
  short_name: 'ちりパズル',
  description: '山地・川・平野・半島・気候のカードを、白地図の正しい場所にはめる地理パズル(日本編・世界編)',
  lang: 'ja',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#f4efe4',
  theme_color: '#f4efe4',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// サービスワーカー: 初回にアプリ一式を保存し、以後はオフラインでも動く。
// キャッシュ名に中身のハッシュを入れ、更新があれば自動で入れ替わる。
const files = [];
(function walk(d, rel) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), r = rel ? rel + '/' + f : f;
    if (fs.statSync(p).isDirectory()) walk(p, r); else files.push(r);
  }
})(OUT, '');
const hash = crypto.createHash('sha1');
files.sort().forEach(f => hash.update(f).update(fs.readFileSync(path.join(OUT, f))));
const version = hash.digest('hex').slice(0, 10);
const precache = ['./', ...files.filter(f => f !== 'index.html')];
// 地図の拡大縮小に使う d3 も最初に保存して、オフラインでも遊べるようにする
const libs = ['https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'];
fs.writeFileSync(path.join(OUT, 'sw.js'), `// 自動生成(tools/build-pages.js)。手で編集しない。
const CACHE = 'chiri-${version}';
const PRECACHE = ${JSON.stringify(precache)};
const LIBS = ${JSON.stringify(libs)};
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
`);
console.log('docs/ built:', files.length + 2, 'files, cache', version);
