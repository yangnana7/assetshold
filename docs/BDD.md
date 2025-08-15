# 資産ポートフォリオアプリ — BDD

---

# 1. 非機能要件
- **固定ポート**: 3009 以外は**起動失敗**（`server/utils/config.js` の `validateRequiredPortOrExit`）。  
- **既定は外部市場/為替**（`MARKET_ENABLE=1`）。完全ローカルは明示有効化時（`MARKET_ENABLE=0`）
- SQLite（WAL、1分 checkpoint）。`audit_log`でCRUD監査
- 認証（`SESSION_SECRET` 必須）/ `/api/login` レート制限
- **CORS**: 開発 `http://localhost:5173` のみ許可／本番は同一オリジン。 
- **Rate Limit**: `/api/login` へ適用（express-rate-limit）。  
- **DB**: SQLite（`assetshold.db`）。WAL前提、アプリ内でテーブル作成＋マイグレーション同梱。  
- **監査**: `audit_log`（CRUD＋source:api）。  
- **バックアップ**: `/api/settings/backup` でON/OFF・パス設定（コードの実装に従う）。

---

# 2. データベース（コード準拠）

## 2.1 テーブル一覧
- **assets**: `id, class, name, note, acquired_at, book_value_jpy, valuation_source, liquidity_tier, tags, created_at, updated_at`
- **valuations**: `id, asset_id, as_of, value_jpy, fx_context(JSON), unit_price_jpy`
- **price_cache**: `key(PK), payload(JSON), fetched_at`
- **us_stocks**: `asset_id(PK), ticker, exchange, quantity(REAL), avg_price_usd(REAL)`
- **jp_stocks**: `asset_id(PK), code, quantity(REAL), avg_price_jpy(REAL)`
- **precious_metals**: `asset_id(PK), metal, weight_g(REAL), purity(0-1), unit_price_jpy(REAL)`
- **watches**: `asset_id(PK), brand, model, ref, box_papers(BOOLEAN)`
- **real_estates**: `asset_id(PK), address, land_area_sqm, building_area_sqm, rights`
- **collections**: `asset_id(PK), category, variant`
- **cashes**: `asset_id(PK), currency('JPY'既定), balance(REAL)`
- **attachments**: `id, asset_id, filename, url, notes, created_at, updated_at`
- **comparable_sales**: `id, asset_id, sale_date(YYYY-MM-DD), price, currency, price_jpy, source, source_url, marketplace, condition_grade, completeness, notes, created_at, updated_at`
- **settings**: `key(PK), value`
- **target_allocations**: `class(PK), target_pct(REAL)`
- **audit_log**: `id, table_name, record_id, action, old_values, new_values, user_id, source, created_at`
- **users**: `id, username(UNIQUE), password_hash, role('viewer'|'admin'), created_at`

## 2.2 インデックス/制約（migrations 準拠）
- `idx_valuations_asset_asof(asset_id, as_of DESC, id DESC)`
- `settings.key`/`target_allocations.class`/`price_cache.key` はPK

---

# 3. データ連携（CSV正本・コード準拠）

- **取込**: `POST /api/import/csv`（Multer・10MB）。トランザクションで Upsert。  
- **書出**: `GET /api/export`、`GET /api/export/full-database`。  
- **必須ヘッダ**: `class,name,acquired_at,book_value_jpy,liquidity_tier`  
- **推奨ヘッダ**（コードの `server/csv/schema.js` 相当）:
  ```
  class,name,note,acquired_at,book_value_jpy,valuation_source,liquidity_tier,tags,
  ticker,exchange,metal,weight_g,purity,address,lot,unit,quantity
  ```
- 厳格検証: enum/日付/金額範囲/流動性Tier。失敗時は行番号つきエラー。  
- 競合: 既定 **DB優先**、`?force=csv` でCSV強制。

---

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

---

# 5. 画面仕様（一般向けUI）

## 5.1 ダッシュボード（ゲスト可）
- NAV、クラス配分（ドーナツ）、月次推移（簿価vs評価）、Top3
- バッジで `valuation_source` / `market:enabled/disabled` / `最終更新(JST)` / `stale` を表示
- 空括弧や `(undefined)` は非表示

