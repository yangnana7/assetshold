# 4. 価格・為替（オフライン優先）

- 既定は**手動評価**。`MARKET_ENABLE=1` のときのみ外部取得。  
- **プロバイダ優先度**（registry）:  
  - 株価: Yahoo → GoogleFinance → noop  
  - 為替: Yahoo/Google/ExchangeRates/Oanda を MultiSource → noop  
  - 貴金属: 田中貴金属（tanaka）→ noop  
- **キャッシュ**: `price_cache`（TTL: 株15分/FX5分）。`stale` をUI表示。  
- **API**:  
  - `POST /api/valuations/:assetId/refresh`  
  - `POST /api/valuations/refresh-all`  
  - `GET /api/market/status` / `GET /api/market/fx/:pair`