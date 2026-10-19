// wiki.json の各項目の WikidataID から、座標(P625)と英語名を取る。ja版に座標がない項目の補完用。
const fs = require('fs');
const db = JSON.parse(fs.readFileSync(__dirname + '/wiki.json', 'utf8'));
const items = Object.values(db).filter(v => v.qid && v.wd === undefined);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < items.length; i += 40) {
    const b = items.slice(i, i + 40);
    const u = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: b.map(x => x.qid).join('|'), props: 'claims|labels', languages: 'en|ja' });
    const r = await fetch(u, { headers: { 'User-Agent': 'ChiriPuzzle/0.1 (personal study app)' } });
    if (!r.ok) { console.error(r.status); await sleep(8000); i -= 40; continue; }
    const j = await r.json();
    for (const x of b) {
      const e = j.entities[x.qid]; const c = e && e.claims && e.claims.P625;
      const v = c && c[0].mainsnak.datavalue && c[0].mainsnak.datavalue.value;
      x.wd = v ? [v.longitude, v.latitude] : null;
      x.en = e && e.labels && e.labels.en && e.labels.en.value;
    }
    fs.writeFileSync(__dirname + '/wiki.json', JSON.stringify(db, null, 1));
    console.log(i + b.length, '/', items.length); await sleep(1200);
  }
  console.log('no coord at all:', Object.entries(db).filter(([, v]) => !v.missing && !v.coord && !v.wd).map(([k]) => k).join(' '));
})();
