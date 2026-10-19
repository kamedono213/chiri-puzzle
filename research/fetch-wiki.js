// 出題リストの各項目について、日本語版Wikipediaから 座標・冒頭文・WikidataID を取る。
// 出力: research/wiki.json  { 記事名: {title, coord:[lon,lat], extract, qid} }
const fs = require('fs');
const path = require('path');
const titles = [];
for (const f of ['items-jp.txt', 'items-world.txt'])
  for (const line of fs.readFileSync(path.join(__dirname, '../data', f), 'utf8').split(/\r?\n/))
    if (line && !line.startsWith('#')) titles.push(line.split('|')[3]);
const OUT = path.join(__dirname, 'wiki.json');
const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const todo = [...new Set(titles)].filter(t => !db[t]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const u = 'https://ja.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'coordinates|extracts|pageprops', exintro: '1', explaintext: '1', exlimit: '20', ppprop: 'wikibase_item', coprimary: 'primary', titles: batch.join('|') });
    const r = await fetch(u, { headers: { 'User-Agent': 'ChiriPuzzle/0.1 (personal study app; kamedono213 github)' } });
    if (!r.ok) { console.error('HTTP', r.status); await sleep(10000); i -= 20; continue; }
    const j = await r.json();
    const map = {};
    (j.query.normalized || []).forEach(n => map[n.from] = n.to);
    (j.query.redirects || []).forEach(n => map[n.from] = n.to);
    const resolve = t => { let x = t; for (let k = 0; k < 3 && map[x]; k++) x = map[x]; return x; };
    for (const t of batch) {
      const p = j.query.pages.find(p => p.title === resolve(t));
      if (!p || p.missing) { db[t] = { missing: true }; console.log('MISSING', t); continue; }
      const c = p.coordinates && p.coordinates[0];
      db[t] = { title: p.title, coord: c ? [c.lon, c.lat] : null, extract: (p.extract || '').slice(0, 1200), qid: p.pageprops && p.pageprops.wikibase_item };
    }
    fs.writeFileSync(OUT, JSON.stringify(db, null, 1));
    console.log(i + batch.length, '/', todo.length);
    await sleep(1500);
  }
  const all = Object.entries(db);
  console.log('nocoord:', all.filter(([, v]) => !v.missing && !v.coord).map(([k]) => k).join(' '));
  console.log('missing:', all.filter(([, v]) => v.missing).map(([k]) => k).join(' '));
})();
