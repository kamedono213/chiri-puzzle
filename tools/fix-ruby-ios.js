// iPhone(Safari)で、ふりがなが漢字の下にずれる問題を直す(ちり・からだ・れきしパズル共通、一度きりの作業用)
// Safari は <ruby>/<rt> に display や position の指定を効かせないため、画面に入った <ruby> を
// <span class="rb">漢字<span class="rt">よみ</span></span> に置きかえて、ふつうの要素として配置する。
// 使い方: node tools/fix-ruby-ios.js <アプリのフォルダ>
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const jsP = path.join(dir, 'app/app.js'), cssP = path.join(dir, 'app/index.html');
let js = fs.readFileSync(jsP, 'utf8'), css = fs.readFileSync(cssP, 'utf8');

const oldCss = /\/\* ふりがな: 親文字の字間を広げないよう、読みを上にはみ出させて置く \*\/\nruby \{[^\n]*\}\nruby rt \{[^\n]*\}/;
if (!oldCss.test(css)) throw new Error('ふりがなのCSSが見つからない');
css = css.replace(oldCss, `/* ふりがな: 親文字の字間を広げないよう、読みを上にはみ出させて置く。
   iPhone(Safari)は <ruby> の配置を変えられないので、app.js が <ruby> を .rb/.rt の span に置きかえる */
.rb { display: inline-block; position: relative; text-indent: 0; }
.rb > .rt { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); font-size: 0.5em; font-weight: 700; line-height: 1.1; letter-spacing: 0; white-space: nowrap; }`);

const anchor = "// ---------- 効果音";
if (!js.includes(anchor)) throw new Error('効果音の見出しが見つからない');
js = js.replace(anchor, `// ---------- ふりがな(iPhone対策)
// <ruby>漢字<rt>よみ</rt></ruby> を <span class="rb">漢字<span class="rt">よみ</span></span> に置きかえる。
// 画面に入った直後(描画の前)に置きかえるので、ちらつかない
function fixRuby(root) {
  root.querySelectorAll('ruby').forEach(r => {
    const rt = r.querySelector('rt'), yomi = rt ? rt.textContent : '';
    if (rt) rt.remove();
    const s = document.createElement('span'); s.className = 'rb'; s.innerHTML = r.innerHTML;
    const t = document.createElement('span'); t.className = 'rt'; t.textContent = yomi; s.appendChild(t);
    r.replaceWith(s);
  });
}
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) fixRuby(n.tagName === 'RUBY' ? n.parentNode : n); })
  .observe(document.documentElement, { childList: true, subtree: true });

${anchor}`);
fs.writeFileSync(jsP, js);
fs.writeFileSync(cssP, css);
console.log('ok', dir);
