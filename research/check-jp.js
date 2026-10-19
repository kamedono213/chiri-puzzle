// 日本編の各地点が、出題リストに書いた都道府県の中(または近く)にあるかを確かめる。
const fs = require('fs');
const d3 = require('d3-geo');
const prefs = JSON.parse(fs.readFileSync(__dirname + '/jp-prefs.geojson', 'utf8')).features;
const db = JSON.parse(fs.readFileSync(__dirname + '/wiki.json', 'utf8'));
const lines = fs.readFileSync(__dirname + '/../data/items-jp.txt', 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
const km = (a, b) => d3.geoDistance(a, b) * 6371;
function nearestKm(f, pt) { let m = Infinity; const walk = c => typeof c[0] === 'number' ? (m = Math.min(m, km(c, pt))) : c.forEach(walk); walk(f.geometry.coordinates); return m; }
let bad = 0;
for (const l of lines) {
  const [cat, lv, , title, pl] = l.split('|');
  const w = db[title]; const pt = w.coord || w.wd;
  const exp = pl.split(' ');
  const inside = prefs.find(f => d3.geoContains(f, pt));
  const name = inside ? inside.properties.name.replace(/(?<!北海)[都府県]$/, '') : null;
  const ok = name && exp.includes(name);
  const diff = w.coord && w.wd ? km(w.coord, w.wd).toFixed(0) : '-';
  if (!ok) {
    const near = exp.map(e => { const f = prefs.find(f => f.properties.name.replace(/(?<!北海)[都府県]$/, '') === e); return f ? nearestKm(f, pt) : 999; });
    const d = Math.min(...near);
    console.log((d > 8 ? 'NG ' : 'near ') + title, 'at', pt.map(x => x.toFixed(3)).join(','), 'in', name, 'exp', pl, 'dist', d.toFixed(1) + 'km', 'ja-wd', diff);
    if (d > 8) bad++;
  } else if (diff !== '-' && +diff > 30) console.log('diff', title, diff + 'km');
}
console.log('NG', bad, '/', lines.length);
