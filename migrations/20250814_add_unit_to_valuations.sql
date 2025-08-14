-- Migration: Add unit_price_jpy column to valuations table
-- Date: 2025-08-14
-- Purpose: Store unit price information for better market data tracking

-- Add unit_price_jpy column to valuations table
ALTER TABLE valuations ADD COLUMN unit_price_jpy REAL;

-- Create index for efficient asset valuation lookups
-- ORDER BY as_of DESC, id DESC ensures we get the most recent valuation
CREATE INDEX IF NOT EXISTS idx_valuations_asset_asof ON valuations(asset_id, as_of DESC, id DESC);

-- Create index on valuations.as_of for time-based queries
CREATE INDEX IF NOT EXISTS idx_valuations_asof ON valuations(as_of);