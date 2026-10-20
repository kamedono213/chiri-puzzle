// 都道府県・国の「形」を扱う小道具(build-data.js から使う)。
// 投影ずみ(平面)の MultiPolygon から、ピースに描く形と、番号を置く点を作る。
const d3 = require('d3-geo');

const polysOf = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
const polyArea = p => ringArea(p[0]) - p.slice(1).reduce((s, r) => s + ringArea(r), 0);
const bboxOf = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };

// ピースの形: いちばん大きい島の 8% 以上あり、その島から(島の大きさ1つ分以内に)近いものだけ残す。
// 例: フランスから南アメリカのフランス領ギアナ、鹿児島県から南西諸島の囲みに入った奄美を外す
function pieceGeom(geom) {
  const ps = polysOf(geom).map(p => ({ p, a: polyArea(p) })).sort((a, b) => b.a - a.a);
  if (!ps.length) return null;
  const main = bboxOf(ps[0].p[0]), mw = main[2] - main[0], mh = main[3] - main[1], pad = Math.max(mw, mh);
  const keep = ps.filter(({ p, a }, i) => {
    if (i === 0) return true;
    if (a < ps[0].a * 0.08) return false;
    const b = bboxOf(p[0]);
    return b[2] > main[0] - pad && b[0] < main[2] + pad && b[3] > main[1] - pad && b[1] < main[3] + pad;
  }).map(x => x.p);
  return { type: 'MultiPolygon', coordinates: keep };
}

// 偶奇判定(穴も含む)
function pointInPoly(pt, rings) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 番号を置く点: いちばん大きい島の中で、ふちからいちばん遠い点(細長い形でも外にはみ出さない)
function slotPoint(geom) {
  const ps = polysOf(geom).map(p => ({ p, a: polyArea(p) })).sort((a, b) => b.a - a.a);
  const rings = ps[0].p, [x0, y0, x1, y1] = bboxOf(rings[0]);
  const st = Math.max(x1 - x0, y1 - y0) / 60;
  const segs = []; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) segs.push([r[j], r[i]]);
  const distSeg = (p, [a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-9; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  let best = null, bd = -1;
  for (let x = x0; x <= x1; x += st) for (let y = y0; y <= y1; y += st) {
    if (!pointInPoly([x, y], rings)) continue;
    let d = Infinity; for (const s of segs) { const v = distSeg([x, y], s); if (v < d) d = v; if (d < bd) break; }
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best || rings[0][0];
}
const pathOf = d3.geoPath().digits(1);
// ピース用: 形のパスと、その範囲(viewBox)
function piece(geom) {
  const g = pieceGeom(geom);
  const b = d3.geoPath().bounds(g);
  const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1], m = Math.max(w, h) * 0.06;
  return { d: pathOf(g), vb: [b[0][0] - m, b[0][1] - m, w + 2 * m, h + 2 * m].map(v => Math.round(v * 10) / 10) };
}
module.exports = { piece, slotPoint, pathOf };
