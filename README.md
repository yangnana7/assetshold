# 資産ポートフォリオ管理アプリ

ローカル環境で動作する資産ポートフォリオ管理システム

## 機能概要

- 株式、時計、貴金属、不動産、コレクション、現金など多様な資産の管理
- 完全ローカル動作（外部API依存なし）
- CSV ファイルとの自動同期
- 認証機能（admin/viewer ロール）
- 監査ログ機能
- レスポンシブな Web UI

## システム要件

- Node.js 18+
- SQLite3
- Windows 11 / Ubuntu Server 24.04

## セットアップ

### 1. 依存関係のインストール

```bash
# バックエンド
npm install

# フロントエンド
cd client
npm install
cd ..
```

### 2. フロントエンドのビルド

```bash
cd client
npm run build
cd ..
```

### 3. サーバー起動

```bash
npm start
```

サーバーは **必ず** ポート 3009 で起動します。他のポートでの起動は失敗します。

## 使用方法

### 1. アクセス

ブラウザで `http://localhost:3009` にアクセス

### 2. 未ログイン時

- 閲覧専用のダッシュボードが表示されます
- 総資産数、総評価額、アセットクラス別配分、高額資産 Top 3 を確認できます

### 3. ログイン

- 右上の「ログイン」ボタンをクリック
- デフォルトユーザー: `admin` / パスワード: `admin`

### 4. 管理機能（admin ユーザー）

- **資産一覧**: 資産の表示、検索、編集、削除
- **新規登録**: 資産の追加
- **CSV 同期**: `data/portfolio.csv` の変更を自動でデータベースに反映

## CSV ファイル仕様

`data/portfolio.csv` に以下の形式で資産データを記録できます：

```csv
class,name,note,acquired_at,book_value_jpy,valuation_source,liquidity_tier,tags
precious_metal,純金小判,50g,2025-01-15,268000,manual,L3,"{""metal"": ""gold""}"
watch,Kudoke 2 Indigo,,2024-12-01,850000,manual,L3,"{""brand"": ""Kudoke""}"
```

### アセットクラス

- `us_stock`: 米国株
- `jp_stock`: 日本株  
- `watch`: 時計
- `precious_metal`: 貴金属
- `real_estate`: 不動産
- `collection`: コレクション
- `cash`: 現金・預金

### 流動性階層

- `L1`: 超流動（現預金・カード枠）
- `L2`: 株式等
- `L3`: 貴金属・時計等  
- `L4`: 不動産等

## BDD 仕様準拠

このアプリケーションは厳密な BDD（振る舞い駆動開発）仕様に従って開発されています：

### ポート固定

- ポート 3009 以外での起動は **必ず失敗** します
- 環境変数でポートを変更しようとしても起動できません

### 認証・認可

- 未ログイン時は閲覧専用ダッシュボードのみ表示
- API レベルでの編集操作は 401 Unauthorized で拒否
- admin ロールのみが編集機能を使用可能

### データ整合性

- `note` フィールドは空の場合、`null` ではなく空文字列 `""` で保存
- 高額資産表示で `note` が空の場合、空の括弧は表示されません
- 部分更新（PATCH）で他のフィールドに影響を与えません

### 監査ログ

- すべての作成・更新・削除操作が `audit_log` テーブルに記録されます
- CSV 同期による変更も記録されます

## ファイル構成

```
assetshold/
├── server.js              # Express サーバー
├── package.json           # バックエンド依存関係
├── data/                  # データファイル
│   ├── portfolio.db       # SQLite データベース
│   └── portfolio.csv      # CSV データ（同期対象）
├── client/                # React フロントエンド
│   ├── src/
│   ├── dist/             # ビルド済みファイル
│   └── package.json
├── backup/               # 自動バックアップ先
└── docs/                 # BDD 設計書
```

## 開発・運用

### 開発モード

```bash
# バックエンド
npm run dev

# フロントエンド（別ターミナル）
cd client
npm run dev
```

### CSV ファイル監視

サーバー起動中に `data/portfolio.csv` を編集・保存すると、自動的にデータベースに同期されます。

### バックアップ

アプリケーション停止時に `backup/` ディレクトリに SQLite ファイルがバックアップされます。

## トラブルシューティング

### ポートエラー

```
ERROR: This application MUST run on port 3009
```

→ 環境変数 `PORT` を設定している場合は削除してください

### CSV 同期エラー

CSV ファイルのフォーマットが不正な場合、トランザクションがロールバックされ、データベースは変更されません。サーバーログでエラー詳細を確認してください。

### 認証エラー

- デフォルトユーザー: `admin` / `admin`
- ブラウザのクッキーをクリアしてからログインし直してください