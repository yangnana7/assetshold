# ローカル資産ポートフォリオアプリ — 統合仕様書

> **目的**: 株式、時計、貴金属、不動産など多様な個人資産を、外部に依存しない**完全ローカル環境**で安全に管理・評価・可視化する。

## 0\. 開発体制・基本情報

  * **ソースコード担当:** ClaudeCode
  * **受け入れテスト担当:** あなた
  * **実行環境:** Windows 11 / Ubuntu Server 24.04 LTS
  * **技術スタック:**
      * Backend: Node.js + Express
      * Database: SQLite (`data/portfolio.db`, WAL + 定期checkpoint)
      * Frontend: React + Vite + TanStack Table / Recharts
      * テスト: Vitest + Supertest（API）, Playwright（E2E）
  * **【注記】運用ホスト名/ポート:**
      * 本アプリのホスト名とポートは `assets.local:3009` とする。
      * **最重要規約（MUST FAIL）:** サーバーのポート番号は **`3009` に完全固定**する。環境変数等で `3009` 以外のポートが指定された場合、サーバーはエラーを出力して**起動に失敗しなければならない**。
      * （旧設計にあった家計簿アプリ `kakeibo.local:3008` との並走運用は、一旦スコープ外とする）

## 1\. 非機能要件

1.  **完全ローカル既定:** 外部API通信は既定で行わない。価格・為替取得は**ユーザーによる明示的な有効化時のみ**。
2.  **固定ポート:** ポートは `3009` に固定（上記参照）。
3.  **データ永続化:** SQLite (`data/portfolio.db`) を使用。1分ごとにWALからcheckpoint処理を行い、堅牢性を担保する。
4.  **監査ログ:** すべての作成/更新/削除操作について、差分（旧→新）と操作者を `audit_log` テーブルに記録する。
5.  **バックアップ:** アプリ停止時に `/backup/portfolio_YYYY-MM-DD_HHMM.db` という形式でDBのコピーを自動作成する（この機能は設定でON/OFF可能）。
6.  **言語/通貨:** UIは日本語、表示通貨はJPYを既定とする。**評価通貨としてJPY/USD/CNYの切り替え**に対応する。
7.  **権限管理:** `viewer`（閲覧のみ）と `admin`（全編集可）の2権限を設ける。未ログインユーザーはダッシュボードのみ閲覧可能。
8.  **データ規約:** `note`（備考）フィールドは、未入力の場合 **空文字列 `""`** として保存する（`null` や `undefined` は使用禁止）。
9.  **市場データ機能フラグ:** 環境変数 `MARKET_ENABLE=1` の場合のみ外部取得を許可。未有効時は市場系エンドポイントへのアクセスに対し **`403 { code: "market_disabled" }`** を返す。起動時ログに `market:enabled/disabled` を明示する。
10. **キャッシュ運用:** 市場データは運用上のキャッシュ（`price_cache`）で保持し、正本データではない。TTLは株価=15分、為替=5分。超過行は起動時および毎時にクリーンアップする（詳細は 4.4, 4.9 を参照）。

## 2\. ドメインモデル

### 2.1 共通エンティティ

  * **assets**: `id`, `class`, `name`, `note("")`, `acquired_at`, `book_value_jpy`, `valuation_source('manual'|'market_api'|'formula')`, `liquidity_tier('L1'|'L2'|'L3'|'L4')`, `tags(JSON)`
  * **valuations**: `id`, `asset_id`, `as_of`, `value_jpy`, `fx_context`
  * **attachments**: 証書・鑑定書等のファイル参照

### 2.2 クラス別テーブル（抜粋）

  * **us\_stocks:** `asset_id`, `ticker`, `exchange`, `quantity`, `avg_price_usd`
  * **jp\_stocks:** `asset_id`, `code`, `quantity`, `avg_price_jpy`
  * **watches:** `asset_id`, `brand`, `model`, `ref`, `box_papers(bool)`
  * **precious\_metals:** `asset_id`, `metal`, `weight_g`, `purity`
  * **real\_estates:** `asset_id`, `address`, `land_area_sqm`, `building_area_sqm`, `rights`
  * **collections:** `asset_id`, `category`, `variant`
  * **cashes:** `asset_id`, `currency`, `balance`

