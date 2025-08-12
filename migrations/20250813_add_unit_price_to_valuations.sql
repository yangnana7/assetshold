ALTER TABLE valuations ADD COLUMN unit_price_jpy REAL;
CREATE INDEX IF NOT EXISTS idx_valuations_asset_asof ON valuations(asset_id, as_of);