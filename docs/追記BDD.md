# ローカル資産ポートフォリオアプリ — BDD設計 最終統合版（改訂）

> 目的: 家計簿アプリの運用実績を活かし、株（1株単価×株数）、貴金属（単価×重量）、時計、不動産、コレクション、現預金・外貨などをローカルで安全に管理・評価・可視化する。

---

## 0. 開発体制・基本情報

- **ソースコード担当:** ClaudeCode
- **受け入れ:** あなた
- **環境:** Windows 11 / Ubuntu Server 24.04 LTS
- **スタック:** Node.js + Express, SQLite, React + Vite + TanStack Table/Recharts, Vitest/Supertest/Playwright
- **ポート規約:** 家計簿=3008 / 資産=3009（固定以外はMUST FAIL）
- **URL:** `http://kakeibo.local` → :3008, `http://assets.local` → :3009

---

## 1. 非機能要件

1. 完全ローカル（外部通信は明示的許可時のみ）
2. 固定ポート
3. SQLite + WAL→checkpoint堅牢化
4. 監査ログ
5. 停止時自動バックアップ
6. UI日本語、JPY既定、評価通貨切替（JPY/USD/CNY）
7. 権限: viewer/admin

---

## 2. ドメインモデル

- **assets:** id, class, name, note(空文字保存), acquired\_at, book\_value\_jpy, valuation\_source, liquidity\_tier, tags
- **valuations:** id, asset\_id, as\_of, value\_jpy, fx\_context, extra(JSON: 単価情報等)
- **us\_stocks:** ticker, exchange, quantity, avg\_price\_usd（表示は *avg\_price\_usd × quantity*）
- **jp\_stocks:** code, quantity, avg\_price\_jpy（表示は *avg\_price\_jpy × quantity*）
- **precious\_metals:** metal, weight\_g(小数1桁固定), purity, unit\_price\_jpy(小数2桁固定, 円未満は小数2桁まで切り捨て)（表示は *unit\_price\_jpy × weight\_g*）
- その他: watches, real\_estates, collections, cashes

---

## 3. データ連携（CSV正本）

- 初回: 手動or外部スクリプトで `data/portfolio.csv` 作成
- 変更時: ファイルウォッチ→差分Upsert
- 書き出し: CSV/MD/JSON（MDはレポート専用）
- CSV仕様: UTF-8, LF, ヘッダあり、class+natural\_keyで同定

---

## 4. 価格・為替

- 既定: 手動評価
- オンデマンド更新（明示的有効化時のみ）: 株価, 為替
- 失敗時: キャッシュ利用＋最終更新時刻表示

---

## 5. 画面仕様

### 未ログイン

- NAV, 配分円グラフ, 月次推移, Top3表示（空括弧禁止）, 検索/並び替え/CSV出力

### ログイン後

- 資産一覧（数量×単価の評価表示対応）
- 新規登録（株は単価と数量、貴金属は重量と単価で入力、小数点ルール適用）
- インポート/エクスポート（CSV）
- 評価更新
- リバランス試算
- 不動産ユーティリティ

---

## 6. API

- GET /api/assets?class=...
- POST /api/assets
- PATCH /api/assets/\:id（noteのみ）
- DELETE /api/assets/\:id
- POST /api/import/csv
- GET /api/export?format=csv|md|json
- POST /api/valuations/\:id/refresh
- 認可: 未ログインはdashboardのみ、編集系は401

---

## 7. BDDシナリオ（追加要素）

- **株の評価表示:** us\_stock/jp\_stock クラスでは、一覧と詳細に *取得単価×数量* と *現在値×数量* を自動表示（価格は小数2桁、円未満切り捨て）
- **貴金属の評価表示:** precious\_metals クラスでは、一覧と詳細に *単価(小数2桁)×重量(小数1桁)* を自動表示（円未満切り捨て）
- 既存の未ログイン/APIブロック/note更新/Top3表示/CSV同期/ポート固定/adminリダイレクト/配分分析/月次推移は従来通り

---

## 8. スキーマ（抜粋）

```sql
CREATE TABLE precious_metals (
  asset_id INTEGER PRIMARY KEY,
  metal TEXT NOT NULL,
  weight_g REAL NOT NULL,
  purity REAL,
  unit_price_jpy REAL,
  FOREIGN KEY(asset_id) REFERENCES assets(id)
);
```

---

## 9. 受け入れ基準

- 株・貴金属が単価×数量/重量で可視化される（小数点表示ルール・円未満切り捨てを厳守）
- 他基準は従来通り（固定ポート、CSV⇄DBラウンドトリップ、note運用、Top3空括弧禁止など）

