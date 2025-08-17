# Market Scrape Kit (no direct API) — 20250817_1733
クリック時のみ、公開HTMLの埋め込みJSONからUS株の時価を取得する最小実装。
- symbol_registry.json（手動更新の辞書）
- src/market/resolve.ts（正規化と各サイト用キー）
- src/market/fetchHtml.ts（HTML取得・3sタイムアウト・5分キャッシュ）
- src/market/providers/*（Yahoo/Google/MarketWatchの抽出）
- src/market/aggregate.ts（USDのみ→中央値→±1%乖離）
- src/market/index.ts（並列取得→集約）
- src/routes/valuations.refresh.ts（/api/valuations/:assetId/refresh ハンドラ雛形）
