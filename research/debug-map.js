// 確認用: 全部の地点に名前を付けた地図を SVG で書き出す(位置のずれを目で確かめる)
// 使い方: node research/debug-map.js jp mount   → research/debug-jp-mount.svg
const fs = require('fs');
const path = require('path');
const [area, cat] = process.argv.slice(2);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/data', area + '.json'), 'utf8'));
const items = D.items.filter(i => !cat || i.cat === cat);
const col = { 1: '#d6455a', 2: '#2f7fd1', 3: '#2f9e6b' };
const name = i => i.cat === 'climate' ? i.city + ':' + i.key : i.segs.map(s => s.t).join('');
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${D.w} ${D.h}" width="${D.w * (area === 'jp' ? 2 : 1.2)}" height="${D.h * (area === 'jp' ? 2 : 1.2)}" style="background:#cfe8f3">`;
if (D.sphere) s += `<path d="${D.sphere}" fill="#cfe8f3"/>`;
s += `<path d="${D.land}" fill="#fbf3df" stroke="#8a7a5c" stroke-width="0.6"/><path d="${D.borders}" fill="none" stroke="#c9b994" stroke-width="0.5"/>`;
if (D.lakes) s += `<path d="${D.lakes}" fill="#cfe8f3"/>`;
for (const i of items) {
  if (i.d) s += `<path d="${i.d}" fill="none" stroke="#2f7fd1" stroke-width="1.2"/>`;
  if (i.area) s += `<path d="${i.area}" fill="#a4673b" fill-opacity=".25" stroke="#a4673b" stroke-width=".6"/>`;
}
const fs2 = area === 'jp' ? 7 : 9;
for (const i of items) s += `<circle cx="${i.x}" cy="${i.y}" r="${fs2 / 2.5}" fill="${col[i.lv]}"/><text x="${i.x + 4}" y="${i.y + 3}" font-size="${fs2}" font-family="sans-serif" fill="${col[i.lv]}" stroke="#fff" stroke-width="2" paint-order="stroke">${name(i)}</text>`;
s += '</svg>';
const out = path.join(__dirname, `debug-${area}-${cat || 'all'}.svg`);
fs.writeFileSync(out, s);
console.log(out);
