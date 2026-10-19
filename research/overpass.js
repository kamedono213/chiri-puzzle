// Overpass API に問い合わせて結果を保存する。使い方: node overpass.js <出力ファイル> <クエリファイル>
const fs = require('fs');
const [out, qfile] = process.argv.slice(2);
const q = fs.readFileSync(qfile, 'utf8');
const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
(async () => {
  for (const h of hosts) {
    try {
      const r = await fetch(h, { method: 'POST', headers: { 'User-Agent': 'ChiriPuzzle/0.1 (personal study app)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (!r.ok) { console.error(h, r.status); continue; }
      fs.writeFileSync(out, await r.text()); console.log('ok', h); return;
    } catch (e) { console.error(h, e.message); }
  }
  process.exit(1);
})();
