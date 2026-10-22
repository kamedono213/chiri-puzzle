// 地図とパズルのデータを作る。research/ に集めた元データから app/data/jp.json と app/data/world.json を書き出す。
// 実行: node tools/build-data.js
// ・地図は先に投影してSVGのパス文字列にしておく(アプリ側では地図の計算をしない)
// ・位置は Wikipedia/Wikidata の座標、川の形は OpenStreetMap(日本)と Natural Earth(世界)、
//   山脈・平野・半島の範囲(世界)は Natural Earth の地域ポリゴンを使う
// ・気候は気象庁の平年値(日本)と英語版Wikipediaの気候表(世界)。世界はケッペンの式で分類を検算する
const fs = require('fs');
const path = require('path');
const d3 = require('d3-geo');
const topojsonServer = require('topojson-server');
const topojsonSimplify = require('topojson-simplify');
const topojson = require('topojson-client');
const SHAPES = require('./shapes');
// 「|」で区切る。ただし {漢字|よみ} の中の「|」では切らない
// 地図にぬる範囲は、ピースと同じ形(はなれた島や海外領土を入れると、ステージの表示範囲が広がりすぎる)
const withArea = shape => ({ shape, area: shape.d });
function splitOutside(str) { const out = ['']; let depth = 0; for (const ch of str) { if (ch === '{') depth++; if (ch === '}') depth--; if (ch === '|' && !depth) out.push(''); else out[out.length - 1] += ch; } return out; }

const R = p => path.join(__dirname, '../research', p);
const D = p => path.join(__dirname, '../data', p);
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const wiki = readJSON(R('wiki.json'));
const cities = readJSON(R('cities.json'));
const jma = readJSON(R('jma.json'));
const climateWorld = readJSON(R('climate-world.json'));
const grade = readJSON(D('kanji-grade.json'));
const EASY = new Set((grade[1] + grade[2] + grade[3] + grade[4]).split(''));
const errors = [];
const fail = m => errors.push(m);

// ---------- 出題リストとヒント
function readItems(file, area) {
  return fs.readFileSync(D(file), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
    const [cat, lv, name, title, where] = l.split('|');
    // 名前: 「漢字:よみ」を / で区切る。よみの最後の ! は難読(必ずふりがな)
    const segs = name.split('/').map(s => {
      const [text, y] = s.split(':');
      if (!y) return { t: text };
      const hard = y.endsWith('!'), r = y.replace('!', '');
      const needRuby = hard || [...text].some(ch => /[一-鿿]/.test(ch) && !EASY.has(ch));
      return needRuby ? { t: text, r } : { t: text };
    });
    return { area, cat, lv: +lv, segs, name: segs.map(s => s.t).join(''), title, where: where.split(' ') };
  });
}
const HINT = {};
for (const l of fs.readFileSync(D('hints.txt'), 'utf8').split(/\r?\n/)) {
  if (!l || l.startsWith('#')) continue;
  const i = l.indexOf('|'); HINT[l.slice(0, i)] = l.slice(i + 1);
}
// 小学生レベルで出す文に、ふりがなのない「4年生までに習わない漢字」が残っていないか調べる
function checkRuby(text, label) {
  const plain = text.replace(/\{[^|}]+\|[^}]+\}/g, '');
  const hard = [...plain].filter(ch => /[一-鿿]/.test(ch) && !EASY.has(ch));
  if (hard.length) RUBY_TODO.push(label + ': ' + [...new Set(hard)].join(''));
}
const RUBY_TODO = [];

// ---------- 幾何の小道具
function simplifyLine(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, md = tol;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - x1) - dx * (pts[i][1] - y1)) / L; if (d > md) { md = d; idx = i; } }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const f1 = v => Math.round(v * 10) / 10;
const lineD = lines => lines.map(l => 'M' + l.map(p => f1(p[0]) + ',' + f1(p[1])).join('L')).join('');
function pointInPoly(pt, rings) { // 偶奇判定(穴も含む)
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 細長い範囲(アンデスなど)で番号が外に出ないよう、範囲の内側で元の位置にいちばん近い点をさがす
function insidePoint(rings, near) {
  const all = rings.flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), st = Math.max(x1 - x0, y1 - y0) / 80;
  let best = null, bd = Infinity;
  for (let x = x0; x <= x1; x += st) for (let y = y0; y <= y1; y += st) {
    if (!pointInPoly([x, y], rings)) continue;
    // 境目から少し内側の点を選ぶ(4方向とも中なら内側)
    if (![[st, 0], [-st, 0], [0, st], [0, -st]].every(([a, b]) => pointInPoly([x + a, y + b], rings))) continue;
    const d = Math.hypot(x - near[0], y - near[1]); if (d < bd) { bd = d; best = [x, y]; }
  }
  return best || rings[0][0];
}
const km = (a, b) => d3.geoDistance(a, b) * 6371;
function coordsOf(g) { const out = []; const walk = c => typeof c[0] === 'number' ? out.push(c) : c.forEach(walk); walk(g.coordinates); return out; }

// 平面に投影済みのGeoJSONを topojson で簡略化してパスにする(境界線が隣どうしで食い違わない)
function planarTopo(features, minArea) {
  const topo = topojsonServer.topology({ f: { type: 'FeatureCollection', features } }, 1e6);
  const pre = topojsonSimplify.presimplify(topo, topojsonSimplify.planarTriangleArea);
  return topojsonSimplify.simplify(pre, minArea);
}
const planarPath = d3.geoPath().digits(1);
function projectGeom(geom, proj) {
  const P = c => proj(c);
  const ring = r => r.map(P);
  if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: geom.coordinates.map(ring) };
  if (geom.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geom.coordinates.map(p => p.map(ring)) };
  if (geom.type === 'LineString') return { type: 'LineString', coordinates: ring(geom.coordinates) };
  if (geom.type === 'MultiLineString') return { type: 'MultiLineString', coordinates: geom.coordinates.map(ring) };
  throw new Error(geom.type);
}

// ---------- ケッペンの気候区分(日本の教科書にあわせ、温帯と冷帯の境は最寒月 -3℃)
function koppen(temp, prec, south) {
  const T = temp, P = prec, MAT = T.reduce((a, b) => a + b) / 12, MAP = P.reduce((a, b) => a + b);
  const tmax = Math.max(...T), tmin = Math.min(...T);
  const sumIdx = south ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8], winIdx = south ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const Ps = sumIdx.map(i => P[i]), Pw = winIdx.map(i => P[i]);
  const summerShare = Ps.reduce((a, b) => a + b) / MAP;
  const th = 2 * MAT + (summerShare >= 0.7 ? 28 : summerShare >= 0.3 ? 14 : 0);
  if (tmax < 10) return tmax > 0 ? 'ET' : 'EF';
  if (MAP < 10 * th) return MAP < 5 * th ? 'BW' : 'BS';
  if (tmin >= 18) { const pd = Math.min(...P); return pd >= 60 ? 'Af' : pd >= 100 - MAP / 25 ? 'Am' : 'Aw'; }
  const third = tmin > -3 ? 'C' : 'D';
  const psd = Math.min(...Ps), pwd = Math.min(...Pw), psw = Math.max(...Ps), pww = Math.max(...Pw);
  let s = 'f';
  if (psd < 40 && psd < pww / 3) s = 's'; else if (pwd < psw / 10) s = 'w';
  return third + s + (tmax >= 22 ? 'a' : 'b');
}

