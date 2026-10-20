// 都道府県・国の「形パズル」と、かんたん/むずかしいモードを app に足す(一度きりの作業用)
const fs = require('fs');
const path = require('path');
const jsP = path.join(__dirname, '../app/app.js'), cssP = path.join(__dirname, '../app/index.html');
let js = fs.readFileSync(jsP, 'utf8'), css = fs.readFileSync(cssP, 'utf8');
function rep(a, b) { if (!js.includes(a)) throw new Error('見つからない: ' + a.slice(0, 70)); js = js.replace(a, b); }

rep(`const CATS = {`, `const CATS = {
  pref: { html: '都道府県', plain: '都道府県', ic: '🗾', col: '#e8743b', bg: '#fde3d2' },
  capital: { html: '県庁所在地', plain: '県庁所在地', ic: '🏛️', col: '#8e5fb8', bg: '#ece2f5' },
  country: { html: '国', plain: '国', ic: '🌐', col: '#2f9e6b', bg: '#e1f2e8' },`);
rep(`const CAT_ORDER = { jp: ['mount', 'river', 'plain', 'pen', 'climate'], world: ['cont', 'mount', 'river', 'plain', 'pen', 'climate'] };`,
  `const CAT_ORDER = { jp: ['pref', 'capital', 'mount', 'river', 'plain', 'pen', 'climate'], world: ['country', 'cont', 'mount', 'river', 'plain', 'pen', 'climate'] };
// 形パズル(都道府県・国)のモード: かんたん=ピースに形と名前、むずかしい=形だけ
const SHAPE_CATS = ['pref', 'country'];
let MODE = store.get('mode', 'easy');
const modeKey = cat => SHAPE_CATS.includes(cat) ? ':' + MODE : '';
const MODES = [{ k: 'easy', html: 'かんたん<small>形と名前</small>' }, { k: 'hard', html: 'むずかしい<small>形だけ</small>' }];
const shapeSVG = (it, size) => \`<svg class="shape" viewBox="\${it.shape.vb.join(' ')}" width="\${size}" height="\${size}" aria-hidden="true"><path d="\${it.shape.d}"/></svg>\`;
// ピースの中身(形パズルは形、むずかしいモードでは名前を出さない)
const pieceHTML = (area, it) => it.shape ? shapeSVG(it, 64) + (MODE === 'easy' ? \`<span class="nm">\${nameHTML(it.segs)}</span>\` : '') : nameHTML(cardSegs(area, it));
// シートの見出し(むずかしいモードで答えをまだ知らないときは、名前の代わりに形)
const headHTML = (it, solved) => it.shape && MODE === 'hard' && !solved ? shapeSVG(it, 96) : nameHTML(it.segs);`);
rep("const st = out.map((its, i) => ({ key: `${area}:${L}:${cat}:${i}`, no: i + 1, items: its }));", "const st = out.map((its, i) => ({ key: `${area}:${L}:${cat}:${i}${modeKey(cat)}`, no: i + 1, items: its }));");
rep("if (n > 7) st.push({ key: `${area}:${L}:${cat}:all`, no: 0, items });", "if (n > 7) st.push({ key: `${area}:${L}:${cat}:all${modeKey(cat)}`, no: 0, items });");
// ステージ一覧にモードの切りかえ
rep(`    <p class="lead">\${LEVELS[LEVEL - 1].html.replace(/<rt>.*?<\\/rt>|<\\/?ruby>/g, '')}レベル ・ \${itemsFor(area, cat, LEVEL).length}こ</p>`,
  `    <p class="lead">\${LEVELS[LEVEL - 1].html.replace(/<rt>.*?<\\/rt>|<\\/?ruby>/g, '')}レベル ・ \${itemsFor(area, cat, LEVEL).length}こ</p>
    \${SHAPE_CATS.includes(cat) ? \`<div class="levels modes" role="group" aria-label="モード">\${MODES.map(m => \`<button data-mode="\${m.k}" aria-pressed="\${MODE === m.k}">\${m.html}</button>\`).join('')}</div>
    <p class="levelnote">\${MODE === 'easy' ? 'ピースに、形と名前が出るよ。' : 'ピースは形だけ。形を見て、どこかを当てよう。はめると名前が出るよ。'}</p>\` : ''}`);
rep(`  app.querySelectorAll('[data-key]').forEach(b => b.onclick = () => go({ s: 'play', area, cat, key: b.dataset.key }));`,
  `  app.querySelectorAll('[data-key]').forEach(b => b.onclick = () => go({ s: 'play', area, cat, key: b.dataset.key }));
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { MODE = b.dataset.mode; store.set('mode', MODE); SE.play('select'); catPage(area, cat); });`);
rep("<small>${stage.no ? 'ステージ' + stage.no : 'ぜんぶ'} ・ ", "<small>${stage.no ? 'ステージ' + stage.no : 'ぜんぶ'} ・ ${SHAPE_CATS.includes(cat) ? (MODE === 'easy' ? 'かんたん ・ ' : 'むずかしい ・ ') : ''}");
rep('return `<button class="piece" data-card="${id}" aria-pressed="${S.sel === id}">${nameHTML(cardSegs(area, it))}</button>`;',
  'return `<button class="piece${it.shape ? \' shape-piece\' : \'\'}" data-card="${id}" aria-pressed="${S.sel === id}" aria-label="${it.shape && MODE === \'hard\' ? \'形のピース\' : esc(plainName(it.segs))}">${pieceHTML(area, it)}</button>`;');
rep("sheet(`<span class=\"tag\">💡 とくちょう${card.region ? ' ・ ' + esc(card.region) : ''}</span><h3>${nameHTML(card.segs)}</h3><p>${textHTML(card.hint)}</p>`);",
  "sheet(`<span class=\"tag\">💡 とくちょう${card.region ? ' ・ ' + esc(card.region) : ''}</span><h3>${headHTML(card, false)}</h3><p>${textHTML(card.hint)}</p>`);");
rep("sheet(`<span class=\"tag\">${esc(slot.region || '')}</span><h3>${nameHTML(slot.segs)}</h3><p>${textHTML(slot.hint)}</p>`);",
  "sheet(`<span class=\"tag\">${esc(slot.region || '')}</span><h3>${slot.shape ? shapeSVG(slot, 72) + ' ' : ''}${nameHTML(slot.segs)}</h3><p>${textHTML(slot.hint)}</p>`);");
fs.writeFileSync(jsP, js);

const anchor = '.area-poly { fill-opacity: .28; stroke-width: 1.2px; vector-effect: non-scaling-stroke; }';
if (!css.includes(anchor)) throw new Error('css anchor');
css = css.replace(anchor, `${anchor}
.area-poly.done { fill-opacity: .6; }
/* 形のピース */
.piece.shape-piece { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 10px 6px; min-width: 84px; }
.piece .shape { display: block; }
.piece .shape path { fill: #f3c9a8; stroke: #8a5a3a; stroke-width: 1.2px; vector-effect: non-scaling-stroke; }
.piece[aria-pressed="true"] .shape path, .piece.ghost .shape path { fill: #ffe9d6; stroke: #fff; }
.piece .nm { font-size: 15px; line-height: 1.3; }
.sheet h3 .shape { vertical-align: middle; }
.sheet h3 .shape path { fill: #f3c9a8; stroke: #8a5a3a; stroke-width: 1.2px; vector-effect: non-scaling-stroke; }
.levels.modes button small { display: block; font-size: 11px; font-weight: 700; opacity: .8; }`);
fs.writeFileSync(cssP, css);
console.log('ok');
