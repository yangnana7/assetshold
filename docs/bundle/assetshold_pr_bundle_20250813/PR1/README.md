# PR1: DBマイグレーション & バグ修正

- `valuations` に `unit_price_jpy REAL` を追加
- 直近評価の ORDER BY を `as_of DESC, id DESC` に統一
- サーバ起動時に migrations を自動適用する簡易スクリプトを追加
