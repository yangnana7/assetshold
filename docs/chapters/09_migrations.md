# 9. マイグレーション

## 9.1（要旨）
- comparable_sales / rebalance / valuations.unit_price_jpy を含むスクリプト適用済み前提
- `idx_valuations(asset_id, as_of DESC, id DESC)` で時系列取得を統一

## 9.2（現状）
- `20250813_comps.sql`（comparable_sales）  
- `20250813_rebalance.sql`（target_allocations, settings と既定の `tolerance_pct=5`）  
- `20250813_add_unit_price_to_valuations.sql` / `20250814_add_unit_to_valuations.sql`（`valuations.unit_price_jpy`、索引）