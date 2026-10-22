// 農林水産省「令和6年産野菜生産出荷統計」表4(都道府県別・品目別)から、品目ごとの収穫量1位・2位を出す。
// 使い方: node research/veg-rank.js <f005-06-086.xlsx>
const { execFileSync } = require('child_process');
const file = process.argv[2];
const unzip = p => execFileSync('unzip', ['-p', file, p], { encoding: 'utf8', maxBuffer: 1 << 28 });
const ss = [...unzip('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join(''));
const col = ref => { let n = 0; for (const c of ref) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
const rows = [];
for (const r of unzip('xl/worksheets/sheet1.xml').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const row = [];
  for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const v = (c[3] || '').match(/<v>([^<]*)<\/v>/);
    row[col(c[1])] = v ? (/t="s"/.test(c[2]) ? ss[+v[1]] : v[1]) : undefined;
  }
  rows.push(row);
}
const head = rows.find(r => r.includes('北海道'));
const prefCols = head.map((v, i) => v && v !== '品目ヒンモク' ? [v, i + 1] : null).filter(Boolean); // 収穫量は都道府県名の1つ右
for (const r of rows) {
  const name = (r[1] || r[0] || r[2] || "").replace(/[ァ-ヶー]+$/, "").replace(/\s/g, "").trim();
  if (!name || name === '品目') continue;
  const vals = prefCols.map(([p, i]) => [p, +String(r[i] || '').replace(/[^\d]/g, '') || 0]).filter(x => x[1]);
  if (!vals.length) continue;
  vals.sort((a, b) => b[1] - a[1]);
  const sum = vals.reduce((a, b) => a + b[1], 0);
  console.log(name.padEnd(10), vals.slice(0, 3).map(([p, v]) => `${p} ${v}(${(v / sum * 100).toFixed(0)}%)`).join('  '), ' | 1位と2位の差 ' + (vals[1] ? ((vals[0][1] - vals[1][1]) / vals[0][1] * 100).toFixed(0) + '%' : '-'));
}
