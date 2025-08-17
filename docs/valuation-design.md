# 評価ロジック改善メモ（USD/JPY 両立・正確性向上）

- 目的: 「市場評価額/単価/ドルベース/円ベース」の不整合を解消し、全面的に正確に算出・保存できるようにする。

## 変更点（実装済み）
- fx_context を JSON で保存: `{ pair:'USDJPY', rate: <number>, as_of: <iso> }`
  - 互換性: 既存の文字列形式 `USDJPY@<rate>(<as_of>)` も読み取りフォールバック対応。
- valuations.unit_price_jpy を全クラスで保存（対応クラス: us_stock / jp_stock / precious_metal）
  - us_stock: `unit_price_jpy = USD単価 × USDJPYレート`
  - jp_stock: `unit_price_jpy = JPY単価`
  - precious_metal: 既存通り純度補正後の g 単価（JPY）
- 一括更新 `/api/valuations/refresh-all` でも unit_price_jpy を必ず INSERT
- 資産一覧の派生ロジックを整理
  - US株の `market_price_usd` は `us_stocks.market_price_usd` を優先
  - 次点で `valuation.unit_price_jpy / fx_context.rate` から算出
  - `fx_context` は JSON 優先、非JSONは従来の正規表現フォールバック
  - 任意の高額銘柄（>10000 USD など）も閾値排除せず正しく処理
- 損益の円換算は `fx_context.rate` を用いて統一（USD建てコスト × 現在レートで円換算 → 現評価との差分）

## スキーマ/移行
- SQLite スキーマ変更なし（`valuations.fx_context TEXT`, `valuations.unit_price_jpy REAL` は既存）
- 既存データ: 文字列形式の `fx_context` はそのまま利用可能（読取フォールバック）

## API 互換性
- 既存エンドポイント/レスポンス構造は維持
- `/api/valuations/:assetId/refresh` のレスポンスに `unit_price_jpy` を含む（元々の仕様と整合）

## 期待効果
- 米国株/日本株/貴金属の「単価」「評価額」を円ベースで一貫保存
- USD/JPY の双方表示・損益計算の精度向上
- キャッシュ（price_cache）と TTL の仕組みは維持しつつ、値の源泉と適用レートが追跡可能に

## 将来検討
- `fx_context` に `source`（供給元）や `provider_latency_ms` 等のメタ情報を追加
- 現金（外貨残高）クラスの自動円換算対応（現状は手動評価のまま）
- 追加通貨ペア（EURJPY など）への拡張