> **投資可能資金の定義:** `liquidity_tier`が `L1`（超流動資産）または `L2`（流動資産）のものを投資可能資金として算入する。CNYのカード決済枠は `credit_limits` テーブルで別途管理し、算入するかはオプションで提供する。

### 2.3 運用テーブル（キャッシュ）

  * **price_cache**: 市場データ（株価・為替）のキャッシュ用テーブル。アプリ動作のための補助であり、レポート等の正本ではない（スキーマや運用は 4.2, 4.4 を参照）。

### 2.4 リバランス設定

  * **target_allocations**: 目標配分（クラス別%）を保持。`class(TEXT PK)`, `target_pct(REAL)`。
  * **settings**: 各種設定。`('tolerance_pct', '5')` を既定とし、許容帯（±%）を管理。
  * 計算規則：配分合計は正規化して100%に揃える（未指定クラスは0%として扱い正規化に含める）。

### 2.5 Comparable Sales（コンプ）

  * **comparable_sales**: 類似取引のレジストリ。`id`, `asset_id`, `sale_date(YYYY-MM-DD)`, `price`, `currency(JPY既定)`, `price_jpy`, `source`, `source_url`, `marketplace`, `condition_grade`, `completeness`, `notes`, `created_at`, `updated_at`。
  * 価格換算：`currency!='JPY'` の場合は `price_cache('fx:<PAIR>')` を用いた換算で `price_jpy` を保存（取得不可時はエラー）。

## 3\. データ連携（CSVが正本）

  * **取り込み（CSV）:**
      * CSVファイルがデータの**正本 (Canonical Source)** となる。
      * CSVファイルの更新は**ファイルウォッチャー (`inotify`)** で自動検知し、差分をDBへUpsert（更新・追加）する。処理中は `import_lock` で排他制御を行う。
      * 管理画面から手動でのアップロードにも対応する。
  * **書き出し:**
      * `GET /api/export?format=csv|md|json` でDBからデータを書き出す。
      * `csv` と `json` はデータ交換用、`md` (Markdown) は人間が読むためのレポート用途とし、編集は非推奨とする。
  * **CSV仕様:** `UTF-8`, `LF`, ヘッダー行あり。カラムは以下の通り。
    ```
    class,name,note,acquired_at,book_value_jpy,valuation_source,liquidity_tier,tags,ticker,exchange,quantity,avg_price_usd,code,avg_price_jpy,brand,model,ref,metal,weight_g,purity,address,land_area_sqm,building_area_sqm,category,variant,currency,balance
    ```
  * **競合解決:** DBとCSVでデータが競合した場合、既定では**DBのデータを優先**する。`?force=csv` パラメータを付与することで、強制的にCSVのデータで上書きすることも可能。

## 4\\. 価格・為替（オフライン優先）— 実装仕様 & BDD（ClaudeCode提出用）

> この章は「ローカル資産ポートフォリオアプリ — 最終BDD仕様 v2」の **第4章の完全置換版**です。コード実装指示とBDDを含み、即開発可能な粒度に落としています。

---

### 4.1 基本方針（実装規約）

* **既定は手動評価（offline）**。外部ネットワーク呼び出しは無効。
* **オンデマンド更新は明示的有効化時のみ**（ENV or 設定UI）。

  * ENV: `MARKET_ENABLE=1` で市場価格・為替の取得を許可。未設定/0 の場合、すべての外部取得を拒否し、HTTP 403 を返す。
  * プロセス起動時に設定をログへ明示: `market:disabled` / `market:enabled`。
* **プロバイダはプラガブル**。標準実装の優先度: `google-finance`（スクレイピング, 取引所推定）→ `yahoo`（フォールバック）→ `noop`（ダミー）。
  * Stocks: Google Financeの銘柄ページ（例 `quote/AAPL:NASDAQ`, 日本株は4桁コードを `:TYO` に付与）。失敗時はYahooへフォールバック。
  * FX: Google Finance優先→マルチソース→Oanda/ExchangeRates→Yahoo→Noop。
  * Precious Metals: 田中貴金属（Tanaka）を優先、不可時はNoop。
* **キャッシュ前提**。成功時はキャッシュに保存、失敗時は直近キャッシュで継続。
* **UI 表示規約**: 取得状態バッジと\*\*最終更新時刻（JST）\*\*を明示（例: `最終更新: 2025-08-11 14:05 JST`）。
* **丸め/表示（既存仕様に整合）**:

  * 単価・価格表示は小数 **2桁**（円未満は切り捨て）。
  * 貴金属の重量は小数 **1桁**固定。
  * 内部計算は double（JS number）で保持、DB格納時は `value_jpy` を **2桁切り捨て→整数化** の順で評価ログへ保存。

