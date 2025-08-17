ファイル一式をまとめました。クリック時だけ公開HTMLから価格を抽出する**スクレイピング方式**の実装キットです（APIキー不要／定期更新なし）。

[Download: market\_scrape\_kit\_20250817\_0000.zip](sandbox:/mnt/data/market_scrape_kit_20250817_0000.zip)

中身（主なファイル）：

* `symbol_registry.json`（BRK.B / BF.B などの表記差を吸収する辞書・手動更新前提）
* `src/market/resolve.ts`（各サイト用キーへ正規化）
* `src/market/fetchHtml.ts`（UA付きHTML取得・3sタイムアウト・5分キャッシュ）
* `src/market/providers/yahoo_html.ts` / `google_html.ts` / `marketwatch_html.ts`（埋め込みJSON/タグから抽出）
* `src/market/aggregate.ts`（USDのみ→中央値→±1%乖離判定）
* `src/market/index.ts`（並列取得→集約のメイン関数）
* `src/routes/valuations.refresh.ts`（`/api/valuations/:assetId/refresh` ハンドラ雛形）
* `src/__fixtures__/html/README.txt`（オフラインテスト用のHTMLサンプル配置先）

導入メモ（最短ルート）

1. 依存を追加: `npm i undici cheerio zod`（cheerioは今回は未使用でも可）
2. 既存サーバの `/api/valuations/:assetId/refresh` を `refreshValuationHandler` に差し替え
3. `symbol_registry.json` に**保有銘柄**を追加（A/B株や `.`↔`-` の差を埋める）
4. UIの「市場更新」ボタンから `ticker`/`exchange` を POST（既存のBDDどおり）

必要なら、CI用の**HTMLフィクスチャ**やパーサの**単体テスト**雛形も追加します。
