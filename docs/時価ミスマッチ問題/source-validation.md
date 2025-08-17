要件は「直接なAPIなし」「定期更新なし」「ボタン押下時に正確な時価を取る」。根本は**ティッカー照合の失敗**と**ソース揺れ**です。下記の設計で解決できます。

# 方針（結論）

* **1) シンボル解決を先に“絶対に”正す**：入力（`ticker`＋`exchange`）→各サイト用の**クエリキー**へ正規化（例: BRK.B→YahooはBRK-B、StooqはBRK-B、GoogleはBRK.B）。
* **2) 直APIは使わず“HTMLページの埋め込みJSON”を単発取得**：Yahoo/Google/MarketWatch などの**公開銘柄ページ**を**ユーザー操作時のみ**1回GET→HTML内の構造化JSONから価格抽出。
* **3) 複数ソースで**クロスチェック（±0.5〜1.0%以内で一致→採用／乖離→ユーザーに選択UI）。
* **4) すべて失敗時は“証跡付き手動入力”で即保存**（URL＋スクショ可）。
* **5) すべてを**サーバー側一発API（`/api/valuations/:assetId/refresh`）で完結、**常時は無音**（定期ジョブなし）。

---

# アーキテクチャ

## A. シンボル解決（Symbol Resolver）

**目的**：ティッカー→各サイトの“検索キー”に**決定的に**変換し、ソース間ギャップを潰す。

* 仕様

  * 入力: `{ticker, exchange?}`。出力:

    ```json
    {
      "canonical": "BRK.B",
      "yahoo": "BRK-B",
      "google": "BRK.B:NYSE",
      "marketwatch": "BRK.B",
      "stooq": "brk-b.us"   // 非既定
    }
    ```
  * 正規化ルール（US想定）

    * 大文字化、空白除去、俗記号正規化（`.`↔`-`）：`BRK.B`⇄`BRK-B`、`BF.B`⇄`BF-B` 等
    * 取引所を明示（Googleは `AAPL:NASDAQ` / `BRK.B:NYSE`）
    * 既知別名（旧ティッカー、クラス株 A/B 等）を辞書で吸収
* 実装

  * `symbol_registry.json`（アプリ同梱・**手動更新のみ**）

    * フィールド：`canonical`, `aliases[]`, `exchange`, `google_key`, `yahoo_key`, `marketwatch_key` …
    * 範囲：主要US銘柄＋**手元保有銘柄**は必ず収録
  * フォールバック：ルール変換＋**ワンショット検索**（YahooのサジェストHTML/JSONを1回叩いて候補→確定）
    ※“API”ではなく、公開ページの**HTML**に含まれる候補文字列を解析

> ポイント：**自動で定期更新しない**。新規銘柄が増えた場合だけ**手動でレジストリ更新**か、初回取得時の**一回だけ補助検索**で辞書に追記保存。

---

## B. プロバイダ（HTMLスクレイパ）

**“API禁止”なので**公開ページの**HTML**から**埋め込みJSON**を読む。1ボタン押下で**短時間に最大2〜3ソース**だけ叩く。

* 既定順（高速・安定順）

  1. **Yahoo Finance（HTML）**

     * 価格は `<script>` 埋め込み JSON（`currentPrice`/`regularMarketPrice` 等）から抽出
     * 検証：`currency == "USD"`、`exchangeName` が `NasdaqGS/Nyse` など
  2. **Google Finance（HTML）**

     * 本文や `aria-label`／`data-*` 属性に現在値が入る。埋め込みJSON/メタから取得
  3. **MarketWatch（HTML）**

     * `instrument` スクリプト内JSONなどから価格・通貨を抽出
* 非既定の補助（明示フラグ時のみ）

  * **Stooq CSV**（HTTPダウンロードだが事実上API的、**標準は無効**）
* 共通仕様

  * **User-Agent** をブラウザ相当、1クリックで最大3リクエスト、**並列2本**まで
  * タイムアウト 3s／リトライなし。HTML保存（5分だけキャッシュ、**定期フェッチなし**）

---

## C. 集約 & 検証

* 単位・通貨：**USD**で一致必須。違えば破棄
* 値の整合：中央値採用。最大値・最小値が中央値から **±1.0%** 超過→**要確認**（UIでソースと値を見せて選択）
* 時刻：取引時間外は「前日終値」vs「プレ/アフター」混在に注意

  * 既定：**正規“最新”価格優先**（`regularMarketPrice` | `last`). UIで「終値に固定」をトグル可
* 出力：`{ price_usd, source, fetched_at, proof: { provider, url }[] }` を `valuations.fx_context` に書き残す（証跡）

---

## D. UIフロー（“市場更新”ボタンのみ）

1. ユーザーが一覧 or 詳細で**市場更新**を押下
2. サーバが Resolver→Providers→検証→`valuations` 追記
3. UIは**更新結果**（価格、ソース、取得時刻、差分）をトースト＋行バッジで表示
4. 乖離あり時は**モーダル**で「どれを採用？」（ラジオ＋各ソースの値とURL）→採用後に保存
5. 全失敗→**手動入力**ボタン（URL必須）→即保存