### 4.2 データモデル拡張

* 既存 `valuations(id, asset_id, as_of, value_jpy, fx_context)` を使用。
* 追加テーブル:

```sql
CREATE TABLE IF NOT EXISTS price_cache (
  key TEXT PRIMARY KEY,      -- e.g. "stock:US:GOOG" / "fx:USDJPY"
  payload TEXT NOT NULL,     -- JSON { price, currency, as_of }
  fetched_at TEXT NOT NULL   -- ISO8601
);
```

* `fx_context` 例: `"USDJPY@146.71(2025-08-11T05:00:00Z)"`。

### 4.3 プロバイダ IF（TypeScript）

```ts
export type PricePoint = { price: number; currency: string; asOf: string }; // ISO8601
export interface StockProvider {
  name: string;
  getQuote(ticker: string, exchange?: string): Promise<PricePoint>;
}
export interface FxProvider {
  name: string;
  getRate(pair: "USDJPY" | "CNYJPY"): Promise<PricePoint>; // price = rate
}
```

* 実装クラス: `YahooProvider`, `StooqProvider`, `NoopProvider`。
* ファクトリ: `providers/registry.ts`

```ts
export function makeStockProvider(): StockProvider { /* envと到達性で選択 */ }
export function makeFxProvider(): FxProvider { /* 同上 */ }
```

### 4.4 キャッシュ戦略

* **キー設計**: `stock:<MIC or ccTLD>:<TICKER>`（例: `stock:US:GOOG`, `stock:JP:7974`）、`fx:<PAIR>`。
* **TTL**: 株価 = **15分**、為替 = **5分**。
* **更新ポリシ**:

  1. キャッシュ命中 & 未失効 → そのまま返す。
  2. 失効 → プロバイダへフェッチ。成功→キャッシュ更新。失敗→最後のキャッシュで返す + `stale=true` をUIに伝搬。
* **同時実行**: 同一キーの重複取得は in-memory ロックで抑止（リクエスト集約）。

### 4.5 API（市場データ）

* `POST /api/valuations/:assetId/refresh`

  * **ガード**: `MARKET_ENABLE!=1` なら `403 { code:"market_disabled" }`。
  * **挙動**: 資産クラスに応じて株価/為替を解決し、`valuations` に1レコード追加。応答は `{ value_jpy, as_of, fx_context, stale }`。
* `POST /api/valuations/refresh-all`

  * 実装済: 対応クラス（`us_stock|jp_stock|precious_metal`）を一括更新。
  * 備考: BDDの「batch-refresh」は本ルートに読み替える。
* `GET /api/market/status`

  * 応答: `{ enabled: boolean, provider: { stock: string, fx: string }, now: iso }`。
* `GET /api/market/fx/:pair`

  * 実装済: `pair` は `USDJPY` など。キャッシュとTTLに従い返却。

### 4.6 評価計算ルール

* **US株**: `value_jpy = roundDown2( price_usd * quantity * USDJPY )`。
* **日本株**: `value_jpy = roundDown2( price_jpy * quantity )`。
* **貴金属**（時価→単価の補助表示はUIで計算）: `unit_price_jpy = roundDown2( spot_jpy / weight_g )`、重量は1桁固定。
* **時計/コレクション/不動産**: 既定は手動（`manual`）。
* `roundDown2(x) = floor(x*100)/100`。必要に応じ整数円へ（小数保持時は拡張カラムを検討）。

### 4.7 失敗時の動作

* プロバイダ例外/ネットワーク不可:

  * 既定: 直近キャッシュで計算、UIに `stale` バッジ + 最終更新時刻。
  * キャッシュ無し: `502 { code:"upstream_unavailable" }` を返し、UIはトーストで通知。
* レート欠落（例: USDJPY 取得不可）: 依存資産の更新を**スキップ**して一括結果に `skipped` として返却。

### 4.8 UI 要件

