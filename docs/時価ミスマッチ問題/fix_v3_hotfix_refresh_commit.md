\*\*ORCL と PFE だけが “約1/2 の単価”\*\*になっています。これは「スクレイピングが間違っている」のではなく、**その2銘柄の直近 `valuations` 行だけが壊れていて、UIがそこから“逆算”している**のが原因です。ほかの銘柄は直近行が正常なので正しく見えている、というつじつまです。

## なぜ 1/2 になる？

`/api/assets` は表示用の USD 単価をこう決めています（要旨）：

* `valuation.unit_price_jpy` と `fx_context.rate` があれば → **`unit_price_jpy / rate`**
* それが無ければ → **`value_jpy / (quantity * rate)`**（「円建て評価額」を株数で割り戻すフォールバック）

ORCL/PFE は直近 `valuations` が

* `unit_price_jpy` が空、または半額
* `value_jpy` が「株数を掛けていない（1株分だけ）」
  のどちらかで保存されているため、フォールバックが働いて
  **`(1株分の円評価額) / (現在の株数 * rate)` → “1/2 のUSD単価”** に見えます。

> 例：ORCL の本来の1株 ≈ \$248.28（probeで確認済）。
> 直近 `value_jpy` が 1株分 ≈ 36,607円のまま、現在の株数が2なら
> `36,607 / (2 * rate)` ≈ **\$124.64** になります（まさに画面の数字）。

## なぜこの2銘柄だけ？

* **その銘柄の直近 `valuations` だけ**が、ホットフィックス導入**前**や `.co.jp` 系の旧ロジックで記録されているため。
* 他の銘柄はホットフィックス後に正しく `unit_price_jpy` と `fx_context` が入った行で上書きされているので正常に見えている、という状態です。

---

## 5分で切り分け（SQL）

まず事実確認を：

```sql
-- ORCL と PFE の asset_id / quantity
SELECT a.id, a.name, u.ticker, u.exchange, u.quantity
FROM assets a JOIN us_stocks u ON u.asset_id=a.id
WHERE u.ticker IN ('ORCL','PFE');

-- 直近の valuation を確認（最新 3件）
SELECT asset_id, as_of, value_jpy, unit_price_jpy, fx_context
FROM valuations
WHERE asset_id IN (/* 上のID群 */)
ORDER BY as_of DESC, id DESC
LIMIT 9;

-- 参照される USDJPY レート（キャッシュ）
SELECT payload
FROM price_cache
WHERE key='fx:USDJPY'
ORDER BY fetched_at DESC
LIMIT 1;
```

**正常なら**
`unit_price_jpy ≈ 1株USD × rate`（ORCLなら ≈ 36,5xx円）、`value_jpy = unit_price_jpy × quantity`、`fx_context` に `{"pair":"USDJPY","rate":...}`。
**壊れていれば**
`unit_price_jpy` が未設定/半額、`value_jpy` が 1株分だけ、`fx_context` が NULL…のような行が最新にいます。

---

## すぐ直す（2手順）

### 手順A：表示が壊れ続けるのを止める（安全化）

`/api/assets` の単価決定を \*\*「`fx_context` を持つ valuation だけ信用」\*\*にし、それ以外は **`us_stocks.market_price_usd` を優先**するよう1行差し替え。

```diff
- if (valuation.unit_price_jpy) {
-   unitUsd = valuation.unit_price_jpy / rate;
- } else if (valuation.value_jpy) {
-   unitUsd = valuation.value_jpy / (qty * rate);
- }
+ const ctx = safeParseJson(valuation.fx_context); // 失敗時 null
+ if (valuation.unit_price_jpy && ctx && ctx.pair==='USDJPY' && Number(ctx.rate)>0) {
+   unitUsd = valuation.unit_price_jpy / Number(ctx.rate);
+ } else if (Number(details.market_price_usd) > 0) {
+   unitUsd = Number(details.market_price_usd);     // commit 済みUSD単価を採用
+ } else if (valuation.value_jpy && qty>0 && rate>0) {
+   unitUsd = valuation.value_jpy / (qty * rate);   // 最後の手段
+ }
```

> これで“壊れた valuation による 1/2 上書き”を防ぎます。
> （他銘柄が正常に見えていた理由＝ここで `market_price_usd` が使われていた可能性が高い）

### 手順B：原因の根を断つ（正しい行で上書き）

1. ORCL と PFE で **市場更新ボタン**を押し、**JS 版 `valuations.refresh.js`** が呼ばれているログを確認
   （先頭に `console.log('[refresh-js] asset', assetId)` を入れて区別すると確実）
2. 直後に上の SQL(2) を再実行し、最新行が

   * `unit_price_jpy ≈ 正しい 1株円価格`
   * `value_jpy = unit_price_jpy × quantity`
   * `fx_context` に USDJPY が入っている
     ことを確認
3. `/api/assets` を再取得 → **ORCL は \$248台、PFE は \$26台** に戻るはず

※ もし `valuations` に `unit_price_jpy` カラムが無いなら、最初に一度だけ：

```sql
ALTER TABLE valuations ADD COLUMN unit_price_jpy REAL;
```

---

## よくある落とし穴（今回関係ありそうなもの）

* **古い TS 版 refresh が呼ばれている**（JS 版に差し替えたつもりでも、ts-node のフックで .ts が解決されがち）
  → ログで `[refresh-js]` が出るかを確認。
* **Yahoo `.co.jp` の行が混ざっている**（JPY → `fx_context` 無し）
  → `.com` 強制で再取得すれば新しい行が勝ちます。
* **quantity 変更前の行が「最新」として残っている**
  → 新しい行を積んだあと、UIは最新だけ読むので問題は自然解消。どうしても気持ち悪ければ当該古い行を削除。

---

## 追加でやると堅くなること（任意）

* `/api/valuations/refresh-all` も **同じ `fetchLatestUSQuote(...,{yahooHost:'com'})`** に統一
* **診断API**はこのまま常設（`/api/market/probe`）。「URL/価格/通貨」を一発で確認できます

---

> まとめ
> ORCL と PFE だけがおかしいのは「**その2銘柄だけ直近 valuation 行が壊れている**」から。
> 表示ロジックのフォールバックが働き、\*\*“株数で割り戻した 1/2 のUSD単価”\*\*に見えています。
> 上の **手順A（安全化）→手順B（正しい行で上書き）** をやれば解消します。