---

# API/実装仕様（変更最小）

* 既存：`POST /api/valuations/:assetId/refresh`

  * ボディ：`{ mode?: "latest"|"close", allow_noncanonical?: 0|1 }`
  * 返却：

    ```json
    {
      "assetId": 123,
      "price_usd": 234.56,
      "confidence": "single|agree|conflict",
      "sources": [
        {"name":"yahoo","price":234.50,"url":"..."},
        {"name":"google","price":234.60,"url":"..."}
      ],
      "valuation_id": 456,
      "note": "Yahoo HTML embedded JSON / 2025-08-16T..."
    }
    ```
* 新設（任意）：`GET /api/market/resolve?ticker=BRK.B&exchange=NYSE`

  * 返却：各サイト用キー。UIの「原因切り分け」に使う
* サーバ構成

  * `market/resolve.ts`（正規化と辞書）
  * `market/providers/yahoo_html.ts`, `google_html.ts`, `marketwatch_html.ts`
  * `market/aggregate.ts`（中央値・乖離判定）
  * `market/adapters.ts`（共通IF：`fetchQuote(queryKey): {price, currency, ts, url}`）
* テスト（超重要）

  * **HTMLフィクスチャ**（AAPL, MSFT, BRK.B, BF.B, GOOG/GOOGL）を `__fixtures__/html/*.html` に保存し**オフライン単体テスト**
  * 主要ケース

    * `.`↔`-` 変換（BRK.B / BF.B）
    * 取引所違い（`NYSE` vs `NASDAQ`）
    * プレ/アフターの数字が混在→`mode` で選択
    * 価格不一致（Googleだけズレ）→**conflict** 分岐
    * サイト構造変更 → フィクスチャで**パーサの堅牢性**をCIで守る

---

# BDD追記（差分）

## 4.x US株 — シンボル解決＆単発取得

* **Given** US株資産（`ticker` と `exchange` を保持）
* **When** ユーザーが「市場更新」を押す
* **Then** サーバは `symbol_registry.json` を使って各サイト用キーを導出し、Yahoo/Google/MarketWatch の**HTMLを1回ずつ**取得→埋め込みJSONを解析→**USDで一致する中央値**を採用し `valuations` を追記
* **And** 乖離>1.0% なら**選択モーダル**が表示され、選んだ値が採用される
* **And** すべて失敗なら**手動入力**（価格＋URL必須）で即保存

## 1.x 非機能

* 定期ジョブでの市場更新は**無効**。**ユーザー操作時のみ**外部取得
* 取得HTMLは5分キャッシュ、UIに\*\*最終取得時刻（JST）\*\*を表示
* 取得の証跡（URL, provider, ts）は `valuations.fx_context` に保存

---

# 擬似コード（サーバ：Node/TypeScript）

```ts
// market/resolve.ts
export function resolveKeys(ticker: string, exchange?: string) {
  const t = normalize(ticker); // upper, trim, dot/dash rule
  const x = (exchange||"").toUpperCase();
  const yahoo = t.replace(".", "-");
  const google = `${t}:${x || guessExchange(t)}`;
  const marketwatch = t;
  return { canonical: t, yahoo, google, marketwatch };
}

// market/providers/yahoo_html.ts
export async function fetchYahoo(key: string) {
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(key)}`;
  const html = await fetchHtml(url);
  const data = extractJson(html); // <script> window.__... JSON から
  const p = data?.price?.regularMarketPrice ?? data?.price?.currentPrice;
  const cur = data?.price?.currency || "USD";
  return { price: Number(p), currency: cur, ts: Date.now(), url };
}

// market/aggregate.ts
export function aggregate(quotes: Quote[]): {price:number, confidence:"single"|"agree"|"conflict"} {
  const usd = quotes.filter(q => q.currency === "USD" && isFinite(q.price));
  if (!usd.length) throw new Error("no_usd_quote");
  if (usd.length === 1) return { price: usd[0].price, confidence:"single" };
  const prices = usd.map(q => q.price).sort((a,b)=>a-b);
  const median = prices[Math.floor(prices.length/2)];
  const maxDev = Math.max(...prices.map(v => Math.abs(v/median - 1)));
  return { price: median, confidence: maxDev > 0.01 ? "conflict" : "agree" };
}
```

---

# この設計で満たすもの

* **APIキー不要／直API不使用**：公開**HTML**のみ、クリック時だけ取得
* **定期更新なし**：ボタン押下時のみ実行、キャッシュは短期
* **正確性**：シンボル解決＋**複数ソース中央値**＋**乖離検知**で実用的に堅い
* **保守性**：パーサは**HTMLフィクスチャでテスト**、崩れても即検知／辞書は手動更新のみ
* **UX**：失敗時の**証跡付き手動入力**で必ず前進できる