* 各カードに `価格: ¥X（stale） / 最終更新: YYYY-MM-DD HH:mm JST`。
* ダッシュボード上部に `市場データ: 有効/無効` のトグル表示（無効時は説明ツールチップ）。
* 一括更新モーダル: 進捗（成功/失敗/スキップ件数）と所要時間、最後に `処理ログを表示` リンク。

### 4.9 ログ/監査

* `audit_log` に `valuation_refresh` を記録（`who, when, asset_id, from, to, provider, stale`）。
* `price_cache` は日次で TTL 超過行を掃除（起動時 + 毎時）。

### 4.10 BDD シナリオ

**シナリオ: オフライン既定でのブロック**

* **Given** `MARKET_ENABLE` 未設定
* **When** `POST /api/valuations/123/refresh`
* **Then** `403` を返し、本文に `market_disabled` を含む。

**シナリオ: 株価のキャッシュ利用（有効・期限内）**

* **Given** `MARKET_ENABLE=1` かつ `price_cache("stock:US:GOOG")` が5分以内
* **When** `POST /api/valuations/:id/refresh`
* **Then** 外部アクセスは発生せず、キャッシュで `value_jpy` を算出し `valuations` に保存。UIに `stale=false`。

**シナリオ: 外部失敗時のフォールバック**

* **Given** `MARKET_ENABLE=1` かつ キャッシュは存在するが失効
* **When** 外部取得がタイムアウト
* **Then** 直近キャッシュで計算し `stale=true` を応答に含める。UIに `stale` バッジを表示。

**シナリオ: キャッシュ未保持時の失敗**

* **Given** キャッシュ無し
* **When** 外部失敗
* **Then** `502 upstream_unavailable` を返して DB 変更無し。UI はトーストで通知。

**シナリオ: FX 取得がない場合のスキップ**

* **Given** USDJPY 取得不可
* **When** US株の一括更新
* **Then** 対象資産の `refresh` は `skipped` として戻り、処理サマリに `skipped` 件数を含む。

**シナリオ: UIの最終更新表示**

* **Given** 直近成功キャッシュ `as_of=2025-08-11T05:00:00Z`
* **When** ダッシュボード表示
* **Then** カードに `最終更新: 2025-08-11 14:00 JST` が表示される（JST換算）。
## 5\. 画面仕様

### 5.1 未ログイン（閲覧専用ダッシュボード）

  * 純資産総額（NAV）、アセットクラス別配分（円グラフ）、資産総額の月次推移（折れ線グラフ）、高額資産Top3を表示。
  * 【注記】高額資産の備考表示では、空の括弧 `()` や `(undefined)` の表示を禁止する。
  * 検索、並び替え、CSVエクスポート機能を提供。

### 5.2 ログイン後（admin権限）

  * **資産一覧:** インライン編集、部分更新（PATCH）、バリデーション機能を備えたテーブル。
  * **新規登録ウィザード:** アセットクラスを選択後、必要な項目を入力して登録。
  * **一括処理:** CSVの手動インポートと、CSV/Markdown/JSON形式でのエクスポート。
  * **評価更新:** 手動での評価額入力、およびオンデマンドでの市場価格取得。
  * **リバランス試算:** 目標配分（ポートフォリオ）との乖離を計算し、売買候補と税引後見込み額を提示。
  * **不動産ユーティリティ:** 表面/実質利回りの計算、返済計画シミュレーション、目標利回りに必要な物件価格の逆算など。

### 5.3 市場データ表示規約

  * 画面上部に `市場データ: 有効/無効` のトグルと現在状態を表示（無効時は説明ツールチップ）。
  * 各資産カードに `価格: ¥X（stale） / 最終更新: YYYY-MM-DD HH:mm JST` を表示。`stale` はキャッシュ失効・フォールバック時に表示。
  * 一括更新モーダルに処理サマリ（成功/失敗/スキップ件数、所要時間）と「処理ログを表示」リンクを表示。
  * 丸め規則は 4.1 に準拠（価格は小数2桁切り捨て、重量は1桁表示）。

### 5.4 リバランス（最小UI）

  * 目標配分設定ビュー：クラス別ターゲット（%）と許容帯（±%）を編集。保存時は合計を自動正規化し、現在値と目標値をプレビューする。
  * ドリフト監視：現在配分・目標・許容帯を同一グラフで表示。逸脱（breach）クラスを強調表示。
  * プラン算出モーダル：`to=target|mid` 切替、`minTrade` 指定、結果としてクラス別の増減見込みと資産レベルの按分候補を表示。CSVエクスポート可。
  * 実行は提案（オフライン計画）に留める。売買の実行はサポートせず、ユーザー運用に委ねる。

