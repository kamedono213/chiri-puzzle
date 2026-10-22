// e-Stat の Excel(xlsx)を外部ライブラリなしで読む(統計の確認用)。
// 使い方: node research/xlsx-read.js <file.xlsx> [title|rank 列番号]
//   title … 表題(最初の数セル)を出す
//   rank N … N列目(0始まり)を数値として都道府県で並べ、上位を出す
const { execFileSync } = require('child_process');
const [file, mode = 'title', colArg] = process.argv.slice(2);
const unzip = p => { try { return execFileSync('unzip', ['-p', file, p], { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { return ''; } };
const ss = [...unzip('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join(''));
const sheet = unzip('xl/worksheets/sheet1.xml');
const col = ref => { const l = ref.match(/^[A-Z]+/)[0]; let n = 0; for (const c of l) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
const rows = [];
for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const row = [];
  for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const v = (c[3] || '').match(/<v>([^<]*)<\/v>/), isS = /t="s"/.test(c[2]);
    row[col(c[1])] = v ? (isS ? ss[+v[1]] : v[1]) : ((c[3] || '').match(/<t[^>]*>([^<]*)/) || [])[1];
  }
  rows.push(row);
}
const PREFS = '北海道 青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 東京 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 京都 大阪 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄'.split(' ');
const prefOf = row => { const s = (row.find(x => x && /\S/.test(x)) || '').replace(/\s/g, ''); return PREFS.find(p => s === p || s === p + '県' || s === p + '府' || s === p + '都'); };
if (mode === 'title') console.log(rows.slice(0, 8).map(r => r.filter(Boolean).join(' ')).filter(Boolean).join(' / ').slice(0, 300));
if (mode === 'head') rows.slice(0, 14).forEach((r, i) => console.log(i, JSON.stringify(r)));
if (mode === 'rank') {
  const c = +colArg;
  const list = rows.map(r => [prefOf(r), +String(r[c] || '').replace(/[^\d.]/g, '')]).filter(([p, v]) => p && v);
  list.sort((a, b) => b[1] - a[1]);
  const total = (rows.find(r => (r.find(x => x && /\S/.test(x)) || '').replace(/\s/g, '') === '全国') || [])[c];
  console.log('全国', total, '| ' + list.slice(0, 5).map(([p, v]) => p + ' ' + v).join(' | '));
}
