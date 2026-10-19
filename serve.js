// ローカル確認用の静的サーバー。app/ を http://localhost:5393 で配信する。
const http = require('http');
const fs = require('fs');
const path = require('path');
// 引数 docs で PWA版(docs/)を、なしで Artifact 用(app/)を配信する
const site = process.argv[2] || 'app';
const root = path.join(__dirname, site);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, p === '/' ? 'index.html' : p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    let body = buf;
    // 公開時に付く <!doctype> などの外枠をローカルでも再現する
    if (site === 'app' && file.endsWith('index.html')) body = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + buf + '</body></html>';
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(5393, () => console.log('http://localhost:5393'));