### 5.5 Comparable Sales レジストリ（最小UI）

  * 資産詳細に「Comparable Sales」タブを追加。過去取引のリスト（日時/金額/通貨/ソース/備考）を表示し、追加・編集・削除を提供。
  * 推定（Estimate）ボタン：外れ値除去（MAD）と重み付き中央値/平均を選択でき、推定値と信頼度スコアを表示。`commit` で `valuations` に反映可能。

### 5.6 編集UIの統合（詳細編集 + 数量編集）

  * 単一の編集ドロワー/ダイアログに統合し、共通フィールド（`name, note, acquired_at, liquidity_tier` など）とクラス別フィールド（例: 株の `quantity`, 平均単価; 貴金属の `weight_g`, 純度）を同画面で編集・保存。
  * 保存は1回の送信でサーバへ。サーバはトランザクションで両方を更新し、必要に応じ簿価再計算（`recalcBookValue`）と市場価格のオプション更新を実行。
  * 簿価のプレビュー（変更入力に応じた見込み値）と、エラー表示（数量は整数, 重量は正の数など）を即時検証で提示。
  * 通貨換算は `price_cache` を用いる。必要なFXが無い場合はUIで警告し、先に市場データの取得を案内。

## 6\. API仕様（REST）

  * `GET /api/assets`: 資産一覧取得（クラス等でフィルタ可能）。
  * `POST /api/assets`: 新規資産登録。
  * `PATCH /api/assets/:id`: 既存資産の部分更新（共通フィールド＋クラス別フィールドを同時に更新可）。
    - 入力: 共通 `{ name?, note?, acquired_at?, book_value_jpy?, valuation_source?, liquidity_tier?, tags? }` と、クラス別（例）
      - US株 `{ class:'us_stock', quantity?, avg_price_usd? }`
      - JP株 `{ class:'jp_stock', quantity?, avg_price_jpy? }`
      - 貴金属 `{ class:'precious_metal', weight_g?, purity?, unit_book_cost_jpy_per_gram? }`
    - 仕様: サーバは単一トランザクションで適用し、必要に応じ簿価再計算（`recalcBookValue`）を実行。`note` は未入力時に空文字で保存。
    - 応答: 更新後の資産スナップショット（将来的に再計算結果と市場メタを含む）。
  * `DELETE /api/assets/:id`: 資産削除。
  * `POST /api/import/csv`: CSVファイルの手動インポート。
  * `GET /api/export?format=csv|md|json`: 各形式でのデータ書き出し（実装済）。
  * `GET /api/export/full-database`: テーブル横断の包括CSVを出力（実装済）。
  * `POST /api/valuations/:assetId/refresh`: 市場価格・為替のオンデマンド更新（明示的有効化時のみ、詳細は 4.5）。`MARKET_ENABLE!=1` の場合は **`403 { code:"market_disabled" }`**。
  * `POST /api/valuations/refresh-all`: 対応クラスの一括更新（実装済, 詳細は 4.5）。
  * `GET /api/market/status`: 市場データ機能の有効/無効およびプロバイダ状況（詳細は 4.5）。
  * `GET /api/market/fx/:pair`: 為替レート取得（実装済）。
  * `GET /api/rebalance/targets`（要実装）: 目標配分と許容帯の取得。
  * `POST /api/rebalance/targets`（要実装）: 目標配分・許容帯の更新（合計は内部で正規化）。
  * `GET /api/rebalance/plan?to=target|mid&tol=±%&minTrade=JPY`（要実装）: 現在配分と比較したリバランス案の算出（CSV出力は `format=csv` で対応）。
  * `GET /api/comps/:assetId`（要実装）: 資産に紐づくComparable Sales一覧取得。
  * `POST /api/comps/:assetId`（要実装）: Comparable Salesの追加（通貨換算は `price_cache` を使用）。
  * `PATCH /api/comps/:compId`（要実装）: Comparable Salesの部分更新。
  * `DELETE /api/comps/:compId`（要実装）: Comparable Salesの削除。
  * `POST /api/comps/:assetId/estimate`（要実装）: コンプからの推定値の計算（手法・半減期指定可）。
  * `POST /api/comps/:assetId/commit`（要実装）: 推定値を `valuations` に反映。
  * **認可:** 未ログインユーザーは `GET /api/dashboard` のみ許可。その他のAPI、特に編集系（POST, PATCH, DELETE）へのアクセスは **`401 Unauthorized`** を返す。

