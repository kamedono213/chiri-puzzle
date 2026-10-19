# ちりパズル(地理の白地図パズル)

山地・山脈、川、平野、半島、気候のカードを、白地図の正しい番号にはめていくスマホ向けWebアプリ(PWA)。

- 公開URL: https://kamedono213.github.io/chiri-puzzle/
- 日本編と世界編(世界編には「大陸と海」もある)
- レベル: 小学生(むずかしい漢字にふりがな)/中学生/高校生。上のレベルは下のレベルの地名も含む。レベル分けは目安
- 1ステージは7こ前後。近い場所どうしを同じステージにまとめる。7こより多い種類は「ぜんぶ」ステージもある
- ヒント(何回でも使える。星はへらない)
  - ちいき: 地方(州)の名前と、答えがある範囲の丸を地図に出す
  - とくちょう: その場所の特徴(位置の手がかり)
  - 2つにしぼる: 番号を2つまでしぼる
  - 気候のステージでは、カードをえらばずに番号をタップすると、その町の雨温図が見られる
- 星: まちがい0回で3つ、1〜2回で2つ、それ以上で1つ。記録はその端末のブラウザ(localStorage)に保存

## データの出典と検算
- 地図: Natural Earth(都道府県・陸地・湖・世界の川・山脈/平野/半島の範囲)、world-atlas(国境)
- 日本の川の形: OpenStreetMap(© OpenStreetMap contributors, ODbL)
- 地名の位置・読み: 日本語版Wikipedia/Wikidata の座標と冒頭文。読みは Wikipedia の読みと照合済み
  (北上高地は教科書の名前「きたかみこうち」、道後平野は松山平野の別名)
- 日本の地点は、出題リストに書いた都道府県の中(8km以内)にあるかを機械で照合。範囲の端に出ていた7か所は代表的な山・地点に置きかえた(`tools/build-data.js` の JP_FIX に理由つき)
- 日本の気候: 気象庁の平年値(1991〜2020年)。教科書の説明(日本海側は冬の降水が多い 等)と合うかを平年値で検算
- 世界の気候: 英語版Wikipediaの気候表(Weather box)。ケッペンの式(温帯/冷帯の境は最寒月 -3℃)で分類を計算し、出題の気候区と一致することを確認
- ふりがな: 学年別漢字配当表で4年生までに習わない漢字と、難読の地名(`!` 印)に付ける。小学生レベルのヒント文に、ふりがなのない漢字が残っていないかも機械で確認

## 作り方
- `research/` … 元データを集めたスクリプト(fetch-wiki.js, fetch-wikidata.js, fetch-jma.js, fetch-climate-world.js, overpass.js)。`research/raw/` は大きいので Git に入れない
- `data/items-jp.txt`, `data/items-world.txt` … 出題リスト(種類・レベル・読み・記事名・都道府県)
- `data/hints.txt` … 「とくちょう」ヒント。`{漢字|よみ}` は小学生レベルでだけふりがなになる
- `node tools/build-data.js` … `app/data/jp.json`, `app/data/world.json` を作る(検算に失敗すると止まる)
- `node research/debug-map.js jp mount` … 全地点に名前を付けた確認用の地図(SVG)
- `node tools/make-icons.js` … アイコン
- `node tools/build-pages.js` … `docs/` にPWA版(GitHub Pages用)
- `node serve.js docs` … http://localhost:5393 で確認