// ======================================================================
// 日本編
// ======================================================================
function buildJapan() {
  const W = 1000;
  const prefs = readJSON(R('jp-prefs.geojson')).features;
  // 南西諸島(北緯29.2度より南)は左上の囲みに入れる。小笠原などの遠い島は描かない。
  const isInset = c => c[1] < 29.2 && c[0] < 131.5;
  const isFar = c => (c[0] > 141.5 && c[1] < 31) || c[1] < 24;
  const splitPolys = (g, test) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).filter(p => test(d3.geoCentroid({ type: 'Polygon', coordinates: p })));
  const main = prefs.map(f => ({ type: 'Feature', properties: f.properties, geometry: { type: 'MultiPolygon', coordinates: splitPolys(f.geometry, c => !isInset(c) && !isFar(c)) } })).filter(f => f.geometry.coordinates.length);
  const south = prefs.map(f => ({ type: 'Feature', properties: f.properties, geometry: { type: 'MultiPolygon', coordinates: splitPolys(f.geometry, isInset) } })).filter(f => f.geometry.coordinates.length);
  const proj = d3.geoConicConformal().parallels([33, 44]).rotate([-137, 0]).fitWidth(W - 40, { type: 'FeatureCollection', features: main });
  const [[x0, y0], [x1, y1]] = d3.geoPath(proj).bounds({ type: 'FeatureCollection', features: main });
  proj.translate([proj.translate()[0] + 20 - x0, proj.translate()[1] + 20 - y0]);
  const H = Math.ceil(y1 - y0 + 40);
  // 囲みの投影: 同じ縮尺で、沖縄本島あたりが左上に来るようずらす
  const sb = d3.geoPath(proj).bounds({ type: 'FeatureCollection', features: south });
  const IN = { x: 20, y: 20, pad: 14 };
  const dx = IN.x + IN.pad - sb[0][0], dy = IN.y + IN.pad - sb[0][1];
  const projS = c => { const p = proj(c); return [p[0] + dx, p[1] + dy]; };
  const inset = { x: IN.x, y: IN.y, w: sb[1][0] - sb[0][0] + IN.pad * 2, h: sb[1][1] - sb[0][1] + IN.pad * 2 };
  const P = c => isInset(c) ? projS(c) : proj(c);

  const projected = main.map(f => ({ type: 'Feature', properties: f.properties, geometry: projectGeom(f.geometry, c => proj(c)) }))
    .concat(south.map(f => ({ type: 'Feature', properties: f.properties, geometry: projectGeom(f.geometry, projS) })));
  const topo = planarTopo(projected, 0.4);
  const obj = topo.objects.f;
  const land = planarPath(topojson.merge(topo, obj.geometries));
  const borders = planarPath(topojson.mesh(topo, obj, (a, b) => a !== b));
  const prefShapes = topojson.feature(topo, obj).features.map(f => ({ n: f.properties.name, d: planarPath(f) }));

  // 湖(琵琶湖など)
  const lakesSrc = readJSON(R('raw/ne_10m_lakes.geojson')).features.filter(f => { const c = d3.geoCentroid(f); return c[0] > 129 && c[0] < 146 && c[1] > 30 && c[1] < 46 && d3.geoArea(f) * 6371 * 6371 > 60; });
  const lakes = lakesSrc.map(f => planarPath(projectGeom(f.geometry, proj))).join('');

  // 川(OpenStreetMap)
  const osm = readJSON(R('raw/osm-rivers-jp.json')).elements.concat(readJSON(R('raw/osm-shimanto.json')).elements);
  const items = readItems('items-jp.txt', 'jp');
  const out = [];
  for (const it of items) {
    const w = wiki[it.title];
    if (!w || w.missing) { fail('記事なし ' + it.title); continue; }
    // 位置: 山・平野・半島は Wikidata(範囲の中ほど)を優先、なければ Wikipedia の座標。
    // 確認用の地図(research/debug-map.js)で範囲の端や外に出ていたものは、代表的な山・地点で置きかえる
    const ll = JP_FIX[it.title] || w.wd || w.coord;
    if (!ll) { fail('座標なし ' + it.title); continue; }
    const o = { id: 'jp-' + it.cat + '-' + it.name, cat: it.cat, lv: it.lv, segs: it.segs, title: w.title, region: regionOf(it.where), hint: HINT[it.title] };
    if (!o.hint) fail('ヒントなし ' + it.title);
    if (it.lv === 1) checkRuby(o.hint, it.name);
    if (it.cat === 'river') {
      const name = it.name;
      const cands = osm.filter(e => e.type === 'relation' && (e.tags.name === name || e.tags.name.startsWith(name + '(')));
      let best = null, bestScore = -1;
      for (const rel of cands) {
        const ways = rel.members.filter(m => m.type === 'way' && m.geometry && (!m.role || m.role === 'main_stream' || m.role === 'main')).map(m => m.geometry.map(g => [g.lon, g.lat]));
        if (!ways.length) continue;
        const pts = ways.flat();
        const near = Math.min(...pts.filter((_, i) => i % 5 === 0).map(p => km(p, ll)));
        const len = ways.reduce((s, l) => s + l.slice(1).reduce((a, p, i) => a + km(l[i], p), 0), 0);
        if (near > 40) continue;
        if (len > bestScore) { bestScore = len; best = ways; }
      }
      if (!best) { fail('川の形なし ' + name); continue; }
      const lines = best.map(l => simplifyLine(l.map(P), 0.35)).filter(l => l.length > 1);
      o.d = lineD(lines);
      o.km = Math.round(bestScore);
      // 番号を置く場所: 川の点のうち、川全体の真ん中に近い点
      const pts = lines.flat();
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const m = pts.reduce((b, p) => Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? p : b);
      o.x = f1(m[0]); o.y = f1(m[1]);
    } else {
      const p = P(ll); o.x = f1(p[0]); o.y = f1(p[1]);
    }
    out.push(o);
  }

  // 気候(気象庁 平年値 1991〜2020)
  const JP_CLIMATE = {
    hokkaido: { name: '北海道の気候', segs: [{ t: '北海道' }, { t: 'の' }, { t: '気候' }], hint: '冬の寒さがきびしく、{梅雨|つゆ}がない。1年を通して雨が少なめ。' },
    nihonkai: { name: '日本海側の気候', segs: [{ t: '日本海側' }, { t: 'の' }, { t: '気候' }], hint: '冬に雪や雨が多く、冬の{降水量|こうすいりょう}が多い。冬の{季節風|きせつふう}が、日本海の{湿|しめ}った空気を運んでくる。' },
    taiheiyo: { name: '太平洋側の気候', segs: [{ t: '太平洋側' }, { t: 'の' }, { t: '気候' }], hint: '夏に雨が多く、冬は晴れて{乾燥|かんそう}する。' },
    chuo: { name: '中央高地の気候', segs: [{ t: '中央' }, { t: '高地' }, { t: 'の' }, { t: '気候' }], hint: '山に{囲|かこ}まれていて、1年を通して雨が少ない。夏と冬の気温の差が大きい。' },
    setouchi: { name: '瀬戸内の気候', segs: [{ t: '瀬戸内', r: 'せとうち' }, { t: 'の' }, { t: '気候' }], hint: '中国山地と四国山地にはさまれ、1年を通して雨が少なく、あたたかい。' },
    nansei: { name: '南西諸島の気候', segs: [{ t: '南西' }, { t: '諸島', r: 'しょとう' }, { t: 'の' }, { t: '気候' }], hint: '1年中あたたかく、雨が多い。冬でも気温が15℃くらいある。' },
  };
  const JP_ST = [
    ['札幌', 1, 'hokkaido', '札幌:さっぽろ'], ['金沢', 1, 'nihonkai', '金沢:かなざわ'], ['東京', 1, 'taiheiyo', '東京'], ['松本', 1, 'chuo', '松本'], ['高松', 1, 'setouchi', '高松'], ['那覇', 1, 'nansei', '那覇:なは!'],
    ['旭川', 2, 'hokkaido', '旭川:あさひかわ'], ['新潟', 2, 'nihonkai', '新潟:にいがた'], ['高知', 2, 'taiheiyo', '高知'], ['長野', 2, 'chuo', '長野'], ['岡山', 2, 'setouchi', '岡山'], ['名瀬', 2, 'nansei', '奄美:あまみ!/(/名瀬:なぜ!/)'],
    ['釧路', 3, 'hokkaido', '釧路:くしろ'], ['網走', 3, 'hokkaido', '網走:あばしり!'], ['秋田', 3, 'nihonkai', '秋田'], ['鳥取', 3, 'nihonkai', '鳥取'], ['高田', 3, 'nihonkai', '上越:じょうえつ/(/高田/)'],
    ['鹿児島', 3, 'taiheiyo', '鹿児島'], ['宮崎', 3, 'taiheiyo', '宮崎'], ['軽井沢', 3, 'chuo', '軽井沢:かるいざわ'], ['広島', 3, 'setouchi', '広島'], ['石垣島', 3, 'nansei', '石垣島:いしがきじま'],
  ];
  const climate = JP_ST.map(([st, lv, type, label]) => {
    const j = jma[st], c = cities[st];
    if (!j || j.temp.length !== 12 || j.prec.length !== 12) fail('平年値なし ' + st);
    const p = P(c.coord);
    return { id: 'jp-climate-' + st, cat: 'climate', lv, key: type, segs: parseSegs(label), city: label.replace(/:[^/]*/g, '').replace(/\//g, ''), x: f1(p[0]), y: f1(p[1]), temp: j.temp, prec: j.prec, src: '気象庁 平年値(1991〜2020年) ' + j.title.split('　')[0], region: regionOf([prefOfCity(st)]) };
  });
  // 気候の性質を平年値で検算(教科書の説明と合っているか)
  for (const c of climate) {
    const ann = c.prec.reduce((a, b) => a + b), win = c.prec[11] + c.prec[0] + c.prec[1], sum = c.prec[5] + c.prec[6] + c.prec[7];
    const range = Math.max(...c.temp) - Math.min(...c.temp);
    const ok = {
      hokkaido: Math.min(...c.temp) < -2 && ann < 1300,
      nihonkai: win / ann > 0.18 && ann > 1700,
      taiheiyo: sum > win * 2 && c.temp[0] > 3,
      chuo: ann < 1300 && range > 23,
      setouchi: ann < 1600 && win / ann < 0.15 && c.temp[0] > 3,
      nansei: c.temp[0] > 14,
    }[c.key];
    if (!ok) fail('気候の検算に合わない ' + c.city + ' ' + c.key);
  }
  for (const t of Object.values(JP_CLIMATE)) checkRuby(t.hint, t.name);
  // 都道府県(形パズル)と県庁所在地
  const capJ = readJSON(R('capitals-jp.json'));
  const prefFeats = topojson.feature(topo, obj).features;
  const prefItems = [], capItems = [];
  for (const l of fs.readFileSync(D('prefs.txt'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'))) {
    const t = l.split('|'), [pn, py, cn, cy] = t, [ph, ch] = splitOutside(t.slice(4).join('|'));
    const short = pn === '北海道' ? pn : pn.replace(/[都府県]$/, '');
    const f = prefFeats.find(f => f.properties.name === pn);
    if (!f) { fail('県の形なし ' + pn); continue; }
    const slot = SHAPES.slotPoint(f.geometry);
    const region = regionOf([short]);
    prefItems.push({ id: 'jp-pref-' + pn, cat: 'pref', lv: 1, segs: [{ t: pn, r: py }], title: pn, region, hint: ph, x: f1(slot[0]), y: f1(slot[1]), ...withArea(SHAPES.piece(f.geometry)) });
    const c = capJ[short]; if (!c || !c.coord) { fail('県庁所在地の位置なし ' + pn); continue; }
    const p = P(c.coord);
    capItems.push({ id: 'jp-capital-' + cn, cat: 'capital', lv: 1, segs: [{ t: cn, r: cy }], title: cn, pref: pn, region, hint: ch, x: f1(p[0]), y: f1(p[1]) });
    checkRuby(ph, pn); checkRuby(ch, cn);
    // 県庁所在地が、その県の形の中にあるか(地図の形はかんたんにしてあるので、海岸の市は少し外に出ることがある)
  }
  if (prefItems.length !== 47 || capItems.length !== 47) fail('都道府県の数が47でない ' + prefItems.length + '/' + capItems.length);

  // 名産(生産量1位)。番号は1位の都道府県の中。同じ県に2つ以上あるときは、県の中で少しずらす
  const SRC = {
    F: '農林水産省「令和7年産 果樹生産出荷統計」', V: '農林水産省「令和6年産 野菜生産出荷統計」', R: '北陸農政局・北海道農政事務所「令和7年産水稲の収穫量」(主食用)', T: '農林水産省「畜産統計」(令和8年2月1日現在)',
  };
  const YEAR = { F: '令和7年産', V: '令和6年産', R: '令和7年産', T: '令和8年2月1日現在' };
  const prodLines = fs.readFileSync(D('products.txt'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('|'));
  const prodCount = {};
  prodLines.forEach(([, , pref]) => prodCount[pref] = (prodCount[pref] || 0) + 1);
  const prodSeen = {};
  const products = [];
  for (const [lv, name, pref, what, share, second, src] of prodLines) {
    const full = pref === '北海道' ? pref : pref === '東京' ? '東京都' : ['京都', '大阪'].includes(pref) ? pref + '府' : pref + '県';
    const f = prefFeats.find(f => f.properties.name === full);
    if (!f) { fail('名産の県がない ' + pref); continue; }
    if (!SRC[src]) fail('出典キー不明 ' + name);
    const clue = PREF_CLUE[pref];
    if (!clue) fail('県の手がかりなし ' + pref);
    const k = prodSeen[pref] = (prodSeen[pref] || 0) + 1, n = prodCount[pref];
    let [x, y] = SHAPES.slotPoint(f.geometry);
    if (n > 1) { const a = (k - 1) / n * Math.PI * 2 - Math.PI / 2, rr = pref === '北海道' ? 40 : 11; x += Math.cos(a) * rr; y += Math.sin(a) * rr; }
    const segs = parseSegs(name);
    const whatR = what.replace('収穫量', '{収穫量|しゅうかくりょう}').replace('飼', '{飼|か}');
    const amount = share === '-' ? (pref === '沖縄' ? '国の{調査|ちょうさ}の{対象|たいしょう}は沖縄県だけ' : '') : `全国の${whatR}の${share}%`;
    const hint = `${clue}。${amount}(${YEAR[src]})。${second === '-' ? '' : '2位は' + second + '。'}`;
    if (+lv === 1) checkRuby(hint, name);
    products.push({ id: 'jp-product-' + name.replace(/:[^/]*/g, '').replace(/\//g, ''), cat: 'product', lv: +lv, key: pref, segs, title: full, pref: full, region: regionOf([pref]), hint, src: SRC[src], x: f1(x), y: f1(y) });
  }

  // プレートと境目(PB2002)。日本付近だけを描く
  const inJ = c => c[0] > 121 && c[0] < 150 && c[1] > 22 && c[1] < 48;
  const plateLines = [];
  for (const f of PB_B) {
    if (grp(f.properties.PlateA) === grp(f.properties.PlateB)) continue;
    for (const l of linesOf(f.geometry)) {
      let cur = [], prevIn = null;
      for (const c of l) {
        if (!inJ(c)) { if (cur.length > 1) plateLines.push(cur); cur = []; prevIn = null; continue; }
        const ins = isInset(c), p = P(c);
        // 南西諸島の囲みの線は囲みの中だけ、ふつうの地図の線は囲みの外だけに描く
        const inBox = p[0] >= inset.x && p[0] <= inset.x + inset.w && p[1] >= inset.y && p[1] <= inset.y + inset.h;
        if (ins !== inBox) { if (cur.length > 1) plateLines.push(cur); cur = []; prevIn = null; continue; }
        if (prevIn !== null && ins !== prevIn) { if (cur.length > 1) plateLines.push(cur); cur = []; }
        cur.push(p); prevIn = ins;
      }
      if (cur.length > 1) plateLines.push(cur);
    }
  }
  const plates = [];
  for (const [lv, label, code, ll, hint] of JP_PLATES) {
    if (plateOf(ll) !== code) fail(`プレートの位置が ${code} の中にない ${label} ${plateOf(ll)}`);
    const p = P(ll);
    plates.push({ id: 'jp-plate-' + label.replace(/:[^/]*/g, '').replace(/\//g, ''), cat: 'plate', lv, segs: parseSegs(label), title: label, region: '', hint, x: f1(p[0]), y: f1(p[1]) });
  }
  for (const [lv, label, a, b, test, hint] of JP_BOUNDS) {
    const ll = midOnBoundary(boundaryPts(a, b, test));
    if (!ll) { fail('境目の点なし ' + label); continue; }
    const p = P(ll);
    plates.push({ id: 'jp-plate-' + label.replace(/:[^/]*/g, '').replace(/\//g, ''), cat: 'plate', lv, segs: parseSegs(label), title: label, region: '', hint, x: f1(p[0]), y: f1(p[1]) });
  }
  plates.forEach(i => { if (i.lv === 1) checkRuby(i.hint, i.title); i.region = '日本の近く'; });
  return { w: W, h: H, inset, land, borders, prefs: prefShapes, lakes, plateLines: lineD(plateLines.map(l => simplifyLine(l, 0.4))), items: prefItems.concat(capItems, out, climate, products, plates), climateTypes: JP_CLIMATE };
}
// 名産の「とくちょう」ヒントで使う、県の場所の手がかり(県名は出さない)
const PREF_CLUE = {
  北海道: '日本のいちばん北にある', 青森: '本州のいちばん北にある', 山形: '東北地方の日本海側。{最上川|もがみがわ}が流れる', 新潟: '中部地方の日本海側。{信濃川|しなのがわ}が流れる',
  栃木: '関東地方の北部。海に面していない', 茨城: '関東地方の北東部。太平洋に面している', 群馬: '関東地方の北西部。海に面していない', 埼玉: '関東地方。東京都の北どなり',
  千葉: '関東地方。太平洋と東京{湾|わん}にはさまれた半島がある', 長野: '中部地方の内陸。高い山にかこまれている', 山梨: '{富士山|ふじさん}の北側。{盆地|ぼんち}がある', 愛知: '中部地方の太平洋側。名古屋市がある',
  和歌山: '{紀伊|きい}半島の西側', 高知: '四国の南側。太平洋に面している', 愛媛: '四国の北西部。{瀬戸内海|せとないかい}に面している', 熊本: '九州の中央部。{阿蘇山|あそさん}がある',
  宮崎: '九州の南東部。太平洋に面している', 鹿児島: '九州のいちばん南にある', 沖縄: '日本のいちばん南西にある',
};

// ======================================================================
// プレート(Peter Bird「PB2002」(2003)。ODC-BY。fraxen/tectonicplates のGeoJSON)
// 教科書の大きなプレートにまとめる(小さなプレートは、となりの大きなプレートに入れる)
// ======================================================================
const PB_B = readJSON(R('raw/PB2002_boundaries.json')).features;
const PB_P = readJSON(R('raw/PB2002_plates.json')).features.map(f => fixWinding(f));
const PLATE_GROUP = {
  EU: 'EU', AM: 'EU', YA: 'EU', SU: 'EU', ON: 'EU', BU: 'EU', AS: 'EU', AT: 'EU', MS: 'EU',
  NA: 'NA', OK: 'NA', PA: 'PA', KE: 'PA', TO: 'PA', NI: 'PA', FT: 'PA', CR: 'PA', BR: 'PA', NB: 'PA', MN: 'PA', CL: 'PA',
  PS: 'PS', MA: 'PS', AU: 'IA', IN: 'IA', TI: 'IA', BS: 'IA', BH: 'IA', MO: 'IA', WL: 'IA', SB: 'IA', SS: 'IA', NH: 'IA',
  AF: 'AF', SO: 'AF', SA: 'SA', AP: 'SA', ND: 'SA', SC: 'SC', SL: 'SC', SW: 'SC', NZ: 'NZ', EA: 'NZ', JZ: 'NZ', GP: 'NZ',
  CO: 'CO', RI: 'CO', CA: 'CA', PM: 'CA', AR: 'AR', JF: 'JF', AN: 'AN',
};
function grp(c) { if (!PLATE_GROUP[c]) fail('プレートのグループ不明 ' + c); return PLATE_GROUP[c]; }
// d3 は外周が時計回りの多角形を「内側」とみなす。逆向きなら裏返す
function fixWinding(f) {
  if (d3.geoArea(f) <= 2 * Math.PI) return f;
  const rev = poly => poly.map(r => r.slice().reverse());
  const g = f.geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: rev(f.geometry.coordinates) } : { type: 'MultiPolygon', coordinates: f.geometry.coordinates.map(rev) };
  return { type: 'Feature', properties: f.properties, geometry: g };
}
function linesOf(g) { return g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; }
const plateOf = ll => (PB_P.find(f => d3.geoContains(f, ll)) || { properties: {} }).properties.Code;
// 2つのプレート(のグループ)の境目の点のうち、条件に合うもの
function boundaryPts(a, b, test) {
  const pts = [];
  for (const f of PB_B) {
    const A = f.properties.PlateA, B = f.properties.PlateB;
    if (!((a.includes(A) && b.includes(B)) || (a.includes(B) && b.includes(A)))) continue;
    for (const l of linesOf(f.geometry)) for (const c of l) if (test(c)) pts.push(c);
  }
  return pts;
}
// 点の重心にいちばん近い、境目の上の点
function midOnBoundary(pts) {
  if (!pts.length) return null;
  const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  return pts.reduce((b, p) => km(p, c) < km(b, c) ? p : b);
}
// 日本付近のプレート: [レベル, 名前, PB2002のコード(位置の検算用), 番号の位置(経度,緯度), ヒント]
// 東北・北海道は教科書では北アメリカプレート(PB2002ではオホーツクプレート OK として分けている)、西日本はユーラシアプレート(同じくアムールプレート AM)
const JP_PLATES = [
  [1, '北:きた/アメリカ/プレート', 'OK', [141.2, 40.0], '東北地方や北海道がのっている。東日本の下にある。'],
  [1, 'ユーラシア/プレート', 'AM', [133.5, 35.0], '西日本や、ユーラシア大陸がのっている。'],
  [1, '太平洋:たいへいよう/プレート', 'PA', [146.5, 37.0], '太平洋の下にある大きなプレート。東から日本の下にしずみこんでいる。'],
  [1, 'フィリピン/海:かい/プレート', 'PS', [136.5, 31.2], '日本の南の海にある。南から西日本の下にしずみこんでいる。'],
];
// 海溝・トラフ・構造線: [レベル, 名前, プレートA, プレートB, 範囲, ヒント]
const JP_BOUNDS = [
  [2, '日本:にほん/海溝:かいこう', ['PA'], ['OK'], c => c[1] > 35.5 && c[1] < 40.5, '東北地方の東の海の、とても深いみぞ。太平洋プレートがしずみこむところ。'],
  [2, '千島:ちしま/海溝:かいこう', ['PA'], ['OK'], c => c[1] > 40.9 && c[1] < 44 && c[0] > 144.5, '北海道の東の海の、深いみぞ。'],
  [2, '伊豆:いず/・/小笠原:おがさわら/海溝:かいこう', ['PA'], ['PS'], c => c[1] > 30.5 && c[1] < 34, '関東地方の南の海を、南北にのびる深いみぞ。'],
  [2, '南海:なんかい/トラフ', ['PS'], ['AM'], c => c[0] > 132.8 && c[0] < 138.6, '四国や紀伊半島の南の海の、ゆるやかなみぞ。大きな地震がくり返し起きている。'],
  [3, '相模:さがみ/トラフ', ['PS'], ['OK'], c => c[0] > 139.2 && c[0] < 141.5, '関東地方の南の海。1923年の関東大震災はこのあたりで起きた。'],
  [3, '南西:なんせい/諸島:しょとう/海溝:かいこう', ['PS'], ['ON'], c => c[1] > 24.5 && c[1] < 30.5, '沖縄など南西諸島の南東の海の、深いみぞ。琉球海溝ともいう。'],
  [3, '糸魚川:いといがわ/-/静岡:しずおか/構造線:こうぞうせん', ['OK'], ['AM'], c => c[1] > 35.0 && c[1] < 37.1, '本州の中央をたてに横切る大きな断層。北アメリカプレートとユーラシアプレートの境目と考えられている(いろいろな説がある)。'],
];
const JP_FIX = {
  赤石山脈: [138.183, 35.574],   // 塩見岳(山脈の中ほど)。元の座標は木曽山脈とほぼ重なっていた
  木曽山脈: [137.804, 35.789],   // 木曽駒ヶ岳
  越後山脈: [139.23, 37.34],     // 浅草岳(新潟・福島県境)。元の座標は広い意味の範囲の北端(山形県)だった
  丹波高地: [135.55, 35.25],     // 京都府中部。元の座標は琵琶湖のすぐ西で、鈴鹿山脈と重なっていた
  中国山地: [133.2, 35.07],      // 道後山付近(鳥取・岡山・広島の県境)。元は日本海の海岸寄り
  関東平野: [139.6, 36.05],      // 平野の中ほど(埼玉県東部)。元は茨城県の海寄り
  積丹半島: [140.45, 43.28],     // 元は地図の海岸線の外に出ていた
};
function parseSegs(label) {
  return label.split('/').map(s => { const [t, y] = s.split(':'); return y ? { t, r: y.replace('!', '') } : { t }; });
}
const PREF_REGION = {
  北海道: ['北海道'], 東北: ['青森', '岩手', '宮城', '秋田', '山形', '福島'], 関東: ['茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川'],
  中部: ['新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知'], 近畿: ['三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山'],
  中国: ['鳥取', '島根', '岡山', '広島', '山口'], 四国: ['徳島', '香川', '愛媛', '高知'], 九州: ['福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'],
};
function regionOf(prefs) {
  const rs = [];
  for (const p of prefs) { const r = Object.keys(PREF_REGION).find(k => PREF_REGION[k].includes(p)); if (!r) fail('地方不明 ' + p); else if (!rs.includes(r)) rs.push(r); }
  return rs.map(r => r === '北海道' ? '北海道' : r + '地方').join('・');
}
function prefOfCity(st) {
  return { 札幌: '北海道', 旭川: '北海道', 釧路: '北海道', 網走: '北海道', 金沢: '石川', 新潟: '新潟', 秋田: '秋田', 鳥取: '鳥取', 高田: '新潟', 東京: '東京', 高知: '高知', 鹿児島: '鹿児島', 宮崎: '宮崎', 松本: '長野', 長野: '長野', 軽井沢: '長野', 高松: '香川', 岡山: '岡山', 広島: '広島', 那覇: '沖縄', 名瀬: '鹿児島', 石垣島: '沖縄' }[st];
}

// ======================================================================
// 世界編
// ======================================================================
function buildWorld() {
  const W = 2000;
  const proj = d3.geoNaturalEarth1().rotate([-150, 0]);
  proj.fitWidth(W, { type: 'Sphere' });
  const H = Math.ceil(d3.geoPath(proj).bounds({ type: 'Sphere' })[1][1]);
  const gp = d3.geoPath(proj).digits(1);
  // 地球上で簡略化してから投影する
  const sphTopo = (fc, minW) => { const t = topojsonServer.topology({ f: fc }, 1e6); return topojsonSimplify.simplify(topojsonSimplify.presimplify(t, topojsonSimplify.sphericalTriangleArea), minW); };
  const landT = sphTopo(readJSON(R('raw/ne_50m_land.geojson')), 2e-6);
  const land = gp(topojson.feature(landT, landT.objects.f));
  const countries = readJSON(R('raw/countries-50m.json'));
  const cT = topojsonSimplify.simplify(topojsonSimplify.presimplify(countries, topojsonSimplify.sphericalTriangleArea), 2e-6);
  const borders = gp(topojson.mesh(cT, cT.objects.countries, (a, b) => a !== b));
  const sphere = gp({ type: 'Sphere' });
  const grat = gp(d3.geoGraticule10());
  const equator = gp({ type: 'LineString', coordinates: [[-180, 0], [-90, 0], [0, 0], [90, 0], [180, 0]] });

  const regions = readJSON(R('raw/ne_10m_geography_regions_polys.geojson')).features;
  const rivers = readJSON(R('raw/ne_10m_rivers_lake_centerlines.geojson')).features;
  const RIVER_NE = {
    'ナイル川': ['Nile', 'Bahr el Jebel', 'El Bahr el Abyad'], 'アマゾン川': ['Amazonas'], '長江': ['Chang Jiang', 'Yangtze', 'Jinsha'], '黄河': ['Huang'],
    'ミシシッピ川': ['Mississippi'], 'ガンジス川': ['Ganges'], 'ライン川': ['Rhein', 'Rhine', 'Rhin'], 'ドナウ川': ['Danube', 'Donau'], 'ヴォルガ川': ['Volga'],
    'インダス川': ['Indus'], 'メコン川': ['Mekong', 'Lancang'], 'コンゴ川': ['Congo', 'Lualaba'], 'ニジェール川': ['Niger'], 'オビ川': ['Ob'], 'エニセイ川': ['Yenisey'],
    'レナ川': ['Lena'], 'ラプラタ川': ['Paraná'], 'ユーフラテス川': ['Euphrates'], 'セーヌ川': ['Seine'], 'テムズ川': ['Thames'], 'エルベ川': ['Elbe'],
    'ドニエプル川': ['Dnipro', 'Dnepre'], 'アムール川': ['Amur', 'Heilong Jiang'], 'チャオプラヤ川': ['Chao Phraya'], 'エーヤワディー川': ['Ayeyarwady', 'Irrawaddy Delta'],
    'ザンベジ川': ['Zambezi'], 'マッケンジー川': ['Mackenzie'], 'コロラド川': ['Colorado'], 'セントローレンス川': ['St. Lawrence'], 'オリノコ川': ['Orinoco'], 'マレー川': ['Murray'],
  };
  // 番号の位置を手で決めるもの(理由つき)
  const SLOT = {
    '大西洋': [-40, 25],      // 太平洋中心の地図では大西洋が左右に分かれる。北アメリカ側(右)の北大西洋に置く
    '太平洋': [-150, 10],     // 赤道の少し北、地図のまん中
    'インド洋': [78, -22],
    'ユーラシア': [90, 52], '北アメリカ': [-100, 45], '南アメリカ': [-60, -12], 'アフリカ': [20, 5], 'オーストラリア大陸': [134, -25], '南極大陸': [80, -78],
    'ラプラタ川': [-57.6, -35.0], // 河口の三角江
  };
  const items = readItems('items-world.txt', 'world');
  const out = [];
  for (const it of items) {
    const w = wiki[it.title];
    if (!w || w.missing) { fail('記事なし ' + it.title); continue; }
    const ll = SLOT[w.title] || SLOT[it.title] || w.wd || w.coord;
    if (!ll) { fail('座標なし ' + it.title); continue; }
    const o = { id: 'w-' + it.cat + '-' + it.name, cat: it.cat, lv: it.lv, segs: it.segs, title: w.title, region: it.where.join('・'), hint: HINT[it.title] };
    if (!o.hint) fail('ヒントなし ' + it.title);
    if (it.lv === 1) checkRuby(o.hint, it.name);
    let slot = proj(ll);
    if (it.cat === 'river') {
      const names = RIVER_NE[it.title] || [];
      const segs = rivers.filter(f => names.includes(f.properties.name) && coordsOf(f.geometry).some(c => km(c, w.wd || w.coord) < 2500));
      if (!segs.length) { fail('川の形なし ' + it.title); continue; }
      const lines = [];
      for (const f of segs) for (const l of (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)) lines.push(simplifyLine(l.map(c => proj(c)), 0.5));
      o.d = lineD(lines);
      if (!SLOT[it.title]) {
        const pts = lines.flat(), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        slot = pts.reduce((b, p) => Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? p : b);
      }
    } else if (it.cat !== 'cont') {
      const poly = regions.find(f => f.properties.WIKIDATAID === w.qid && /Range|Plain|Pen|Lowland|Basin|Geoarea|Plateau/.test(f.properties.FEATURECLA));
      if (poly) {
        const t = sphTopo({ type: 'FeatureCollection', features: [poly] }, 1e-6);
        o.area = gp(topojson.feature(t, t.objects.f));
        const pp = projectGeom(poly.geometry, c => proj(c));
        const rings = pp.type === 'Polygon' ? pp.coordinates : pp.coordinates.flat();
        if (!pointInPoly(slot, rings)) slot = insidePoint(rings, slot);
      }
    }
    o.x = f1(slot[0]); o.y = f1(slot[1]);
    out.push(o);
  }

  // 気候(ケッペン)。L1は5つの気候帯、L2/L3は気候区
  const WC = {
    A: { name: '熱帯', segs: [{ t: '熱帯', r: 'ねったい' }], hint: '1年中気温が高い。いちばん寒い月でも18℃以上。' },
    B: { name: '乾燥帯', segs: [{ t: '乾燥帯', r: 'かんそうたい' }], hint: '雨がとても少なく、木がほとんど育たない。' },
    C: { name: '温帯', segs: [{ t: '温帯', r: 'おんたい' }], hint: '四季がはっきりしていて、冬もそれほど寒くない。日本の多くの{地域|ちいき}もこの気候帯。' },
    D: { name: '冷帯(亜寒帯)', segs: [{ t: '冷帯', r: 'れいたい' }], hint: '冬の寒さがきびしく、夏は短い。タイガとよばれる{針葉樹|しんようじゅ}の森が広がる。' },
    E: { name: '寒帯', segs: [{ t: '寒帯', r: 'かんたい' }], hint: '1年中とても寒い。いちばん{暖|あたた}かい月でも10℃未満。' },
    Af: { name: '熱帯雨林気候', hint: '1年中気温が高く、雨が多い。スコールがあり、熱帯雨林が広がる。赤道の近く。' },
    Aw: { name: 'サバナ気候', hint: '1年中気温が高く、雨季と乾季がある。草原にまばらに木が生える。' },
    BW: { name: '砂漠気候', hint: '雨がほとんど降らない。昼と夜の気温の差が大きい。' },
    BS: { name: 'ステップ気候', hint: '雨が少ないが、短い雨季がある。たけの短い草原(ステップ)が広がる。' },
    Cs: { name: '地中海性気候', hint: '夏は乾燥し、冬に雨が降る。オリーブやぶどうの栽培がさかん。' },
    Cfa: { name: '温暖湿潤気候', hint: '四季があり、夏は暑く雨が多い。日本の多くの地域もこの気候。' },
    Cfb: { name: '西岸海洋性気候', hint: '夏はすずしく、冬もあまり寒くない。1年を通して雨が降る。偏西風と暖流の影響を受ける。' },
    Cw: { name: '温暖冬季少雨気候', hint: '夏は雨が多く、冬は雨が少ない。季節風(モンスーン)の影響を受ける。' },
    Df: { name: '冷帯湿潤気候', hint: '冬は寒さがきびしく、1年を通して雨や雪が降る。' },
    Dw: { name: '冷帯冬季少雨気候', hint: '冬は寒さがとてもきびしく、雪や雨が少ない。夏に雨が降る。' },
    ET: { name: 'ツンドラ気候', hint: '短い夏にだけ氷がとけ、こけ類などが生える。いちばん暖かい月でも10℃未満。' },
    EF: { name: '氷雪気候', hint: '1年中氷と雪におおわれている。いちばん暖かい月でも0℃未満。' },
  };
  // シンガポールとクアラルンプール、ロンドンとパリは地図上で番号が重なるので、高校生レベルでも片方だけにする
  const WC_ST = [
    ['シンガポール', 1, 'A'], ['カイロ', 1, 'B'], ['パリ', 1, 'C'], ['モスクワ', 1, 'D'], ['ロングイェールビーン', 1, 'E'],
    ['シンガポール', 2, 'Af'], ['バンコク', 2, 'Aw'], ['カイロ', 2, 'BW'], ['ニアメ', 2, 'BS'], ['ローマ', 2, 'Cs'], ['シャンハイ', 2, 'Cfa'], ['ロンドン', 2, 'Cfb'],
    ['モスクワ', 2, 'Df'], ['イルクーツク', 2, 'Dw'], ['ロングイェールビーン', 2, 'ET'], ['南極点', 2, 'EF'],
    ['ブラジリア', 3, 'Aw'], ['コルカタ', 3, 'Aw'], ['リヤド', 3, 'BW'], ['テヘラン', 3, 'BS'], ['ケープタウン', 3, 'Cs'], ['ブエノスアイレス', 3, 'Cfa'],
    ['ホンコン', 3, 'Cw'], ['ハルビン', 3, 'Dw'],
  ];
  const CITY_YOMI = { シャンハイ: '上海:シャンハイ', ホンコン: '香港:ホンコン', 南極点: '南極点:なんきょくてん' };
  const climate = [];
  for (const [st, lv, key] of WC_ST) {
    const d = climateWorld[st], c = cities[st];
    if (!d || !d.temp || !c) { fail('気候データなし ' + st); continue; }
    const south = c.coord[1] < 0;
    const k = koppen(d.temp, d.prec, south);
    const want = key.length === 1 ? k[0] === key : key === 'BW' || key === 'BS' ? k === key : key === 'Cw' ? k.startsWith('Cw') : key === 'Df' || key === 'Dw' ? k.startsWith(key) : key === 'Cs' ? k.startsWith('Cs') : key === 'Af' ? k === 'Af' : k === key || k.startsWith(key);
    if (!want) fail('ケッペンの検算に合わない ' + st + ' 期待' + key + ' 計算' + k);
    // L2以上の「冷帯湿潤」は Df、「温暖湿潤」は Cfa のみ(Cfb は西岸海洋性)
    if (key === 'Cfa' && k !== 'Cfa') fail('Cfaでない ' + st + ' ' + k);
    if (key === 'Cfb' && !/^Cf[bc]$/.test(k)) fail('Cfbでない ' + st + ' ' + k);
    const p = proj(c.coord.map((v, i) => i === 1 ? Math.max(v, -85) : v));
    climate.push({ id: 'w-climate-' + st + '-' + lv, cat: 'climate', lv, key, koppen: k, segs: parseSegs(CITY_YOMI[st] || st), city: st, x: f1(p[0]), y: f1(p[1]), temp: d.temp, prec: d.prec, south, src: '英語版Wikipedia「' + d.page.replace('Template:', '') + '」の気候表', region: '' });
  }
  for (const t of ['A', 'B', 'C', 'D', 'E']) checkRuby(WC[t].hint, WC[t].name);
  // 世界の国(形パズル)
  const master = require('../research/countries-master.js');
  const REG = { asia: 'アジア', europe: 'ヨーロッパ', africa: 'アフリカ', namerica: '北アメリカ', samerica: '南アメリカ', oceania: 'オセアニア' };
  const cFeats = topojson.feature(cT, cT.objects.countries).features;
  const countryItems = [];
  for (const l of fs.readFileSync(D('countries.txt'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'))) {
    const t = l.split('|'), lv = +t[0], iso = t[1], hint = t.slice(2).join('|');
    const m = master.find(r => r[0] === iso);
    const f = m && cFeats.find(f => +f.id === +m[1]);
    if (!f) { fail('国の形なし ' + iso); continue; }
    const pg = projectGeom(f.geometry, c => proj(c));
    const slot = SHAPES.slotPoint(pg);
    countryItems.push({ id: 'w-country-' + iso, cat: 'country', lv, segs: [{ t: m[2] }], title: m[2], region: REG[m[5]], hint, x: f1(slot[0]), y: f1(slot[1]), ...withArea(SHAPES.piece(pg)) });
    if (lv === 1) checkRuby(hint, m[2]);
  }
  // プレート(PB2002を教科書の大きなプレートにまとめる)。はめると、そのプレートの範囲に色がつく
  const pT = sphTopo({ type: 'FeatureCollection', features: PB_P.map(f => ({ type: 'Feature', properties: { g: grp(f.properties.Code) }, geometry: f.geometry })) }, 1e-7);
  const groupGeom = g => fixWinding({ type: 'Feature', properties: {}, geometry: topojson.merge(pT, pT.objects.f.geometries.filter(o => o.properties.g === g)) });
  const wLines = [];
  for (const f of PB_B) {
    const A = f.properties.PlateA, B = f.properties.PlateB;
    const riftAfrica = [A, B].sort().join() === 'AF,SO'; // 東アフリカ大地溝帯も線で見せる
    if (grp(A) === grp(B) && !riftAfrica) continue;
    linesOf(f.geometry).forEach(l => wLines.push(l));
  }
  const plateLines = gp({ type: 'MultiLineString', coordinates: wLines });
  const plates = [];
  for (const [lv, label, g, ll, hint] of W_PLATES) {
    const geom = groupGeom(g);
    if (!d3.geoContains(geom, ll)) fail('プレートの位置が範囲の外 ' + label);
    const p = proj(ll);
    plates.push({ id: 'w-plate-' + g, cat: 'plate', lv, segs: parseSegs(label), title: label, region: W_PLATE_REGION[g], hint, area: gp(geom), x: f1(p[0]), y: f1(p[1]) });
  }
  for (const [lv, label, a, b, test, region, hint] of W_BOUNDS) {
    const ll = midOnBoundary(boundaryPts(a, b, test));
    if (!ll) { fail('境目の点なし ' + label); continue; }
    const p = proj(ll);
    plates.push({ id: 'w-plate-' + label.replace(/:[^/]*/g, '').replace(/\//g, ''), cat: 'plate', lv, segs: parseSegs(label), title: label, region, hint, x: f1(p[0]), y: f1(p[1]) });
  }
  plates.forEach(i => { if (i.lv === 1) checkRuby(i.hint, i.title); });
  return { w: W, h: H, sphere, grat, equator, land, borders, plateLines, items: countryItems.concat(out, climate, plates), climateTypes: WC };
}
// 世界のプレート: [レベル, 名前, グループ, 番号の位置(経度,緯度), ヒント]
const W_PLATES = [
  [1, 'ユーラシア/プレート', 'EU', [90, 52], 'ヨーロッパとアジアの大部分がのっている、大きなプレート。西日本もこのプレートの上。'],
  [1, '北:きた/アメリカ/プレート', 'NA', [-100, 50], '北アメリカ大陸と、大西洋の北西部がのっている。東日本もこのプレートの上。'],
  [1, '南:みなみ/アメリカ/プレート', 'SA', [-58, -12], '南アメリカ大陸と、大西洋の南西部がのっている。'],
  [1, 'アフリカ/プレート', 'AF', [18, 5], 'アフリカ大陸がのっている。'],
  [1, '太平洋:たいへいよう/プレート', 'PA', [-160, 5], 'いちばん大きなプレート。ほとんどが海の底。'],
  [1, 'インド・オーストラリア/プレート', 'IA', [132, -25], 'オーストラリア大陸とインドがのっている。インドとオーストラリアを別のプレートに分けることもある。'],
  [1, '南極:なんきょく/プレート', 'AN', [100, -78], '南極大陸と、そのまわりの海がのっている。'],
  [2, 'ナスカ/プレート', 'NZ', [-90, -20], '南アメリカの西の太平洋の下。南アメリカプレートの下にしずみこみ、アンデス山脈ができた。'],
  [2, 'フィリピン/海:かい/プレート', 'PS', [133, 20], '日本の南からフィリピンにかけての海の下。'],
  [2, 'ココス/プレート', 'CO', [-95, 8], '中央アメリカの西の太平洋の下にある、小さなプレート。'],
  [2, 'カリブ/プレート', 'CA', [-75, 15], 'カリブ海の下にある。'],
  [2, 'アラビア/プレート', 'AR', [45, 22], 'アラビア半島がのっている。'],
  [3, 'スコシア/プレート', 'SC', [-45, -57], '南アメリカの南のはしと南極のあいだの海の下。'],
  [3, 'フアン・デ・フカ/プレート', 'JF', [-128, 46], '北アメリカの西海岸の沖にある、とても小さなプレート。'],
];
const W_PLATE_REGION = { EU: 'ユーラシア大陸', NA: '北アメリカ', SA: '南アメリカ', AF: 'アフリカ', PA: '太平洋', IA: 'インド洋・オセアニア', AN: '南極', NZ: '太平洋の南東', PS: '太平洋の北西', CO: '中央アメリカの西', CA: '中央アメリカ', AR: '西アジア', SC: '南アメリカの南', JF: '北アメリカの西' };
// 世界の境目: [レベル, 名前, プレートA, プレートB, 範囲, 地域, ヒント]
const W_BOUNDS = [
  [3, '大西洋:たいせいよう/中央:ちゅうおう/海嶺:かいれい', ['AF'], ['SA'], c => c[1] > -35 && c[1] < 0, '大西洋', '大西洋のまん中を南北にのびる、海の底の山脈。プレートが左右に広がっていく境目。'],
  [3, '東:ひがし/太平洋:たいへいよう/海膨:かいぼう', ['PA'], ['NZ'], c => c[1] > -30 && c[1] < -5, '太平洋の南東', '太平洋の東の海底の、なだらかな高まり。プレートが広がっていく境目。'],
  [3, 'サンアンドレアス/断層:だんそう', ['PA'], ['NA'], c => c[1] > 34 && c[1] < 38.5 && c[0] < -117, '北アメリカの西', 'アメリカ合衆国のカリフォルニア州を通る。プレートどうしが横にずれる境目。'],
  [3, '東:ひがし/アフリカ/大地溝帯:だいちこうたい', ['AF'], ['SO'], c => c[1] > -10 && c[1] < 10 && c[0] > 30 && c[0] < 42, 'アフリカ', 'アフリカ大陸の東部を南北にのびる、大きな谷。大陸がさけていくところ。'],
  [3, 'マリアナ/海溝:かいこう', ['PA'], ['MA'], c => true, '太平洋の北西', '世界でいちばん深い海溝。深さは約1万m。'],
  [3, 'ペルー・チリ/海溝:かいこう', ['NZ'], ['SA', 'AP', 'ND'], c => c[1] > -30 && c[1] < -8, '南アメリカの西', '南アメリカの西の海の、深いみぞ。ナスカプレートがしずみこむところ。'],
];

const jp = buildJapan();
const world = buildWorld();
// 都市の大陸名(世界の気候の「ちいき」ヒント用)
const CONT = { シンガポール: 'アジア', カイロ: 'アフリカ', パリ: 'ヨーロッパ', モスクワ: 'ヨーロッパ', ロングイェールビーン: 'ヨーロッパ(北極の近く)', バンコク: 'アジア', ニアメ: 'アフリカ', ローマ: 'ヨーロッパ', シャンハイ: 'アジア', ロンドン: 'ヨーロッパ', イルクーツク: 'アジア', 南極点: '南極', クアラルンプール: 'アジア', ブラジリア: '南アメリカ', コルカタ: 'アジア', リヤド: 'アジア', テヘラン: 'アジア', ケープタウン: 'アフリカ', ブエノスアイレス: '南アメリカ', ホンコン: 'アジア', ハルビン: 'アジア' };
world.items.filter(i => i.cat === 'climate').forEach(i => i.region = CONT[i.city] || fail('大陸不明 ' + i.city));

// 同じステージに入る場所どうしが近すぎないか(番号が重なるとタップしにくい)は、アプリ側でステージを分けるときに見る
const outDir = path.join(__dirname, '../app/data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'jp.json'), JSON.stringify(jp));
fs.writeFileSync(path.join(outDir, 'world.json'), JSON.stringify(world));
const count = (d, c) => [1, 2, 3].map(l => d.items.filter(i => i.cat === c && i.lv === l).length).join('/');
for (const [n, d] of [['日本', jp], ['世界', world]]) console.log(n, ['pref', 'capital', 'country', 'cont', 'mount', 'river', 'plain', 'pen', 'climate', 'product', 'plate'].map(c => c + ' ' + count(d, c)).join('  '), (JSON.stringify(d).length / 1024).toFixed(0) + 'KB');
if (RUBY_TODO.length) console.log('\nふりがなが必要な漢字(小学生レベル):\n' + RUBY_TODO.join('\n'));
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