## 7\. BDDシナリオ（統合・完全版）

### 7.1 認証とアクセス制御

  * **未ログインでのアクセス:**

      * **Given** ユーザーが未ログイン状態でアプリにアクセスする。
      * **When** ページが読み込まれる。
      * **Then** 閲覧専用ダッシュボードが表示され、右上に「ログイン」ボタンのみが表示される。編集UIは一切表示されない。

  * **APIレベルでのアクセスブロック:**

      * **Given** 未ログインのユーザーがいる。
      * **When** ツール等で `POST /api/assets` を直接呼び出す。
      * **Then** サーバーはステータスコード **`401 Unauthorized`** を返す。

  * **adminログインと自動リダイレクト:**

      * **Given** `admin`ユーザーがログインページにいる。
      * **When** 正しい認証情報でログインする。
      * **Then** メインの資産一覧ページ（またはダッシュボード）へ**自動的にリダイレクト**される。
      * **And** 画面上部に「資産一覧」「一括インポート」等のナビゲーションが表示され、全ての機能が利用可能になる。

### 7.2 登録・編集・削除

  * **備考付き新規登録:**

      * **Given** `admin`ユーザーがログインしている。
      * **When** 必須項目に加え、`note`に `"2025年購入の保証書付き"` と入力して資産を登録する。
      * **Then** 一覧に新しい記録が `note` 付きで表示され、DBにもその値が保存される。

  * **`note`の部分更新:**

      * **Given** `note`が空文字の既存資産がある。
      * **When** その資産の `note` のみを `"外箱に傷あり"` に更新し保存する (`PATCH /api/assets/:id`)。
      * **Then** 他のフィールドは保持されたまま `note` のみ更新され、再読込後も表示が継続する。

  * **安全な削除:**

      * **Given** `admin`ユーザーが資産を削除しようとしている。
      * **When** 削除ボタンを押し、確認ダイアログで「OK」をクリックする。
      * **Then** 該当データはDBから削除されるが、`audit_log` には削除の記録が残る。

  * **詳細＋数量の統合編集:**

      * **Given** `admin`ユーザーが編集ドロワーで共通フィールドとクラス別フィールドを同時に修正する。
      * **When** `PATCH /api/assets/:id` に単一リクエストで送信する。
      * **Then** サーバはトランザクションで両方を更新し、簿価を再計算する。成功後に更新後スナップショットが返る。

### 7.3 ドリフト監視とリバランス計画

  * **逸脱の検出（breach）:**

      * **Given** 目標配分（`target_allocations`）と許容帯（`settings.tolerance_pct=5`）が設定されている。
      * **When** 現在配分を集計する（評価額が無い資産は簿価で代替）。
      * **Then** クラス別に `min=max(target-5,0)`, `max=min(target+5,100)` を計算し、`cur_pct` が範囲外のクラスは `breach=true` と判定される。

  * **プラン算出（to=target/mid）:**

      * **Given** `to=mid` が選択されている。
      * **When** 許容帯の中央値に向けて必要額を計算し、`minTrade=10000` を指定する。
      * **Then** 各クラスの増減見込みが丸められ、資産レベルでは流動性（L1→L4）と金額の大きさを優先して按分候補が提示される。CSV出力は小数点なしのJPY整数で出力される。

### 7.4 Comparable Sales からの推定

  * **コンプの追加と通貨換算:**

      * **Given** `asset_id=42` の詳細画面で、`price=2,000` `currency=USD` のコンプを追加する。
      * **When** `price_cache('fx:USDJPY')` にレートがある。
      * **Then** `price_jpy` は自動換算され、レコードが保存される。

  * **推定（外れ値除去＋重み付き中央値）:**

      * **Given** 10件のComparable Salesが登録済み（うち2件は外れ値）。
      * **When** 推定を実行（手法=`wmad`, 半減期90日）。
      * **Then** 外れ値は除外され、残りに条件/付属品/ソース/鮮度の重みを適用した**重み付き中央値**が `estimate_jpy` として返る。`confidence` スコアが 0-100 で返る。

  * **推定の反映（commit）:**

      * **Given** 推定結果 `estimate_jpy=1,500,000` `confidence=78`。
      * **When** `commit` を実行する。
      * **Then** `valuations` に新規レコードが追加され、`fx_context` 等に `{source:'comps', confidence:78}` が保存される。

