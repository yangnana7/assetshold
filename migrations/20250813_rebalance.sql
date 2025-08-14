CREATE TABLE IF NOT EXISTS target_allocations(
  class TEXT PRIMARY KEY,
  target_pct REAL NOT NULL CHECK(target_pct >= 0)
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 既定: 許容 ±5%
INSERT OR IGNORE INTO settings(key, value) VALUES ('tolerance_pct', '5');