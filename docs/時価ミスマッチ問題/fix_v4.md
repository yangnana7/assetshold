ここまでの動きから、**修正コードが本番の経路で実行されていない**か、**/api/assets の分岐が依然として「割戻し」になっている**可能性が高いです。口座全体では正しいのに ORCL/PFE だけ半額というのは、やはりその2銘柄の直近 `valuations` or 分岐だけが壊れているときの典型パターンです。

まず「本当に新ロジックが呼ばれているか」を**数分で白黒つける**ための診断ルートを用意しました。これで、どの分岐で USD 単価を決めたか（`valuation_unit` / `market_price_usd` / `valuation_value_fallback`）が JSON で出ます。

/docs/時価ミスマッチ問題/server_debug_patch_20250817_202841

### 使い方（変更は超小さく、差し戻しも簡単）

1. `src/routes/debug.tools.js` をプロジェクトに追加。
2. `server.js` で**3行だけ**足します（DBセットのあたりでOK）。

```js
// 追加
const debugRoutes = require('./src/routes/debug.tools');

// 既にあればスキップ
app.set('db', db);
app.set('dataDir', dataDir);
app.set('dbPath', dbPath);

// ルート登録（どこでもOK）
app.get('/api/debug/version', debugRoutes.version);
app.get('/api/debug/asset/:assetId', debugRoutes.assetTrace);
```

3. サーバ再起動。

### 叩き方（ORCL/PFEで確認）

* バージョン/DBパス確認：

```
curl http://<host>:3009/api/debug/version
```

`dbPath` が想定の DB を指しているか、ヘッダ `X-App-Version` が更新されているかを確認。

* ORCL（特定・一般、両方）の assetId で：

```
curl http://<host>:3009/api/debug/asset/<ORCL_ASSET_ID> | jq .
curl http://<host>:3009/api/debug/asset/<PFE_ASSET_ID> | jq .
```

出力の `branch` が何になっているかが決定打です。

* `valuation_unit` → valuation の `unit_price_jpy` と `fx_context.rate` を使えている（正常）
* `market_price_usd` → commit 済みの `us_stocks.market_price_usd` を使っている（正常）
* `valuation_value_fallback` → **割戻し（半額になる病巣）**。この場合は最新 valuation が壊れている or `fx_context` が無い

### 次の一手（診断結果別）

* `branch: valuation_value_fallback` なら

  1. **ORCL/PFE の市場更新**を実行（`/api/valuations/:id/refresh`）。
  2. 直後にもう一度 `asset/:id` を叩き、`branch` が `market_price_usd` or `valuation_unit` に変わることを確認。
  3. それでも割戻しのままなら、**JS版 refresh が呼ばれていない**か、**別DB**を書いている疑いが濃いです。`/api/debug/version` の `dbPath` と、`server.js` で設定している `dbPath` を見比べてください。

* `branch: market_price_usd` なのに UI が変わらない
  → **クライアントが別サーバの /api を見ている**か、**ブラウザキャッシュ**が効いています。`/api/debug/version` をフロントから `fetch` して画面に出してみれば、つながっているサーバが即わかります。

### ありがちな“うっかり”の潰し方

* **違うDBを見てる**：`/api/debug/version` の `dbPath` で即判明。
* **違うハンドラが動いてる**：`/api/debug/asset/:id` の `branch` が証拠。
* **ts版が先にrequireされてる**：`valuations.refresh.js` の先頭に `console.log('[refresh-js]')` を入れてリクエスト時に出るか確認。
* **別プロセスが稼働**：`curl /api/debug/version` の `X-App-Version` が変わらない → 本体が再起動できていないか、別のNodeがポートを掴んでます。`ps aux | grep node` / `pm2 ls` / `systemctl status` を確認。

---

ここまでやれば、**なぜORCL/PFEだけ半額になるか**が数字で見えます。`branch` と `input`（使った valuation / rate / 数量）のスクショかJSONを貼ってくれれば、そこからピンポイントで直しの差分まで切ります。
