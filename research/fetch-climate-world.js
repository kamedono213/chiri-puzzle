// 世界の気候の代表都市について、英語版Wikipediaの気候表(Weather box)から月平均気温と降水量を取り、
// 本文にケッペンの記号が書かれているかも確かめる。出力: research/climate-world.json
const fs = require('fs');
const CITIES = {
  シンガポール: ['Singapore', 'Climate of Singapore'], カイロ: ['Cairo'], パリ: ['Paris', 'Climate of Paris'], モスクワ: ['Template:Moscow weatherbox', 'Moscow'],
  ウトキアグヴィク: ['Utqiagvik, Alaska'], ダーウィン: ['Darwin, Northern Territory', 'Climate of Darwin'], ニアメ: ['Niamey'], ローマ: ['Rome', 'Climate of Rome'],
  ロンドン: ['London', 'Climate of London'], ニューヨーク: ['New York City', 'Climate of New York City'], イルクーツク: ['Irkutsk'], ボストーク基地: ['Vostok Station'],
  マナオス: ['Manaus'], ブラジリア: ['Brasília'], リヤド: ['Riyadh'], デンバー: ['Denver', 'Climate of Denver'], ケープタウン: ['Cape Town', 'Climate of Cape Town'],
  シドニー: ['Sydney', 'Climate of Sydney'], ホンコン: ['Hong Kong', 'Climate of Hong Kong'], ハルビン: ['Harbin'], ウランバートル: ['Ulaanbaatar'], ロングイェールビーン: ['Longyearbyen'], バンコク: ['Bangkok', 'Climate of Bangkok'], シャンハイ: ['Shanghai', 'Climate of Shanghai'], ブエノスアイレス: ['Buenos Aires', 'Climate of Buenos Aires'], 南極点: ['Amundsen–Scott South Pole Station'], コルカタ: ['Kolkata'], クアラルンプール: ['Kuala Lumpur', 'Climate of Kuala Lumpur'], テヘラン: ['Tehran', 'Climate of Tehran'], マドリード: ['Madrid', 'Climate of Madrid'],
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = { headers: { 'User-Agent': 'ChiriPuzzle/0.1 (personal study app)' } };
async function wikitext(title) {
  const u = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'parse', format: 'json', formatversion: '2', prop: 'wikitext', redirects: '1', page: title });
  let j; for (let k = 0; k < 6; k++) { const r = await fetch(u, H); const tx = await r.text(); try { j = JSON.parse(tx); break; } catch (e) { await sleep(15000); } } await sleep(2500);
  return j.parse ? j.parse.wikitext : '';
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function weatherbox(t) {
  const i = t.search(/\{\{\s*Weather box/i); if (i < 0) return null;
  let d = 0, j = i; for (; j < t.length; j++) { if (t.startsWith('{{', j)) { d++; j++; } else if (t.startsWith('}}', j)) { d--; j++; if (!d) break; } }
  const b = t.slice(i, j);
  const get = k => { const m = b.match(new RegExp(String.raw`\|\s*` + k + String.raw`\s*=\s*([−\-–]?[\d.]+)`, 'i')); return m ? parseFloat(m[1].replace(/[−–]/, '-')) : null; };
  const temp = MON.map(m => get(m + ' mean C')), prec = MON.map(m => get(m + ' precipitation mm') ?? get(m + ' rain mm'));
  const loc = (b.match(/\|\s*location\s*=\s*([^\n|]*)/) || [])[1];
  const src = (b.match(/\|\s*source\s*(?:1)?\s*=\s*([^\n]*)/) || [])[1];
  return { temp, prec, loc, src: src && src.slice(0, 200) };
}
(async () => {
  const OUTF = __dirname + '/climate-world.json'; const out = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : {};
  for (const [ja, titles] of Object.entries(CITIES)) { if (out[ja] && out[ja].temp) continue;
    let wb = null, kop = new Set(), used = null;
    for (const t of titles) {
      let w = await wikitext(t);
      (w.match(/K[öo]ppen[^.\n]{0,160}/g) || []).forEach(s => (s.match(/\b(Af|Am|Aw|As|BWh|BWk|BSh|BSk|Csa|Csb|Cwa|Cwb|Cfa|Cfb|Cfc|Dfa|Dfb|Dfc|Dfd|Dwa|Dwb|Dwc|Dsb|Dsc|ET|EF)\b/g) || []).forEach(k => kop.add(k)));
      if (!wb) {
        let b = weatherbox(w);
        if (!b) { const m = w.match(/\{\{\s*([^{}|]*?weatherbox[^{}|]*)\}\}/i); if (m) { const tw = await wikitext('Template:' + m[1].trim()); b = weatherbox(tw); if (b) used = 'Template:' + m[1].trim(); } }
        else used = t;
        if (b && b.temp.every(x => x !== null) && b.prec.every(x => x !== null)) wb = b;
      }
    }
    out[ja] = { page: used, koppen: [...kop], ...(wb || {}) };
    fs.writeFileSync(OUTF, JSON.stringify(out, null, 1)); console.log(ja, used, [...kop].join('/'), wb ? wb.temp.join(',') + ' | ' + wb.prec.join(',') : 'NO BOX', wb && wb.loc);
  }
  fs.writeFileSync(__dirname + '/climate-world.json', JSON.stringify(out, null, 1));
})();