## 5.2 資産一覧（admin）
- TanStack Table（固定ヘッダ/列フィルタ/合計/仮想スクロール）
- 行末に **「編集」**（数量・詳細の分割を廃止）

## 5.3 参考価格（コンプ）UI（一般向け・置換）
**3ステップ**：① 事例を集める → ② 推定する → ③ 評価に反映

### ① 事例を集める
- **URL貼付** / **CSV・画像ドロップ** を1カードに集約  
- URLから **日付・通貨・金額・プラットフォーム** 自動抽出 → 1クリック確認で登録  
- リストは **カード** 表示＋**チップ**（状態/付属/プラットフォーム/通貨）。並べ替え・フィルタはチップ群で簡素化

### ② 推定する
- 上部に「何をしているか」を **文章** で説明（例：『直近重視・外れ値は自動除外』）
- **モード**：おまかせ（MAD+加重中央値）/ 保守的（外れ値強め）/ 強気（最近重視）  
  - スライダは **“慎重 ←→ 幅広く”** の語彙で表示
- **結果カード**：推定額（大きく）、信頼度ゲージ、採用件数/除外件数、箱ひげ＋推定ライン

### ③ 評価に反映
- **差分プレビュー**（簿価/現評価/新評価/増減）＋ **UNDO**  
- 反映時に **メモ必須**（出典・期間・件数）。`valuations.fx_context` に保存

## 5.4 編集UI（**一画面統一**）
- **AssetEditModal v2**（単一モーダル、単一トランザクション）
  - 共通: `name, note, acquired_at, book_value_jpy(ロック可), valuation_source, liquidity_tier, tags`
  - クラス別: US株(JP株/数量/単価)、貴金属(重量/純度/単価)、時計/不動産/コレクション/現金 等
  - **再計算モード**: `auto|scale|unit`（簿価更新の挙動を選択）

## 5.5 配分調整（リバランス）UI（一般向け・新規）
**3ステップ**：① 目標を決める → ② ルールを選ぶ → ③ 提案を見る

### ① 目標を決める
- **現状ドーナツ** と **目標ドーナツ** を左右並列  
- 主要クラスは **スライダ**（%）。**合計は自動100%**  
- **低流動（L3/L4）ロック** トグル（売買対象から除外）

### ② ルールを選ぶ
- 許容幅（±%）＝『どれくらいずれたら直す？』（3/5/10%チップ）
- 方式：**目標** / **中間（半分だけ戻す）**
- 最小取引額（円）、端株・端数丸めチェック
- 対象：L1/L2のみ／外貨現金含む 等のチップ

### ③ 提案を見る
- **サマリカード**：必要売買総額、実行後の配分、手数料欄
- **提案表**：クラス→銘柄（買/売、数量/金額、理由メモ：例「L3ロックのため対象外」）
- **CSV出力** と **“この案を保存”**（記録のみ）。実行は行わない旨を明記


---

# 6. API（実装準拠）

## 6.1 セットアップ/認証
- `GET /api/setup/status` / `POST /api/setup`（初回ユーザー作成）  
- `POST /api/login` / `POST /api/logout` / `GET /api/user`  
- ユーザー管理: `GET /api/users` / `POST /api/users` / `PATCH /api/users/:id` / `PATCH /api/users/:id/password` / `DELETE /api/users/:id`  

## 6.2 ダッシュボード
- `GET /api/dashboard` / `GET /api/dashboard/class-summary`

## 6.3 資産
- `GET /api/assets` / `GET /api/assets/:id` / `POST /api/assets` / `PATCH /api/assets/:id` / `DELETE /api/assets/:id`

## 6.4 CSV
- `POST /api/import/csv` / `GET /api/export` / `GET /api/export/full-database`

## 6.5 市場・評価
- `POST /api/valuations/:assetId/refresh` / `POST /api/valuations/refresh-all`
- `GET /api/market/status` / `GET /api/market/fx/:pair`