### 7.3 CSV同期

  * **手動インポート:**

      * **Given** `admin`が「一括インポート」画面を開いている。
      * **When** 規約に準拠したCSVファイルをアップロードし、インポートを実行する。
      * **Then** 検証後に差分がDBにUpsertされ、画面に処理件数が表示される。`audit_log` にも記録が残る。

  * **ファイルウォッチによる自動同期:**

      * **Given** 監視対象の `data/portfolio.csv` がサーバー上に存在する。
      * **When** このファイルが外部から更新・保存される。
      * **Then** `inotify` が変更を検知し、差分をDBへ自動で適用する。ダッシュボードに変更が即時反映される。

  * **不正なCSVからの保護:**

      * **Given** ヘッダーが欠けているなど、規約に違反したCSVファイルがある。
      * **When** このファイルでインポートまたは自動同期が試みられる。
      * **Then** DBへの変更は一切行われず、トランザクションは安全に**ロールバック**される。画面またはログに原因を示すエラーメッセージが出力される。

### 7.4 ダッシュボードの可視化

  * **高額資産Top3の表示規約:**

      * **Given** 資産A (`name="純金小判"`, `note="50g"`) と資産B (`name="Kudoke 2 Indigo"`, `note=""`) がある。
      * **When** ダッシュボードが表示される。
      * **Then** 資産Aは `純金小判 (50g)` と表示され、資産Bは `Kudoke 2 Indigo` と表示される（**空の括弧 `()` は表示されない**）。

  * **アセットクラス別配分（円グラフ）:**

      * **Given** 複数のアセットクラス（日本株、米国株、時計など）の資産が登録されている。
      * **When** ダッシュボードが表示される。
      * **Then** 各クラスの**時価評価額の合計**に基づいた構成比率が、円グラフで正しく表示される。

  * **【新規追加】資産総額の月次推移（折れ線グラフ）:**

      * **Given** 複数月にわたって、資産の簿価と評価額のデータが記録されている。
      * **When** ダッシュボードが表示される。
      * **Then** X軸を年月、Y軸を金額とする折れ線グラフが表示される。
      * **And** 「簿価総額」と「評価額総額」の2本の線が、各月末時点の合計額を正しくプロットする。

### 7.5 サーバー運用と検証

  * **ポート固定の検証:**
      * **When** `PORT=3008 node server.js` のように、**`3009` 以外のポート**を指定して起動を試みる。
      * **Then** アプリは起動せず、エラーメッセージを出力して終了する。
      * **When** `node server.js` または `PORT=3009 node server.js` で起動する。
      * **Then** アプリはポート **`3009`** で正常に待受状態になる。

-----

## 8\. セキュリティと運用

  * **セキュリティ:**
      * ローカルセッション管理とCSRF対策を実装する。
      * パスワードはArgon2を用いてハッシュ化して保存する。
      * **オフライン既定**を貫き、ユーザーが許可しない限りプロセス外へのデータ送信は一切行わない。
  * **運用（Ubuntu 24.04）:**
      * **systemd:** `assets.service` としてサービス化し、サーバー再起動時にも自動で立ち上がるようにする。
      * **Nginx/Avahi:** `assets.local` という名前でLAN内からアクセスできるよう、リバースプロキシとmDNSを設定する。
      * **バックアップ:** `portfolio.db` を日次で個別にローテーションバックアップする。
      * **監視:** CSVの自動同期に失敗した際は、ローカルにメールまたはログで通知する。
      * **ドリフト監視:** 1日1回（既定）リバランス判定をバッチ実行。`breach` がある場合はダッシュボードにバッジ表示し、管理者に通知（ローカル通知/ログ）。閾値は `settings.tolerance_pct` を参照。

## 9\. 今後の拡張案

  * PWA対応によるスマートフォンでの閲覧性向上
  * 税務申告用レポート（配当・譲渡所得）の自動生成
  * 目標ポートフォリオに基づいた自動リバランス提案（税金考慮）
  * オフラインでのリスク分析（資産間の相関、ボラティリティ計算）

