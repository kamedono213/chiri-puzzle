// ちりパズル: 山地・川・平野・半島・気候のカードを、白地図の正しい番号にはめるパズル。
// 地図とデータは tools/build-data.js が作った data/jp.json・data/world.json を読む。
'use strict';
const app = document.getElementById('app');
const DATA = {};

// ---------- 保存(保存できない環境でも遊べる)
const store = {
  get(k, d) { try { const v = localStorage.getItem('chiri:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('chiri:' + k, JSON.stringify(v)); } catch (e) { /* 保存できなくても遊べる */ } },
};

// ---------- 効果音(Web Audio で合成。音声ファイルは使わない)
const SE = {
  ctx: null,
  muted: store.get('muted', false),
  ac() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ctx = new C(); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, at, dur, type = 'sine', vol = 0.18, slideTo = null) {
    const c = this.ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  play(name) {
    if (this.muted) return;
    try {
      if (name === 'start') { this.tone(523, 0, 0.09, 'triangle'); this.tone(784, 0.08, 0.14, 'triangle'); }
      if (name === 'select') this.tone(660, 0, 0.06, 'triangle', 0.12);
      if (name === 'ok') { this.tone(784, 0, 0.1, 'triangle', 0.2); this.tone(1175, 0.08, 0.22, 'sine', 0.2); }
      if (name === 'ng') this.tone(220, 0, 0.3, 'square', 0.06, 150);
      if (name === 'hint') { this.tone(988, 0, 0.08, 'sine', 0.12); this.tone(1319, 0.07, 0.16, 'sine', 0.1); }
      if (name === 'clear') { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.1, 0.16, 'triangle')); [1047, 1319, 1568].forEach(f => this.tone(f, 0.42, 0.6, 'sine', 0.09)); }
    } catch (e) { /* 音が出せない環境でも遊べる */ }
  },
  toggle() { this.muted = !this.muted; store.set('muted', this.muted); if (!this.muted) this.play('select'); },
};

// ---------- 文字まわり
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let LEVEL = store.get('level', 1);
// 名前: 小学生レベルだけ、むずかしい漢字にふりがな
const nameHTML = segs => segs.map(s => s.r && LEVEL === 1 ? `<ruby>${esc(s.t)}<rt>${esc(s.r)}</rt></ruby>` : esc(s.t)).join('');
const plainName = segs => segs.map(s => s.t).join('');
// ヒント文の {漢字|よみ}
const textHTML = t => esc(t || '').replace(/\{([^|}]+)\|([^}]+)\}/g, (_, a, b) => LEVEL === 1 ? `<ruby>${a}<rt>${b}</rt></ruby>` : a);
const LEVELS = [
  { n: 1, html: '<ruby>小学生<rt>しょうがくせい</rt></ruby>', note: '教科書によく出る地名だけ。むずかしい漢字には、ふりがながつくよ。' },
  { n: 2, html: '中学生', note: '中学校の地理でならう地名まで。小学生レベルの地名もまざります。' },
  { n: 3, html: '高校生', note: '高校の地理で出てくる、くわしい地名まで。' },
];
const AREAS = {
  jp: { name: '日本', html: '日本<small>へん</small>', sub: '山地・川・平野・半島・気候' },
  world: { name: '世界', html: '世界<small>へん</small>', sub: '大陸と海・山脈・川・平野・半島・気候' },
};
const CATS = {
  cont: { html: '大陸と海', plain: '大陸と海', ic: '🌏', col: 'var(--cont)', bg: '#e1eefa' },
  mount: { html: '山地・<ruby>山脈<rt>さんみゃく</rt></ruby>', plain: '山地・山脈', ic: '⛰️', col: 'var(--mount)', bg: '#f3e6da' },
  river: { html: '川', plain: '川', ic: '🌊', col: 'var(--river)', bg: '#dceafa' },
  plain: { html: '平野', plain: '平野', ic: '🌾', col: 'var(--plain)', bg: '#e4f1dc' },
  pen: { html: '半島', plain: '半島', ic: '🏝️', col: 'var(--pen)', bg: '#ece2f5' },
  climate: { html: '気候', plain: '気候', ic: '☀️', col: 'var(--climate)', bg: '#fbe8d4' },
};
const CAT_ORDER = { jp: ['mount', 'river', 'plain', 'pen', 'climate'], world: ['cont', 'mount', 'river', 'plain', 'pen', 'climate'] };
const catLabel = (area, cat) => area === 'world' && cat === 'mount' ? '山脈' : CATS[cat].plain;
const catHTML = (area, cat) => area === 'world' && cat === 'mount' ? '<ruby>山脈<rt>さんみゃく</rt></ruby>' : CATS[cat].html;
const ruby = html => LEVEL === 1 ? html : html.replace(/<rt>.*?<\/rt>/g, '').replace(/<\/?ruby>/g, '');

