-- 「重複統合」機能の改修案マイグレーション
-- accounts テーブルの新設と既存テーブルへのaccount_id追加

BEGIN TRANSACTION;

-- 5.1 accounts テーブル新設
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broker TEXT NOT NULL,
  account_type TEXT NOT NULL,      -- tokutei / ippan / nisa
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5.2 既存 us_stocks / jp_stocks に account_id 追加
ALTER TABLE us_stocks ADD COLUMN account_id INTEGER;  -- NULL許容で追加
ALTER TABLE jp_stocks ADD COLUMN account_id INTEGER;  -- NULL許容で追加

-- 5.3 既存レコードの仮付与（Default Account を1件作成）
INSERT INTO accounts (broker, account_type, name)
VALUES ('default', 'tokutei', 'Default Account');

UPDATE us_stocks SET account_id = (SELECT id FROM accounts WHERE broker='default' LIMIT 1)
 WHERE account_id IS NULL;
UPDATE jp_stocks SET account_id = (SELECT id FROM accounts WHERE broker='default' LIMIT 1)
 WHERE account_id IS NULL;

-- 5.4 論理一意（インデックス）
-- Note: Skipping unique indexes for now due to existing duplicates
-- These will be created after duplicate consolidation in future migrations
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_us_unique_ticker_account
--   ON us_stocks (UPPER(TRIM(ticker)), account_id);
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_jp_unique_code_account
--   ON jp_stocks (UPPER(TRIM(code)), account_id);

COMMIT;