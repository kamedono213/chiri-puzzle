// 都道府県・県庁所在地・国(小学生レベル)のヒント文に、ふりがなを足す(一度だけ使った作業用スクリプト)
const fs = require('fs');
const path = require('path');
const R = [
  ['陸奥湾', '{陸奥湾|むつわん}'], ['{霞|かすみ}ケ浦', '{霞ケ浦|かすみがうら}'], ['草津温泉', '{草津温泉|くさつおんせん}'], ['房総半島', '{房総|ぼうそう}半島'],
  ['伊勢湾', '{伊勢湾|いせわん}'], ['駿河湾', '{駿河湾|するがわん}'], ['三河湾', '{三河湾|みかわわん}'], ['東京湾', '東京{湾|わん}'], ['富山湾', '富山{湾|わん}'], ['湾', '{湾|わん}'],
  ['都庁', '都{庁|ちょう}'], ['信濃川', '{信濃川|しなのがわ}'], ['河口', '{河口|かこう}'], ['能登半島', '{能登|のと}半島'], ['突き出', '{突|つ}き出'],
  ['兼六園', '{兼六園|けんろくえん}'], ['恐竜', '{恐竜|きょうりゅう}'], ['富士山', '{富士山|ふじさん}'], ['盆地', '{盆地|ぼんち}'], ['武田信玄', '{武田信玄|たけだしんげん}'],
  ['善光寺', '{善光寺|ぜんこうじ}'], ['紀伊半島', '{紀伊|きい}半島'], ['伊勢神宮', '{伊勢|いせ}神宮'], ['瀬戸内海', '{瀬戸内海|せとないかい}'], ['東経', '東{経|けい}'],
  ['大仏', '大{仏|ぶつ}'], ['砂丘', '{砂丘|さきゅう}'], ['桃太郎', '{桃太郎|ももたろう}'], ['原爆', '{原爆|げんばく}'], ['厳島', '{厳島|いつくしま}'], ['遺産', '{遺産|いさん}'],
  ['阿波', '{阿波|あわ}'], ['道後温泉', '道後{温泉|おんせん}'], ['貿易', '{貿易|ぼうえき}'], ['窓口', '{窓口|まどぐち}'], ['阿蘇山', '{阿蘇山|あそさん}'], ['温泉', '{温泉|おんせん}'],
  ['日向灘', '{日向灘|ひゅうがなだ}'], ['桜島', '{桜島|さくらじま}'], ['朝鮮半島', '{朝鮮|ちょうせん}半島'],
];
// {…} の中は書きかえない
function apply(text) {
  for (const [a, b] of R) {
    let out = '', depth = 0;
    for (let i = 0; i < text.length;) {
      if (text[i] === '{') depth++;
      if (text[i] === '}') depth--;
      if (!depth && text.startsWith(a, i)) { out += b; i += a.length; continue; }
      out += text[i++];
    }
    text = out;
  }
  return text;
}
const D = p => path.join(__dirname, '../data', p);
// prefs.txt: 5列目以降(ヒント)だけ
const prefs = fs.readFileSync(D('prefs.txt'), 'utf8').split(/\r?\n/).map(l => {
  if (!l || l.startsWith('#')) return l;
  const t = l.split('|'); return t.slice(0, 4).concat(apply(t.slice(4).join('|'))).join('|');
});
fs.writeFileSync(D('prefs.txt'), prefs.join('\n'));
// countries.txt: レベル1の行の3列目以降だけ
const cs = fs.readFileSync(D('countries.txt'), 'utf8').split(/\r?\n/).map(l => {
  if (!l.startsWith('1|')) return l;
  const t = l.split('|'); return t.slice(0, 2).concat(apply(t.slice(2).join('|'))).join('|');
});
fs.writeFileSync(D('countries.txt'), cs.join('\n'));
console.log('ok');
