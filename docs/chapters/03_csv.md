# 3. データ連携（CSV正本・コード準拠）

- **取込**: `POST /api/import/csv`（Multer・10MB）。トランザクションで Upsert。  
- **書出**: `GET /api/export`、`GET /api/export/full-database`。  
- **必須ヘッダ**: `class,name,acquired_at,book_value_jpy,liquidity_tier`  
- **推奨ヘッダ**（コードの `server/csv/schema.js` 相当）:
  ```
  class,name,note,acquired_at,book_value_jpy,valuation_source,liquidity_tier,tags,
  ticker,exchange,metal,weight_g,purity,address,lot,unit,quantity
  ```
- 厳格検証: enum/日付/金額範囲/流動性Tier。失敗時は行番号つきエラー。  
- 競合: 既定 **DB優先**、`?force=csv` でCSV強制。