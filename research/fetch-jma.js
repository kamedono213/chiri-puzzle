// 気象庁の平年値(1991〜2020年)から、月ごとの平均気温と降水量を取る。雨温図のもと。
// 出力: research/jma.json  { 地点名: {title, temp:[12], prec:[12], lon, lat} }
const fs = require('fs');
const ST = {
  札幌: [14, 47412], 旭川: [12, 47407], 釧路: [19, 47418], 網走: [17, 47409],
  金沢: [56, 47605], 新潟: [54, 47604], 秋田: [32, 47582], 鳥取: [69, 47746], 高田: [54, 47612],
  東京: [44, 47662], 高知: [74, 47893], 鹿児島: [88, 47827], 宮崎: [87, 47830],
  松本: [48, 47618], 長野: [48, 47610], 軽井沢: [48, 47622],
  高松: [72, 47891], 岡山: [66, 47768], 広島: [67, 47765],
  那覇: [91, 47936], 名瀬: [88, 47909], 石垣島: [91, 47918],
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => parseFloat(s.replace(/<[^>]+>/g, '').replace(/[)\]\s]/g, ''));
(async () => {
  const out = {};
  for (const [name, [p, b]] of Object.entries(ST)) {
    const u = `https://www.data.jma.go.jp/stats/etrn/view/nml_sfc_ym.php?prec_no=${p}&block_no=${b}&year=&month=&day=&view=`;
    const t = await (await fetch(u, { headers: { 'User-Agent': 'ChiriPuzzle/0.1 (personal study app)' } })).text();
    const title = (t.match(/<h3[^>]*>([^<]*)<\/h3>/) || [])[1];
    const rows = [...t.matchAll(/<tr class="mtx"[^>]*><th scope="row">(?:<[^>]+>)*(\d+)月(?:<\/[^>]+>)*<\/th>([\s\S]*?)<\/tr>/g)];
    const temp = [], prec = [];
    for (const r of rows) { const tds = [...r[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]); prec.push(num(tds[2])); temp.push(num(tds[3])); }
    out[name] = { title, url: u, temp, prec };
    console.log(name, title, temp.length, temp.join(','), '|', prec.join(','));
    await sleep(1200);
  }
  fs.writeFileSync(__dirname + '/jma.json', JSON.stringify(out, null, 1));
})();
