# Server Debug Patch — 20250817_202841

追加するだけで、修正が反映されているか/どの分岐でUSD単価を決めたかを確認できます。

## 追加ルート
- `GET /api/debug/version` — ビルド識別子・Node・DBパス等
- `GET /api/debug/asset/:assetId` — /api/assets と同じ決定ロジックで
  `unitUsd` と `branch`（どの分岐で決定したか）を返す

## server.js への追記
```js
const debugRoutes = require('./src/routes/debug.tools');

app.set('db', db);          // 既にあるなら不要
app.set('dataDir', dataDir);
app.set('dbPath', dbPath);

app.get('/api/debug/version', debugRoutes.version);
app.get('/api/debug/asset/:assetId', debugRoutes.assetTrace);
```

## 期待する branch 値
- `valuation_unit` … valuation.unit_price_jpy / fx_context.rate（正常）
- `market_price_usd` … us_stocks.market_price_usd を採用（正常）
- `valuation_value_fallback` … 円の割戻し（**NG**）
