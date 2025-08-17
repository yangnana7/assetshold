# Market Scrape Probe Kit — 20250817_1806

クリック時のみの取得／直APIなし。ティッカー照合と実際の取得URL・価格・通貨を**診断**するための最小キット。

- 診断API: `GET /api/market/probe?ticker=ORCL&exchange=NYSE&providers=yahoo,google,marketwatch&yahoo_host=com`
- Yahooの**ドメイン指定**が可能（`com`=USD、`co.jp`=JPY傾向）
- 集約は USD のみで中央値（±1%超の乖離で `confidence: "conflict"`）

構成:
- `symbol_registry.json` — ティッカー辞書（ORCL など事前収録）
- `src/market/*` — resolver / fetcher / providers / aggregate / orchestrator
- `src/routes/market.probe.ts` — 診断用ルート
- `src/routes/valuations.refresh.ts` — `/api/valuations/:assetId/refresh` 用の実装例（`yahooHost` 指定可）
