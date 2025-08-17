# Feature Implementation Log

本ファイルは、実装ログ（最終報告書）を時系列で記載するためのものです。
以後のUI/機能改修は、本ファイル末尾に追記してください。（最新が上）

— 運用マニュアル —
- 目的: 本ファイルは git へ Pull Request を作成する際の「メモ／指針」として機能します。
- 必須事項: 新たな実装や修正が行われるたびに、本ファイルへの追記は必須です（抜け漏れ禁止）。
- 更新の対象例: 画面UI変更、挙動変更、API追加・変更、DBマイグレーション、ルール・フォーマット変更、重要な不具合修正など、ユーザー影響のある全て。
- 記載順序: 最新が最上段（逆時系列）。
- 記載内容: 要約/背景/変更点/影響範囲/関連ファイル/検証手順/既知の制約/ロールバック方針（あれば）。
- PR 連携: 可能であればブランチ名・コミット範囲・PR URL を併記。

記載テンプレート（コピペして利用）:
```
## YYYY-MM-DD

- 目的/背景: ...
- 変更点（箇条書き）:
  - ...
- 影響範囲: ...（UI/サーバ/API/DBなど）
- 変更ファイル: `path/to/fileA`, `path/to/fileB`, ...
- 動作確認手順:
  1. ...
  2. ...
- 既知の注意点/制約: ...
- ロールバック方針: ...
- ブランチ/PR: branch `feature/xxx` / PR: <URL>
```

---

## 2025-08-17 (Hotfix)

- 目的/背景: 貴金属の時価が取得できない不具合を修正（Tanaka 解析用の正規表現エスケープ誤りによりマッチ失敗）。
- 変更点:
  - `providers/metal/TanakaProvider.js` の HTML 解析を見直し: 余分なバックスラッシュを除去し、空白や改行に強い2パターンの正規表現へ刷新。
  - 価格の検証を追加（数値/正値判定）。
  - ユニットテスト追加: `test/metal.tanaka.test.js`（表形式/改行混在パターンの抽出を検証）。
- 影響範囲: 市場評価（貴金属）の時価取得のみ。UI/DB/既存APIの変更はなし。
- 変更ファイル: `providers/metal/TanakaProvider.js`, `test/metal.tanaka.test.js`
- 動作確認手順:
  1. `npm test -- test/metal.tanaka.test.js` を実行し全テストが成功すること。
  2. `MARKET_ENABLE=1` 環境で `/api/valuations/:assetId/refresh`（class=precious_metal）を叩き、`unit_price_jpy`/`value_jpy` が返ることを確認。
- 既知の注意点/制約: 上流サイトの構造変更には引き続き影響を受ける。休日・休場日は Tanaka が更新されない場合があり、Mitsubishi フォールバックが適用される。
- ロールバック方針: 当該ファイルの差分を戻す。

## 2025-08-17

- 市場評価額の正確性向上（USD/JPY 両立）
  - valuations.fx_context を JSON 形式で保存（pair/rate/as_of）。既存の文字列形式も読取フォールバック対応。
  - us_stock/jp_stock/precious_metal の全てで valuations.unit_price_jpy を保存（米株はUSD×USDJPY）。
  - 一括更新 `/api/valuations/refresh-all` でも unit_price_jpy を INSERT するよう統一。
  - 資産一覧における US 株の USD 単価派生を安定化（`market_price_usd` 優先、次点で `unit_price_jpy / fx.rate`）。高額銘柄も閾値排除なし。
  - 円建て損益は `fx_context.rate` を用いた統一レートで再計算。
  - 影響: `server.js`（評価計算/保存・一覧派生）, `docs/valuation-design.md`（新規）
  - 互換性: スキーマ変更なし。既存の valuations レコードはそのまま有効。

## 2025-08-16 (Updated)

- ダッシュボード グラフレイアウト改善・単位統一
  - クラス別配分・月次推移両グラフのタイトル左寄せ、単位表記「万円」右寄せに統一
  - 月次推移グラフの数値を万円単位に変換（元値/10000で四捨五入）
  - ツールチップとY軸ラベルに適切な数値フォーマット適用
  - 評価差額の色統一: プラス=赤（`text-rose-600`）、マイナス=緑（`text-emerald-600`）
  - 対象: `client/src/pages/Dashboard.jsx`

---

## 2025-08-16

- 資産一覧 編集UI 統合（BDD準拠）
  - 一覧行末の「数量編集」「詳細編集」を廃止し、単一「編集」へ統合。
  - `AssetEditModalBDD` を使用し、共通＋クラス別フィールドを一画面で編集。
  - `recalc` キーで再計算モード（auto/scale/unit）を送信。単一PATCH前提。
  - 対象: `client/src/pages/AssetList.jsx`, `client/src/components/AssetEditModalBDD.jsx`
  - 旧: `client/src/components/AssetEditModal.jsx` を削除。

- 新規登録モーダル UI/CSS 統一
  - BDD準拠のレイアウト/コンポーネントに刷新（Card/Button/Input系）。
  - オーバーレイクリックで閉じない（Xボタンのみ）。
  - タイトルの「（統一）」表記を削除。
  - 対象: `client/src/components/AssetCreateModal.jsx`
  - 追補: 平均取得単価（JP株）の入力を小数点以下2桁対応（`step=0.01`）に統一。

