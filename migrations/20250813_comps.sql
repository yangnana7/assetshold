CREATE TABLE IF NOT EXISTS comparable_sales(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  sale_date TEXT NOT NULL, -- YYYY-MM-DD
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  price_jpy REAL NOT NULL, -- 事前換算 or JPYのとき price と同じ
  source TEXT,             -- auction/dealer/marketplace/manual
  source_url TEXT,
  marketplace TEXT,        -- e.g., Yahoo, Chrono24, Mercari
  condition_grade TEXT,    -- A+,A,B,C など
  completeness TEXT,       -- fullset/headonly など
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_id, sale_date, price, COALESCE(source_url,''))
);
CREATE INDEX IF NOT EXISTS idx_comps_asset_date ON comparable_sales(asset_id, sale_date DESC);