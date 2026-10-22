// PDF の文字を全部書き出す(統計の確認用)。使い方: node research/pdfdump.mjs <pdf> > out.txt
import { getDocument } from '../../RekishiPuzzle/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const file = process.argv[2];
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), cMapUrl: '../RekishiPuzzle/node_modules/pdfjs-dist/cmaps/', cMapPacked: true }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const items = (await (await doc.getPage(p)).getTextContent()).items;
  // 行ごとにまとめる(y座標が同じものを1行に)
  const rows = new Map();
  for (const i of items) { const y = Math.round(i.transform[5]); if (!rows.has(y)) rows.set(y, []); rows.get(y).push([i.transform[4], i.str]); }
  console.log('=== page ' + p);
  for (const y of [...rows.keys()].sort((a, b) => b - a)) console.log(rows.get(y).sort((a, b) => a[0] - b[0]).map(r => r[1]).join(' ').replace(/\s+/g, ' '));
}