- ダッシュボード UI 改修
  - KPIカード: NAV/簿価総額/評価差額/資産数+USDJPY をカード表示。
  - 評価差額の色: プラス=赤（rose）、マイナス=緑（emerald）で統一。
  - クラス別配分（円グラフ）:
    - ラベル/ツールチップは「円→万円」換算の数値のみ（3桁カンマ）。
    - 右上に「単位：万円」を表示。見出しは左寄せ、単位は右寄せに配置調整。
  - 月次推移（折れ線）:
    - データは円→万円へ丸め（整数化）。
    - Y軸/ツールチップは3桁カンマ表示（`formatInt`）。
    - ヘッダー構造をクラス別配分と統一（左=タイトル/説明、右=単位）。
  - 資産一覧（ダッシュボード内）:
    - 復活・整備。列を拡充（数量、時価単価、簿価単価、簿価総額、評価額、評価損益）。
    - 評価損益は総額＋％、色はプラス=赤/マイナス=緑。
    - US株は単価を USD/JPY の2段表示（取得時為替は考慮せず、現行USDJPYを使用）
    - 単価表示は全資産で小数点以下2桁に統一（JPY単価は `formatYenUnit` で2桁）
    - 名称（備考）形式で表示。
    - 右上にフィルター（検索）を追加。名称/備考/クラスで部分一致（大文字小文字無視）。
  - 対象: `client/src/pages/Dashboard.jsx`, `client/src/utils/format.js`
  - 追加フォーマッタ: `formatInt`（整数3桁区切り）、`formatManNumber`（円→万円・整数化）

- マーケットデータ精度改善（日本株）
  - Yahoo側失敗時に即モックへフォールバックしていた挙動を見直し、Google Financeを中間フォールバックに追加。
  - 日本株の価格はYahoo取得時も小数部を保持（2桁丸め）するよう修正。
  - 対象: `providers/yahoo.js`（GoogleFinanceStockProviderのフォールバック組み込み、JP価格の小数保持）
  - モックフォールバックを撤廃。Yahoo/Google両方とも失敗時はAPIエラーを返し、フロントは「時価取得失敗」を表示（ダッシュボード資産一覧で対応）。

- インポート/エクスポート 画面 UI 統一
  - UIキット（Card/Button/Input）にリファクタ。通知表示や見出し・文言を統一。
  - 対象: `client/src/pages/Import.jsx`

- ラベル/文言調整
  - 「（統一）」「一般向けUI」等のラベルを削除し統一感を向上。

- ヘッダー配置バグ修正
  - CardHeaderが縦積みになる問題を、内部ラッパーに `flex w-full items-center justify-between` を付与して横並びへ統一。
  - `formatInt is not defined` エラーは `formatInt` のインポート追加で解消。

- 分岐/ブランチ
  - 作業用ブランチ: `feature/ui-create-modal-and-dashboard` を作成（コミットは未実施）。

- 重複データ統合（項目選択型）
  - 重複統合時に「保持対象」の選択に加え、フィールドごとにどの資産の値を採用するか選べるモーダルを追加。
  - 対象フィールド: 共通（名称/備考/取得日/簿価/評価ソース/流動性/タグ）＋クラス別（US株: ティッカー/取引所/株数/平均USD、JP株: コード/株数/平均JPY、貴金属: 金属/重量/純度/単価）。
  - API: 既存 `/api/duplicates/merge` に `merge_plan` を追加送信。サーバ側で該当フィールドを優先して統合（トランザクション）。
  - 追加: `client/src/components/DuplicateMergeModal.jsx`、更新: `client/src/pages/Duplicates.jsx`, `server/duplicates/service.js`, `server.js`（API追加）

---

### ログ記載ルール（提案）
- 日付見出し配下に、機能単位の箇条書きで端的に要約する。
- 影響ファイル/ディレクトリを明示する。
- 不具合修正は「原因/対応/影響」を簡潔に記載する。
- UI仕様/表示ルールの変更（桁区切り、小数桁、色など）は必ず明記する。
- マーケットデータの精度強化（US/JP株）
  - 複合プロバイダを実装し、YahooとGoogle Finance双方から取得して合意的な価格を選択（差分8%以内はYahoo優先、それ以上は平均値）。
  - レイテンシは最小限、失敗時も一方成功で成立。双方失敗時はエラー。
  - 対象: `providers/stock/CompositeStockProvider.js`（新規）、`providers/registry.js`（Composite採用）
 - 貴金属の時価取得（休日対応・二段階フェールオーバー）
   - 田中貴金属で取得失敗時は、三菱マテリアル（https://gold.mmc.co.jp/market/）の公表価額を参照するフォールバックを追加。
   - 休日・休場日は当日の公表が無い場合があるため、サイト側の最新表示（前営業日/前週末）をそのまま採用（ページは最新を掲示）。
   - 静的モック価格の利用を撤廃し、実データ取得に失敗した場合は上位へエラーを返す。
   - 対象: `providers/tanaka.js`（Mitsubishiフォールバック導入/モック撤廃）, `providers/metal/MitsubishiProvider.js`（新規）