## 6.6 Comparable Sales（コンプ）
- `GET /api/assets/:assetId/comps` / `POST /api/assets/:assetId/comps` / `DELETE /api/comps/:id`
- `GET /api/assets/:assetId/comps/estimate` / `POST /api/assets/:assetId/comps/commit`

## 6.7 リバランス
- `GET /api/rebalance/targets` / `POST /api/rebalance/targets`
- `GET /api/rebalance/plan`（`to=target|mid`, `tol`, `min_trade`, `use_book`）

## 6.8 バックアップ
- `GET /api/settings/backup` / `POST /api/settings/backup`

## 6.9 重複検出/統合
- `GET /api/duplicates`  
- `POST /api/duplicates/merge`（**コード準拠**。従来案の `/api/assets/merge` は廃止）  
- `POST /api/duplicates/ignore`

---

# 7. 受け入れシナリオ

## 7.1 アクセス制御
- 未ログインはダッシュボードのみ、編集は**401**
- admin ログインで一覧/取込/編集が可能

## 7.2 市場データゲート
- `MARKET_ENABLE=0` 時の評価更新系は **403 `{code:'market_disabled'}`**
- 失敗時はキャッシュ継続＋UIに `stale` 表示

## 7.3 編集統一（モーダル v2）
- **Given** 資産一覧で「編集」を押下  
- **When** 共通＋クラス別フィールドを入力し `保存`  
- **Then** 単一 PATCH で**クラス別テーブルも同時更新**され、簿価が `recalc` 仕様で更新されること  
- **And** 失敗時はトランザクション**ロールバック**されDBが不整合にならないこと  

## 7.4 参考価格（コンプ）— 置換
- URL貼付で自動抽出→1クリック登録。抽出失敗は**手入力に切替**できる
- 推定は既定**おまかせ**（MAD+加重中央値）。スライダは「慎重/幅広く」語彙
- 反映は **差分プレビュー** と **UNDO**、`fx_context` に手法/件数/期間/信頼度を保存

## 7.5 配分調整（リバランス）— 置換
- 目標スライダは常に**合計100%**（自動正規化）
- UI指定（to=target|mid, tol, min_trade, use_book, 対象）から `/api/rebalance/plan` を呼ぶ
- 提案表は初心者向け文言（例：『日本株を2株売却』『現金を5万円増やす』）
- CSV出力 と 案の保存（記録のみ）。実行はアプリ外


---

# 8. セキュリティ/運用
- helmet / x-powered-by 無効化
- `/api/login` レート制限（5/min/IP程度）
- systemd：`MARKET_ENABLE=0` 既定、バックアップ世代管理


---

# 9. マイグレーション

## 9.1（要旨）
- comparable_sales / rebalance / valuations.unit_price_jpy を含むスクリプト適用済み前提
- `idx_valuations(asset_id, as_of DESC, id DESC)` で時系列取得を統一

## 9.2（現状）
- `20250813_comps.sql`（comparable_sales）  
- `20250813_rebalance.sql`（target_allocations, settings と既定の `tolerance_pct=5`）  
- `20250813_add_unit_price_to_valuations.sql` / `20250814_add_unit_to_valuations.sql`（`valuations.unit_price_jpy`、索引）


---

# 10. UIガイドライン
- 多層カード（Grid 2fr:1fr）、左=属性/右=評価・簿価・損益
- バッジ：valuation_source / market状態 / 最終更新 / stale
- shadcn/ui の Steps or Tabs + 次へ/戻る。Rechartsでドーナツ/線/箱ひげ


---

# 11. 実装チェックリスト
- [ ] 参考価格タブを **ステッパー** 構成に再編
- [ ] URLパーサ（抽出不可→手入力カード）
- [ ] 箱ひげ＋推定ライン（Rechartsカスタム）
- [ ] 反映プレビュー＆UNDO（直前 valuation_id を保持）
- [ ] 配分調整：二重ドーナツ＋スライダ、L3/L4ロック
- [ ] `/api/rebalance/plan` 呼出と**初心者向け文言**の提案表
- [ ] CSV出力＆案保存（audit_log へ記録）