// ---------- ステージ分け
function itemsFor(area, cat, L) {
  const all = DATA[area].items.filter(i => i.cat === cat);
  if (cat === 'climate' && area === 'world') return L === 1 ? all.filter(i => i.lv === 1) : all.filter(i => i.lv >= 2 && i.lv <= L);
  return all.filter(i => i.lv <= L);
}
const inInset = (area, i) => { const b = DATA[area].inset; return b && i.x >= b.x && i.x <= b.x + b.w && i.y >= b.y && i.y <= b.y + b.h; };
function stagesFor(area, cat, L) {
  const items = itemsFor(area, cat, L).slice();
  // 日本は北から南へ(南西諸島の囲みは最後)、世界は西から東へ並べ、近い場所どうしを同じステージにする
  if (area === 'jp') items.sort((a, b) => (inInset(area, a) ? 1e4 + a.y : a.y) - (inInset(area, b) ? 1e4 + b.y : b.y));
  else items.sort((a, b) => a.x - b.x);
  const n = items.length, k = Math.ceil(n / 7), out = [];
  for (let s = 0, at = 0; s < k; s++) { const size = Math.round((n - at) / (k - s)); out.push(items.slice(at, at + size)); at += size; }
  const st = out.map((its, i) => ({ key: `${area}:${L}:${cat}:${i}`, no: i + 1, items: its }));
  if (n > 7) st.push({ key: `${area}:${L}:${cat}:all`, no: 0, items });
  return st;
}
const regionsOf = items => [...new Set(items.flatMap(i => (i.region || '').split('・')).filter(Boolean))];
const best = key => store.get('best:' + key, 0);
const starsHTML = n => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span>`;

// ---------- 画面の移動(スマホの「戻る」でも1つ前へ)
const nav = [];
function go(screen, push = true) {
  if (push) { nav.push(screen); history.pushState({ d: nav.length }, ''); }
  render(screen);
}
function back() { if (nav.length > 1) history.back(); else go({ s: 'home' }, false); }
window.addEventListener('popstate', () => { if (nav.length > 1) nav.pop(); closeSheet(); render(nav[nav.length - 1] || { s: 'home' }); });
function render(sc) {
  if (sc.s === 'home') return home();
  if (sc.s === 'area') return areaPage(sc.area);
  if (sc.s === 'cat') return catPage(sc.area, sc.cat);
  if (sc.s === 'play') return play(sc.area, sc.cat, sc.key);
}
const soundBtn = () => `<button class="link" id="sound" aria-label="効果音">${SE.muted ? '🔇 音なし' : '🔊 音あり'}</button>`;
function bindSound() { const b = app.querySelector('#sound'); if (b) b.onclick = () => { SE.toggle(); b.outerHTML = soundBtn(); bindSound(); }; }
function levelsHTML() {
  return `<div class="levels" role="group" aria-label="レベル">${LEVELS.map(l => `<button data-lv="${l.n}" aria-pressed="${LEVEL === l.n}">${l.html}</button>`).join('')}</div>
  <p class="levelnote">${LEVELS[LEVEL - 1].note}</p>`;
}
function bindLevels(rerender) {
  app.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { LEVEL = +b.dataset.lv; store.set('level', LEVEL); SE.play('select'); rerender(); });
}

// ---------- ホーム
function home() {
  const jp = DATA.jp;
  const dots = jp.items.filter(i => i.lv === 1 && i.cat !== 'climate').map((i, n) => `<circle cx="${i.x}" cy="${i.y}" r="9" fill="${CATS[i.cat].col}" stroke="#fff" stroke-width="3" opacity=".9"/>`).join('');
  app.innerHTML = `<div class="page">
    <div class="top"><h1>ちりパズル</h1><span class="grow"></span>${soundBtn()}</div>
    <div class="hero"><svg viewBox="-200 -20 ${jp.w + 400} ${jp.h + 40}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="${jp.land}" fill="var(--land)" stroke="var(--land-line)" stroke-width="2"/>${dots}</svg></div>
    <p class="lead">カードを1まいえらんで、地図の正しい番号にはめていこう。ヒントは何回でもつかえるよ。</p>
    <div class="areas">${Object.entries(AREAS).map(([k, a]) => `<button class="area" data-area="${k}"><b>${a.name}へん</b><span>${a.sub}</span></button>`).join('')}</div>
    ${levelsHTML()}
    <div class="howto"><b>あそびかた</b><ol>
      <li>下のカードを1まいえらぶ</li>
      <li>地図の番号をタップして、はめる</li>
      <li>こまったら、ヒント。<b>何回つかっても、星はへらない</b>よ</li></ol></div>
    <p class="foot">地図・位置: Natural Earth, OpenStreetMap(© OpenStreetMap contributors), Wikipedia/Wikidata。気候: 気象庁の平年値(1991〜2020年)、英語版Wikipediaの気候表。レベル分けは目安です。</p>
  </div>`;
  bindSound();
  bindLevels(home);
  app.querySelectorAll('[data-area]').forEach(b => b.onclick = () => { SE.play('select'); go({ s: 'area', area: b.dataset.area }); });
}

// ---------- 編ごとの種類一覧
function areaPage(area) {
  const cats = CAT_ORDER[area].filter(c => itemsFor(area, c, LEVEL).length);
  app.innerHTML = `<div class="page">
    <div class="top"><button class="back" id="back" aria-label="もどる">←</button><h2>${AREAS[area].name}へん</h2><span class="grow"></span>${soundBtn()}</div>
    ${levelsHTML()}
    <div class="cats">${cats.map(c => {
      const st = stagesFor(area, c, LEVEL), got = st.reduce((a, s) => a + best(s.key), 0);
      return `<button class="cat" data-cat="${c}"><span class="ic" style="background:${CATS[c].bg}">${CATS[c].ic}</span>
        <span><b>${ruby(catHTML(area, c))}</b><small>${itemsFor(area, c, LEVEL).length}こ ・ ${st.length}ステージ</small></span>
        <span class="prog">★ ${got}/${st.length * 3}</span></button>`;
    }).join('')}</div>
  </div>`;
  bindSound();
  bindLevels(() => areaPage(area));
  app.querySelector('#back').onclick = back;
  app.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { SE.play('select'); go({ s: 'cat', area, cat: b.dataset.cat }); });
}

// ---------- ステージ一覧
function catPage(area, cat) {
  const st = stagesFor(area, cat, LEVEL);
  app.innerHTML = `<div class="page">
    <div class="top"><button class="back" id="back" aria-label="もどる">←</button><h2>${AREAS[area].name}の${ruby(catHTML(area, cat))}</h2></div>
    <p class="lead">${LEVELS[LEVEL - 1].html.replace(/<rt>.*?<\/rt>|<\/?ruby>/g, '')}レベル ・ ${itemsFor(area, cat, LEVEL).length}こ</p>
    <div class="stages">${st.map(s => `<button class="stage" data-key="${s.key}">
      <b>${s.no ? 'ステージ' + s.no : 'ぜんぶ'}</b>
      <small>${s.no ? esc(regionsOf(s.items).slice(0, 3).join('・')) + (regionsOf(s.items).length > 3 ? 'など' : '') : '全部まとめて'} ・ ${s.items.length}こ</small>
      ${starsHTML(best(s.key))}</button>`).join('')}</div>
  </div>`;
  app.querySelector('#back').onclick = back;
  app.querySelectorAll('[data-key]').forEach(b => b.onclick = () => go({ s: 'play', area, cat, key: b.dataset.key }));
}

// ---------- パズル
let S = null;
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const typeOf = (area, item) => DATA[area].climateTypes[item.key];
// カードの名前(気候は気候区の名前、ほかは地名)
const cardSegs = (area, item) => item.cat === 'climate' ? (typeOf(area, item).segs || [{ t: typeOf(area, item).name }]) : item.segs;
const match = (card, slot) => card.cat === 'climate' ? card.key === slot.key : card.id === slot.id;

function play(area, cat, key) {
  const stage = stagesFor(area, cat, LEVEL).find(s => s.key === key);
  if (!stage) return back();
  const D = DATA[area];
  const items = stage.items;
  const order = items.slice().sort((a, b) => hash(a.id + 'c') - hash(b.id + 'c')); // カードの並び(毎回同じ)
  S = { area, cat, key, stage, items, cards: order.map(i => i.id), placed: new Map(), sel: null, miss: 0, cand: null, ring: null, done: false };
  const W = D.w, H = D.h;
  // 番号は地図上で北西から順に
  const numbered = items.slice().sort((a, b) => (a.y + a.x * 0.3) - (b.y + b.x * 0.3));
  S.num = new Map(numbered.map((i, n) => [i.id, n + 1]));

  const isWorld = area === 'world';
  const base = isWorld
    ? `<path d="${D.sphere}" fill="var(--sea)"/><path d="${D.grat}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1" vector-effect="non-scaling-stroke"/>
       <path d="${D.equator}" fill="none" stroke="#e8743b" stroke-opacity=".5" stroke-width="1.2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>
       <path d="${D.land}" fill="var(--land)" stroke="var(--land-line)" stroke-width="1" vector-effect="non-scaling-stroke"/>
       <path d="${D.borders}" fill="none" stroke="var(--border)" stroke-width=".8" vector-effect="non-scaling-stroke"/>`
    : `<rect x="-2000" y="-2000" width="${W + 4000}" height="${H + 4000}" fill="var(--sea)"/>
       <rect x="${D.inset.x}" y="${D.inset.y}" width="${D.inset.w}" height="${D.inset.h}" fill="var(--sea2)" fill-opacity=".45" stroke="var(--land-line)" stroke-width="1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
       <path d="${D.land}" fill="var(--land)" stroke="var(--land-line)" stroke-width="1.1" vector-effect="non-scaling-stroke"/>
       <path d="${D.borders}" fill="none" stroke="var(--border)" stroke-width=".9" vector-effect="non-scaling-stroke"/>
       <path d="${D.lakes}" fill="var(--sea)" stroke="var(--land-line)" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
  const geo = items.map(i => i.d ? `<path class="riverline" data-geo="${i.id}" d="${i.d}"/>` : i.area ? `<path class="area-poly" data-geo="${i.id}" d="${i.area}" fill="${CATS[i.cat].col}" stroke="${CATS[i.cat].col}"/>` : '').join('');

  app.innerHTML = `<div class="play">
    <div class="bar"><button class="back" id="back" aria-label="もどる">←</button>
      <div class="ttl">${AREAS[area].name}の${ruby(catHTML(area, cat))}<small>${stage.no ? 'ステージ' + stage.no : 'ぜんぶ'} ・ ${LEVELS[LEVEL - 1].html.replace(/<rt>.*?<\/rt>|<\/?ruby>/g, '')}レベル</small></div>
      <span class="count" id="count"></span></div>
    <div class="mapbox" id="mapbox">
      <svg id="map"><g id="vp">${base}<g id="geo">${geo}</g><g id="rings"></g><g id="labels"></g><g id="slots"></g></g></svg>
      <div class="zoom"><button id="zin" aria-label="拡大">+</button><button id="zout" aria-label="縮小">−</button><button id="zfit" aria-label="ステージ全体を表示" style="font-size:15px">⤢</button></div>
      <div class="toast" id="toast" style="opacity:0"></div>
    </div>
    <div class="hints" id="hints">
      <button id="h-area">🗺️ ちいき</button><button id="h-feat">💡 とくちょう</button><button id="h-two">✌️ 2つにしぼる</button>
    </div>
    <div class="tray" id="tray"></div>
  </div>`;
  app.querySelector('#back').onclick = back;
  SE.play('start');

  // --- 地図の拡大縮小
  const box = app.querySelector('#mapbox'), svgEl = app.querySelector('#map');
  const svg = d3.select(svgEl), vp = svg.select('#vp');
  let k = 1;
  const size = () => { const r = box.getBoundingClientRect(); svgEl.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`); return r; };
  let rect = size();
  // 右上の拡大ボタンに番号が隠れないよう、右側を広めにあける
  const fit = (x0, y0, x1, y1, pad = 28) => {
    const pl = pad, pr = pad + 52, pt = pad, pb = pad;
    const kk = Math.min((rect.width - pl - pr) / Math.max(x1 - x0, 1), (rect.height - pt - pb) / Math.max(y1 - y0, 1));
    return d3.zoomIdentity.translate(pl + (rect.width - pl - pr) / 2 - kk * (x0 + x1) / 2, pt + (rect.height - pt - pb) / 2 - kk * (y0 + y1) / 2).scale(kk);
  };
  const stageBox = () => {
    const xs = [], ys = [];
    items.forEach(i => { xs.push(i.x); ys.push(i.y); });
    // 川や範囲の形も枠に入れる
    app.querySelectorAll('#geo path').forEach(p => { const b = p.getBBox(); xs.push(b.x, b.x + b.width); ys.push(b.y, b.y + b.height); });
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const minSpan = isWorld ? 380 : 200;
    if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
    if (y1 - y0 < minSpan * 0.7) { const c = (y0 + y1) / 2; y0 = c - minSpan * 0.35; y1 = c + minSpan * 0.35; }
    return [x0, y0, x1, y1];
  };
  const whole = () => fit(0, 0, W, H, 8);
  const zoom = d3.zoom().scaleExtent([whole().k * 0.8, whole().k * 40])
    .on('zoom', ev => { k = ev.transform.k; vp.attr('transform', ev.transform); sizeMarks(); });
  svg.call(zoom).on('dblclick.zoom', null);
  const home = () => fit(...stageBox());
  svg.call(zoom.transform, home());
  app.querySelector('#zin').onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.8);
  app.querySelector('#zout').onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.8);
  app.querySelector('#zfit').onclick = () => svg.transition().duration(400).call(zoom.transform, home());
  // 地図の枠の大きさが変わったら(カードの段数が変わったときなど)測り直す。まだ触っていなければ、全体が入るよう合わせ直す
  let touched = false;
  svg.on('pointerdown.t wheel.t', () => { touched = true; });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!document.body.contains(box)) return; rect = size(); if (!touched) svg.call(zoom.transform, home()); }).observe(box);
  S.zoomTo = (x0, y0, x1, y1) => svg.transition().duration(600).call(zoom.transform, fit(x0, y0, x1, y1, 40));

  // --- 番号と、はめた名前
  function drawSlots() {
    const g = app.querySelector('#slots');
    g.innerHTML = numbered.map(i => {
      const done = S.placed.has(i.id);
      let cls = done ? 'done' : 'open';
      if (!done && S.cand) cls += S.cand.includes(i.id) ? ' cand' : ' dim';
      return `<g class="slot ${cls}" data-id="${i.id}" data-x="${i.x}" data-y="${i.y}"><circle class="hit" r="22"/><circle class="dot" r="13"/><text dy="5" text-anchor="middle" font-size="15">${done ? '✓' : S.num.get(i.id)}</text></g>`;
    }).join('');
    app.querySelector('#labels').innerHTML = [...S.placed.keys()].map(id => {
      const i = items.find(x => x.id === id);
      const t = i.cat === 'climate' ? i.city + ' ' + typeOf(area, i).name : plainName(i.segs);
      return `<g class="lab" data-x="${i.x}" data-y="${i.y}"><text class="label" x="19" y="5" font-size="14">${esc(t)}</text></g>`;
    }).join('');
    sizeMarks();
    g.querySelectorAll('.slot').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); tapSlot(el.dataset.id); }));
  }
  // 拡大しても番号の大きさは画面上で同じにする
  function sizeMarks() {
    const s = 1 / k;
    app.querySelectorAll('#slots .slot, #labels .lab').forEach(el => el.setAttribute('transform', `translate(${el.dataset.x},${el.dataset.y}) scale(${s})`));
  }
  S.drawSlots = drawSlots;

  // --- カード
  function drawTray() {
    const left = S.cards.filter(id => !S.used || !S.used.has(id));
    const tray = app.querySelector('#tray');
    tray.innerHTML = left.length
      ? `<div class="lab">${S.sel ? 'えらんだカードの場所を、地図の番号からさがそう' : 'カードを1まいえらぼう'}</div>` + left.map(id => {
        const it = items.find(i => i.id === id);
        return `<button class="piece" data-card="${id}" aria-pressed="${S.sel === id}">${nameHTML(cardSegs(area, it))}</button>`;
      }).join('')
      : `<div class="lab">ぜんぶ、はまったよ!</div>`;
    tray.querySelectorAll('[data-card]').forEach(b => b.onclick = () => {
      S.sel = S.sel === b.dataset.card ? null : b.dataset.card; S.cand = null; clearRing(); SE.play('select'); drawTray(); drawSlots(); updHints();
    });
    app.querySelector('#count').textContent = `${S.placed.size} / ${items.length}`;
  }
  S.used = new Set();
  function updHints() {
    const on = !!S.sel && !S.done;
    ['#h-area', '#h-feat', '#h-two'].forEach(q => app.querySelector(q).disabled = !on);
  }

  // --- 番号をタップ
  function tapSlot(id) {
    const slot = items.find(i => i.id === id);
    if (S.placed.has(id)) return showInfo(slot, S.placed.get(id));
    if (!S.sel) {
      if (slot.cat === 'climate') return showClimate(slot);
      return toast('先に、下のカードを1まいえらんでね');
    }
    const card = items.find(i => i.id === S.sel);
    if (match(card, slot)) {
      SE.play('ok');
      S.placed.set(id, card.id); S.used.add(card.id); S.sel = null; S.cand = null; clearRing();
      const geoEl = app.querySelector(`[data-geo="${CSS.escape(id)}"]`); if (geoEl) geoEl.classList.add('done');
      drawSlots(); drawTray(); updHints();
      toast('せいかい! ' + (slot.cat === 'climate' ? slot.city + ' は ' + typeOf(area, slot).name : plainName(slot.segs)));
      if (S.placed.size === items.length) setTimeout(finish, 700);
    } else {
      SE.play('ng'); S.miss++;
      const el = app.querySelector(`.slot[data-id="${CSS.escape(id)}"]`);
      if (el) { el.classList.add('miss'); setTimeout(() => el.classList.remove('miss'), 400); }
      const pc = app.querySelector(`[data-card="${CSS.escape(S.sel)}"]`); if (pc) { pc.classList.remove('shake'); void pc.offsetWidth; pc.classList.add('shake'); }
      toast('ちがうみたい。ヒントもつかってみよう');
    }
  }

  // --- ヒント
  const R = isWorld ? 120 : 64;
  function targetFor(card) { // 同じ気候区が2つ以上あるときは、まだ空いている近い方
    if (card.cat !== 'climate') return card;
    const open = items.filter(i => !S.placed.has(i.id) && i.key === card.key);
    return open.find(i => i.id === card.id) || open[0];
  }
  function clearRing() { app.querySelector('#rings').innerHTML = ''; }
  app.querySelector('#h-area').onclick = () => {
    const card = items.find(i => i.id === S.sel), t = targetFor(card);
    const a = hash(t.id) * Math.PI * 2, off = R * 0.45;
    const cx = t.x + Math.cos(a) * off, cy = t.y + Math.sin(a) * off;
    app.querySelector('#rings').innerHTML = `<circle class="ring" cx="${cx}" cy="${cy}" r="${R}"/>`;
    S.zoomTo(cx - R * 1.6, cy - R * 1.6, cx + R * 1.6, cy + R * 1.6);
    SE.play('hint');
    toast((t.region ? t.region + 'の' : '') + 'このまるの中にあるよ');
  };
  app.querySelector('#h-feat').onclick = () => {
    const card = items.find(i => i.id === S.sel);
    SE.play('hint');
    if (card.cat === 'climate') {
      const ty = typeOf(area, card);
      return sheet(`<span class="tag">💡 とくちょう</span><h3>${nameHTML(cardSegs(area, card))}</h3><p>${textHTML(ty.hint)}</p>
        <p class="src" style="font-size:13px">地図の番号を、カードをえらばずにタップすると、その町の${ruby('<ruby>雨温図<rt>うおんず</rt></ruby>')}(気温と雨の量のグラフ)が見られるよ。くらべてみよう。</p>`);
    }
    sheet(`<span class="tag">💡 とくちょう${card.region ? ' ・ ' + esc(card.region) : ''}</span><h3>${nameHTML(card.segs)}</h3><p>${textHTML(card.hint)}</p>`);
  };
  app.querySelector('#h-two').onclick = () => {
    const card = items.find(i => i.id === S.sel), t = targetFor(card);
    const others = items.filter(i => !S.placed.has(i.id) && !match(card, i));
    const pick = others.length ? others[Math.floor(hash(card.id + S.miss) * others.length)] : null;
    S.cand = pick ? [t.id, pick.id] : [t.id];
    SE.play('hint'); clearRing(); drawSlots();
    const xs = S.cand.map(id => items.find(i => i.id === id));
    S.zoomTo(Math.min(...xs.map(i => i.x)) - R, Math.min(...xs.map(i => i.y)) - R, Math.max(...xs.map(i => i.x)) + R, Math.max(...xs.map(i => i.y)) + R);
    toast(pick ? 'オレンジの2つのうち、どちらかだよ' : 'オレンジの番号だよ');
  };

  function showInfo(slot, cardId) {
    if (slot.cat === 'climate') return showClimate(slot, true);
    sheet(`<span class="tag">${esc(slot.region || '')}</span><h3>${nameHTML(slot.segs)}</h3><p>${textHTML(slot.hint)}</p>`);
  }
  function showClimate(slot, solved) {
    const ty = typeOf(area, slot);
    sheet(`<span class="tag">${esc(slot.region || '')}</span><h3>${nameHTML(slot.segs)}の${ruby('<ruby>雨温図<rt>うおんず</rt></ruby>')}</h3>
      ${chart(slot)}
      ${solved ? `<p><b>${esc(ty.name)}</b>: ${textHTML(ty.hint)}</p>` : `<p style="font-size:14px;color:var(--sub)">ぼうグラフが雨の量(右のめもり)、赤い線が気温(左のめもり)。どの気候のカードがあてはまるかな?</p>`}
      <p class="src">${esc(slot.src)}</p>`);
  }
  drawSlots(); drawTray(); updHints();
}

// 雨温図(月ごとの降水量=ぼう、平均気温=線)
function chart(c) {
  const W = 340, H = 222, L = 34, Rr = 36, T = 24, B = 26, w = W - L - Rr, h = H - T - B;
  const tmin = Math.min(-10, Math.floor(Math.min(...c.temp) / 10) * 10), tmax = Math.max(30, Math.ceil(Math.max(...c.temp) / 10) * 10);
  const pmax = Math.max(300, Math.ceil(Math.max(...c.prec) / 100) * 100);
  const x = i => L + (i + 0.5) * w / 12, yt = v => T + h - (v - tmin) / (tmax - tmin) * h, yp = v => T + h - v / pmax * h;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="雨温図">`;
  for (let v = tmin; v <= tmax; v += 10) s += `<line x1="${L}" x2="${L + w}" y1="${yt(v)}" y2="${yt(v)}" stroke="#eee6d3"/><text x="${L - 4}" y="${yt(v) + 3}" text-anchor="end">${v}</text>`;
  for (let v = 0; v <= pmax; v += pmax > 400 ? 200 : 100) s += `<text x="${L + w + 4}" y="${yp(v) + 3}">${v}</text>`;
  c.prec.forEach((p, i) => s += `<rect x="${x(i) - w / 30}" y="${yp(p)}" width="${w / 15}" height="${T + h - yp(p)}" fill="#7db6e8"/>`);
  s += `<polyline fill="none" stroke="#d6455a" stroke-width="2.5" points="${c.temp.map((t, i) => x(i) + ',' + yt(t)).join(' ')}"/>`;
  c.temp.forEach((t, i) => s += `<circle cx="${x(i)}" cy="${yt(t)}" r="2.6" fill="#d6455a"/>`);
  for (let i = 0; i < 12; i++) s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${i + 1}</text>`;
  if (tmin < 0) s += `<line x1="${L}" x2="${L + w}" y1="${yt(0)}" y2="${yt(0)}" stroke="#c9b994"/>`;
  s += `<text x="${L - 4}" y="${T - 12}" text-anchor="end">℃</text><text x="${L + w + 4}" y="${T - 12}">mm</text><text x="${L + w / 2}" y="${H - 0}" text-anchor="middle">月</text></svg>`;
  const ann = c.prec.reduce((a, b) => a + b, 0), avg = c.temp.reduce((a, b) => a + b, 0) / 12;
  return s + `<p class="src" style="text-align:center;margin:0">年平均気温 ${avg.toFixed(1)}℃ ・ 年降水量 ${Math.round(ann).toLocaleString()}mm</p>`;
}

// ---------- 結果
function finish() {
  if (!S || S.done) return;
  S.done = true;
  const stars = S.miss === 0 ? 3 : S.miss <= 2 ? 2 : 1;
  const prev = best(S.key); if (stars > prev) store.set('best:' + S.key, stars);
  SE.play('clear');
  const st = stagesFor(S.area, S.cat, LEVEL), i = st.findIndex(s => s.key === S.key), next = st[i + 1];
  sheet(`<div class="result"><div class="big">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
    <h3>クリア!</h3><p>まちがい ${S.miss}回${stars === 3 ? ' ・ パーフェクト!' : ''}${stars > prev && prev ? ' ・ 記録こうしん!' : ''}</p>
    <div class="btns">
      ${next ? `<button class="btn main" id="r-next">つぎへ(${next.no ? 'ステージ' + next.no : 'ぜんぶ'})</button>` : ''}
      <button class="btn" id="r-look">地図をながめる</button>
      <button class="btn" id="r-again">もういちど</button>
      <button class="btn" id="r-list">ステージいちらんへ</button></div></div>`, false);
  const a = S.area, c = S.cat;
  document.getElementById('r-look').onclick = closeSheet;
  document.getElementById('r-again').onclick = () => { closeSheet(); play(a, c, S.key); };
  document.getElementById('r-list').onclick = () => { closeSheet(); back(); };
  if (next) document.getElementById('r-next').onclick = () => { closeSheet(); nav[nav.length - 1] = { s: 'play', area: a, cat: c, key: next.key }; play(a, c, next.key); };
}

// ---------- 下から出るシートと、地図の上のお知らせ
function sheet(html, closeBtn = true) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog">${html}${closeBtn ? '<div class="btns"><button class="btn main" data-close>とじる</button></div>' : ''}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.hasAttribute('data-close')) closeSheet(); });
  document.body.appendChild(bg);
}
function closeSheet() { document.querySelectorAll('.sheet-bg').forEach(e => e.remove()); }
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = 0, 2200);
}

// ---------- はじまり
(async () => {
  app.innerHTML = '<div class="page"><p class="lead">地図を読みこんでいます…</p></div>';
  try {
    const [jp, world] = await Promise.all(['data/jp.json', 'data/world.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); })));
    DATA.jp = jp; DATA.world = world;
  } catch (e) {
    app.innerHTML = '<div class="page"><p class="lead">地図が読みこめませんでした。通信できるところで、もう一度ひらいてください。</p></div>';
    return;
  }
  nav.push({ s: 'home' }); history.replaceState({ d: 1 }, '');
  home();
})();
