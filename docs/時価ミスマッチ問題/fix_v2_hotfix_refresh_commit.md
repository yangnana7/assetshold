結論：UIの\$124.64は**取得単価（avg\_price\_usd）**、\$244.57は**評価額（market\_price\_usd×数量）**。評価額側が「過去にJPYソースで保存されたvaluation（fx\_context=null）」を**率で割り戻してUSD化**しているため、**単価≈\$122台/株**に化けている。`/api/market/probe` は正しく\$248.28を返しているが、**DBにcommitされておらず**、UIは古いvaluationを読んでいる。修正は「リフレッシュ時に**USD→JPY計算＋fx\_context付きで valuations に保存**」を必須化すること。

---

# 何が起きているか（因果の特定）

* クライアント

  * `AssetList.jsx` の `renderEvaluationDetails` は「取得単価」を表示：`avg_price_usd × quantity`。スクショの\*\*\$124.64 × 2\*\*はこれ（コスト）。
  * `renderEvaluationAmount` は「評価額」を表示：**`details.market_price_usd * qty`** があればUSDで、なければ円（`current_value_jpy`）にフォールバック。
* サーバ

  * `/api/assets` では valuations の**最新行**を読んで

    * `current_value_jpy` ← `valuations.value_jpy`
    * `market_price_usd` ← `unit_price_jpy / rate`（`fx_context` が入っていればそのrate、なければ「現在のUSDJPY」で\*\*`value_jpy / (qty * rate)`\*\*にフォールバック）
  * つまり、**最新valuationがJPY由来**（Yahoo Japanなど）かつ `fx_context` が空のままだと、**USD単価が `value_jpy / (qty * 現在のレート)` に化ける**→**\$122台**というズレになっている。
* `/api/market/probe` は正しいORCL\:NYSE（Google \$248.28）を返しているが、**commitしていない**（診断API）。
* `/api/valuations/:assetId/refresh` は `./src/routes/valuations.refresh` を呼んで**レスポンス返すだけ**で、**DBにinsertしない**実装のまま（あなたに渡した最小キットは“返すだけ”雛形）。

---

# 対処（最小変更で確実に直す）

## 1) 「リフレッシュでDBに保存」するハンドラを差し替え

次のドロップインを使えば、**USDで取得→USDJPY換算→`valuations`に insert**まで行います（`fx_context`も埋めます）。

**ダウンロード**
[hotfix\_refresh\_commit.zip](sandbox:/mnt/data/hotfix_refresh_commit.zip)

中身：`src/routes/valuations.refresh.js`（CommonJS）

### 置き方

1. zipを展開して **プロジェクト直下**に上書き配置（`src/routes/valuations.refresh.js`）。
2. `server.js` 冒頭の**どこでも良い**ので、DB/プロバイダ/キャッシュを Express の app に渡す1行を追加（この4つ）：

   ```js
   app.set('db', db);
   app.set('fxProvider', fxProvider);
   app.set('CACHE_TTL', CACHE_TTL);
   app.set('fetchWithCache', fetchWithCache);
   ```

   ※ これで `valuations.refresh.js` から DB と為替プロバイダにアクセスできます。
3. 既にルートはこうなっているはず：

   ```js
   app.post('/api/valuations/:assetId/refresh', async (req, res) => {
     // us_stock なら src/routes/valuations.refresh を呼ぶ分岐がある
   });
   ```

   拙作の `valuations.refresh.js` は**同じエクスポート名**（`refreshValuationHandler`）なので、そのまま差し替わります。

### これで起きること

* US株の市場更新ボタン →
  **Google/Yahoo(.com)** からUSD単価取得 → **USDJPYで円換算** →
  `valuations`へ `value_jpy`（総額）と `unit_price_jpy`（単価）と `fx_context` を**保存** →
  `us_stocks.market_price_usd` も**更新**。
* `/api/assets` は直近valuationを読むので、\*\*`details.market_price_usd ≒ 248.28`\*\*となり、表示は

  * 取得単価: **\$124.64 × 2**（過去コスト）
  * 評価額: **\$248.28 × 2 ≒ \$496.56**（←ここが正しく更新される）

> 重要：**Yahooは `finance.yahoo.com` を強制**（`co.jp` 使用時はJPYになる）。このハンドラは `.com` 固定で呼んでいます。

---

## 2) 将来の混入防止（任意だが推奨）

* **calculateMarketValue() を一本化**
  `server.js` 内の US株計算を **`./src/market` の `fetchLatestUSQuote(..., { yahooHost: 'com' })`** に差し替えれば、**バルクリフレッシュ**も同じロジックになります（今回の不整合は「別実装が混在」したことが原因のひとつ）。

* **古い誤った行は可視化しておく**
  直近の valuation が JPYソース由来かを素早く見るSQL：

  ```sql
  SELECT id, as_of, value_jpy, unit_price_jpy, fx_context
  FROM valuations
  WHERE asset_id = :ORCL_ID
  ORDER BY as_of DESC, id DESC
  LIMIT 5;
  ```

  `fx_context` が `NULL` や `{"pair":"USDJPY",...}` でない行は「怪しい」ので、新しい行を積んだ後にUIで「最新のみ採用」になっているか確認。

---

# 事後チェック（5分で終わる検証手順）

1. **ORCLの市場更新をクリック**（`/api/valuations/:id/refresh` が走る）
2. `GET /api/assets?page=1` → `stock_details.market_price_usd` が **≈ 248.28** になっていること
3. 画面に **評価額 ≈ \$496.56** が出ていること（2株想定）
4. `valuations` の最新行に

   * `unit_price_jpy ≈ 248.28 × USDJPY`
   * `fx_context` に `{"pair":"USDJPY","rate":...}`
     が入っていること

---

# 付記（今回ログに出ていたエラー）

* `Parse Error: Header overflow`（Yahoo）/ `HTTP 401`（MarketWatch）

  * スクレイピング時のヘッダ長/認証系の**サイト側対策**で、よく出ます。今回の集約は**Google優先**＋**Yahoo .com**の2本で十分。3本目は**落ちても無視**でOK（中央値採用のため）。

---

これで「**クリックした時に正しい時価が表示される**」状態になります。
もし `/api/valuations/refresh-all` 側も新ロジックに揃えたい場合は、そのループ内の US株処理を同様に `fetchLatestUSQuote(..., { yahooHost:'com' })` へ切替えてください。
