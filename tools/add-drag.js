// カードを番号までドラッグしてはめる操作を、app/app.js と app/index.html に足す(ちりパズル・からだパズル共通の一度きりの作業用)
// 使い方: node tools/add-drag.js <アプリのフォルダ>
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const jsPath = path.join(dir, 'app/app.js'), cssPath = path.join(dir, 'app/index.html');
let js = fs.readFileSync(jsPath, 'utf8'), css = fs.readFileSync(cssPath, 'utf8');
const must = (s, a) => { if (!s.includes(a)) throw new Error('見つからない: ' + a.slice(0, 60)); };

const oldBind = `    tray.querySelectorAll('[data-card]').forEach(b => b.onclick = () => {
      S.sel = S.sel === b.dataset.card ? null : b.dataset.card; S.cand = null; clearRing(); SE.play('select'); drawTray(); drawSlots(); updHints();
    });`;
const newBind = `    tray.querySelectorAll('[data-card]').forEach(b => {
      b.onclick = () => {
        if (dragJustEnded) { dragJustEnded = false; return; } // ドラッグの直後に来る click は無視
        S.sel = S.sel === b.dataset.card ? null : b.dataset.card; S.cand = null; clearRing(); SE.play('select'); drawTray(); drawSlots(); updHints();
      };
      b.addEventListener('pointerdown', ev => startDrag(ev, b));
    });`;
must(js, oldBind);
js = js.replace(oldBind, newBind);

const anchor = `  // --- カード
  function drawTray() {`;
must(js, anchor);
js = js.replace(anchor, `  // --- カードを番号までドラッグしてはめる(カードをタップ→番号をタップ、でもはめられる)
  let drag = null, dragJustEnded = false;
  // 指の下、なければ指から36px以内でいちばん近い、まだ空いている番号
  function slotNear(x, y) {
    let best = null, bd = 36;
    app.querySelectorAll('#slots .slot:not(.done)').forEach(el => {
      const r = el.querySelector('.dot').getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < bd) { bd = d; best = el; }
    });
    return best;
  }
  function startDrag(ev, b) {
    if (ev.button > 0 || S.done) return;
    drag = { id: b.dataset.card, b, x0: ev.clientX, y0: ev.clientY, ghost: null, over: null };
    try { b.setPointerCapture(ev.pointerId); } catch (e) { /* 取れなくても動く */ }
    b.onpointermove = moveDrag; b.onpointerup = endDrag; b.onpointercancel = () => stopDrag();
  }
  function moveDrag(ev) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 8) return; // 少し動くまではタップあつかい
      if (S.sel !== drag.id) { S.sel = drag.id; S.cand = null; clearRing(); SE.play('select'); updHints(); drawSlots(); }
      const g = drag.b.cloneNode(true);
      g.classList.add('ghost'); g.setAttribute('aria-pressed', 'true'); g.removeAttribute('data-card');
      document.body.appendChild(g); drag.ghost = g;
      drag.b.classList.add('lifted');
    }
    drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
    const over = slotNear(ev.clientX, ev.clientY);
    if (over !== drag.over) { if (drag.over) drag.over.classList.remove('hover'); if (over) over.classList.add('hover'); drag.over = over; }
  }
  function stopDrag() {
    if (!drag) return null;
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.over) d.over.classList.remove('hover');
    d.b.classList.remove('lifted');
    d.b.onpointermove = d.b.onpointerup = d.b.onpointercancel = null;
    return d;
  }
  function endDrag() {
    const d = stopDrag();
    if (!d || !d.ghost) return; // 動かしていない = ふつうのタップ(onclick に任せる)
    dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 400);
    if (d.over) tapSlot(d.over.dataset.id);
    else { toast('番号の上で、指をはなしてね'); drawTray(); }
  }

  // --- カード
  function drawTray() {`);

js = js.replace("'カードを1まいえらぼう'", "'カードを1まいえらんで、番号までドラッグしよう(タップでもOK)'");
js = js.replace('<li>下のカードを1まいえらぶ</li>', '<li>下のカードを、番号までドラッグする</li>');
js = js.replace(/<li>(地図|図)の番号をタップして、はめる<\/li>/, '<li>カードをタップしてから、$1の番号をタップしても、はめられる</li>');

const cssAnchor = '.piece.shake { animation: shake .35s; }';
must(css, cssAnchor);
css = css.replace(cssAnchor, `${cssAnchor}
/* ドラッグ: カードは指で動かすので、カードの上ではページをスクロールしない */
.piece { touch-action: none; user-select: none; -webkit-user-select: none; }
.piece.lifted { opacity: .35; }
.piece.ghost { position: fixed; z-index: 30; pointer-events: none; transform: translate(-50%, -130%) scale(1.06); background: var(--accent); color: var(--accent-ink); box-shadow: 0 10px 24px rgba(0,0,0,.25), 0 0 0 2px #b2522a inset; }`);
const slotAnchor = '.slot.miss .dot { fill: var(--ng); }';
must(css, slotAnchor);
css = css.replace(slotAnchor, `${slotAnchor}
.slot.hover .dot { fill: var(--accent); stroke-width: 4px; }
.slot.hover { opacity: 1; }`);
fs.writeFileSync(jsPath, js);
fs.writeFileSync(cssPath, css);
console.log('ok', dir);
