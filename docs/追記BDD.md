# 4. 価格・為替（オフライン優先）— 実装仕様 & BDD（ClaudeCode提出用）

> この章は「ローカル資産ポートフォリオアプリ — 最終BDD仕様 v2」の **第4章の完全置換版**です。コード実装指示とBDDを含み、即開発可能な粒度に落としています。

---

## 4.1 基本方針（実装規約）

* **既定は手動評価（offline）**。外部ネットワーク呼び出しは無効。
* **オンデマンド更新は明示的有効化時のみ**（ENV or 設定UI）。

  * ENV: `MARKET_ENABLE=1` で市場価格・為替の取得を許可。未設定/0 の場合、すべての外部取得を拒否し、HTTP 403 を返す。
  * プロセス起動時に設定をログへ明示: `market:disabled` / `market:enabled`。
* **プロバイダはプラガブル**。標準実装の優先度: `yahoo`（APIキー不要）→ `stooq`（フォールバック）→ `noop`（ダミー）。
* **キャッシュ前提**。成功時はキャッシュに保存、失敗時は直近キャッシュで継続。
* **UI 表示規約**: 取得状態バッジと\*\*最終更新時刻（JST）\*\*を明示（例: `最終更新: 2025-08-11 14:05 JST`）。
* **丸め/表示（既存仕様に整合）**:

  * 単価・価格表示は小数 **2桁**（円未満は切り捨て）。
  * 貴金属の重量は小数 **1桁**固定。
  * 内部計算は double（JS number）で保持、DB格納時は `value_jpy` を **2桁切り捨て→整数化** の順で評価ログへ保存。

## 4.2 データモデル拡張

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

## 4.3 プロバイダ IF（TypeScript）

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

## 4.4 キャッシュ戦略

* **キー設計**: `stock:<MIC or ccTLD>:<TICKER>`（例: `stock:US:GOOG`, `stock:JP:7974`）、`fx:<PAIR>`。
* **TTL**: 株価 = **15分**、為替 = **5分**。
* **更新ポリシ**:

  1. キャッシュ命中 & 未失効 → そのまま返す。
  2. 失効 → プロバイダへフェッチ。成功→キャッシュ更新。失敗→最後のキャッシュで返す + `stale=true` をUIに伝搬。
* **同時実行**: 同一キーの重複取得は in-memory ロックで抑止（リクエスト集約）。

## 4.5 API（新規/更新）

* `POST /api/valuations/:assetId/refresh`

  * **ガード**: `MARKET_ENABLE!=1` なら `403 { code:"market_disabled" }`。
  * **挙動**: 資産クラスに応じて株価/為替を解決し、`valuations` に1レコード追加。応答は `{ value_jpy, as_of, fx_context, stale }`。
* `POST /api/valuations/batch-refresh`

  * ボディ: `{ class?: 'us_stock'|'jp_stock'|'precious_metal'|'watch', assetIds?: number[] }`
  * セマンティクス: 指定集合を順次更新（内部キュー化、同時5並列）。
* `GET /api/market/status`

  * 応答: `{ enabled: boolean, provider: { stock: string, fx: string }, now: iso }`。

## 4.6 評価計算ルール

* **US株**: `value_jpy = roundDown2( price_usd * quantity * USDJPY )`。
* **日本株**: `value_jpy = roundDown2( price_jpy * quantity )`。
* **貴金属**（時価→単価の補助表示はUIで計算）: `unit_price_jpy = roundDown2( spot_jpy / weight_g )`、重量は1桁固定。
* **時計/コレクション/不動産**: 既定は手動（`manual`）。
* `roundDown2(x) = floor(x*100)/100`。必要に応じ整数円へ（小数保持時は拡張カラムを検討）。

## 4.7 失敗時の動作

* プロバイダ例外/ネットワーク不可:

  * 既定: 直近キャッシュで計算、UIに `stale` バッジ + 最終更新時刻。
  * キャッシュ無し: `502 { code:"upstream_unavailable" }` を返し、UIはトーストで通知。
* レート欠落（例: USDJPY 取得不可）: 依存資産の更新を**スキップ**して一括結果に `skipped` として返却。

## 4.8 UI 要件

* 各カードに `価格: ¥X（stale） / 最終更新: YYYY-MM-DD HH:mm JST`。
* ダッシュボード上部に `市場データ: 有効/無効` のトグル表示（無効時は説明ツールチップ）。
* 一括更新モーダル: 進捗（成功/失敗/スキップ件数）と所要時間、最後に `処理ログを表示` リンク。

## 4.9 ログ/監査

* `audit_log` に `valuation_refresh` を記録（`who, when, asset_id, from, to, provider, stale`）。
* `price_cache` は日次で TTL 超過行を掃除（起動時 + 毎時）。

## 4.10 BDD シナリオ

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
