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