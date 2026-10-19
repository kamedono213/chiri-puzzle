// PWA用アイコン(PNG)を外部ライブラリなしで描く。水色の海に、クリーム色のパズルのピース(地図)と、朱色の番号の丸。
// 出力: app/icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const SEA = hex('#9fd0e6'), SEA2 = hex('#cfe8f3'), LAND = hex('#fbf3df'), EDGE = hex('#8a7a5c'), DOT = hex('#e8743b'), WHITE = hex('#ffffff'), RIVER = hex('#2f7fd1');

// ピースの形: 角の丸い正方形 + 右と下に丸い出っぱり、左と上に丸いへこみ
function inPiece(x, y) {
  const a = 0.24, b = 0.70, r = 0.06, knob = 0.085;
  const inRect = (() => {
    if (x < a || x > b || y < a || y > b) return false;
    const cx = Math.min(Math.max(x, a + r), b - r), cy = Math.min(Math.max(y, a + r), b - r);
    return Math.hypot(x - cx, y - cy) <= r;
  })();
  const m = (a + b) / 2;
  if (Math.hypot(x - (b + knob * 0.75), y - m) < knob) return true;     // 右の出っぱり
  if (Math.hypot(x - m, y - (b + knob * 0.75)) < knob) return true;     // 下の出っぱり
  if (Math.hypot(x - (a + knob * 0.25), y - m) < knob) return false;    // 左のへこみ
  if (Math.hypot(x - m, y - (a + knob * 0.25)) < knob) return false;    // 上のへこみ
  return inRect;
}
function draw(size, pad) {
  const S = 4, px = Buffer.alloc(size * size * 4);
  const sc = 1 - 2 * pad, inv = v => (v - pad) / sc;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const fx = (x + (sx + 0.5) / S) / size, fy = (y + (sy + 0.5) / S) / size;
      const u = inv(fx), v = inv(fy);
      let col = SEA.map((c, i) => c + (SEA2[i] - c) * (1 - fy));
      // ピースの影 → ふち → 中
      if (inPiece(u - 0.012, v - 0.02)) col = col.map(c => c * 0.86);
      if (inPiece(u, v)) {
        const edge = !inPiece(u + 0.012, v) || !inPiece(u - 0.012, v) || !inPiece(u, v + 0.012) || !inPiece(u, v - 0.012);
        col = edge ? EDGE : LAND;
        // 川(ゆるいS字)
        const ry = 0.40 + 0.06 * Math.sin((u - 0.24) * 11);
        if (!edge && Math.abs(v - ry) < 0.012 && u > 0.26 && u < 0.62) col = RIVER;
      }
      // 番号の丸(朱色に白いふち)
      const d = Math.hypot(u - 0.47, v - 0.56);
      if (d < 0.115) col = WHITE;
      if (d < 0.09) col = DOT;
      if (d < 0.032) col = WHITE;
      acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
    }
    const i = (y * size + x) * 4;
    px[i] = acc[0] / 16; px[i + 1] = acc[1] / 16; px[i + 2] = acc[2] / 16; px[i + 3] = 255;
  }
  return png(size, size, px);
}
const out = path.join(__dirname, '../app/icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), draw(192, 0.0));
fs.writeFileSync(path.join(out, 'icon-512.png'), draw(512, 0.0));
fs.writeFileSync(path.join(out, 'maskable-512.png'), draw(512, 0.1));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), draw(180, 0.03));
console.log('icons written');
