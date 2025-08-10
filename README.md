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

### Ubuntu Server 24.04 での運用

#### 1. システム準備

```bash
# Node.js 18+ インストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 必要なパッケージ
sudo apt-get update
sudo apt-get install -y git sqlite3 build-essential

# アプリケーション取得
git clone https://github.com/yangnana7/assetshold.git
cd assetshold
```

#### 2. 依存関係とビルド

```bash
# バックエンド依存関係
npm install

# フロントエンドビルド
cd client
npm install
npm run build
cd ..
```

#### 3. systemd サービス設定

```bash
# サービスファイル作成
sudo nano /etc/systemd/system/assetshold.service
```

以下の内容で保存：

```ini
[Unit]
Description=Assets Portfolio Management Application
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/assetshold
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=assetshold

[Install]
WantedBy=multi-user.target
```

#### 4. サービス起動

```bash
# サービス有効化・起動
sudo systemctl daemon-reload
sudo systemctl enable assetshold
sudo systemctl start assetshold

# ステータス確認
sudo systemctl status assetshold

# ログ確認
sudo journalctl -u assetshold -f
```

#### 5. リバースプロキシ設定（nginx）

```bash
# nginx インストール
sudo apt-get install -y nginx

# サイト設定
sudo nano /etc/nginx/sites-available/assets.local
```

設定内容：

```nginx
server {
    listen 80;
    server_name assets.local;

    location / {
        proxy_pass http://localhost:3009;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# サイト有効化
sudo ln -s /etc/nginx/sites-available/assets.local /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. ファイアウォール設定

```bash
# ポート3009を直接外部公開しない（nginxのみ）
sudo ufw allow 22
sudo ufw allow 80
sudo ufw --force enable
```

#### 7. 運用管理

```bash
# サービス再起動
sudo systemctl restart assetshold

# ログ監視
sudo tail -f /var/log/syslog | grep assetshold

# アプリケーション更新
cd /home/ubuntu/assetshold
git pull origin master
cd client && npm run build && cd ..
sudo systemctl restart assetshold
```

### CSV ファイル監視

サーバー起動中に `data/portfolio.csv` を編集・保存すると、自動的にデータベースに同期されます。

### バックアップ

アプリケーション停止時に `backup/` ディレクトリに SQLite ファイルがバックアップされます。

#### Ubuntu での自動バックアップ

```bash
# バックアップスクリプト作成
sudo nano /usr/local/bin/backup-assetshold.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/ubuntu/assetshold/backup"
DB_FILE="/home/ubuntu/assetshold/data/portfolio.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_FILE $BACKUP_DIR/portfolio_${DATE}.db

# 30日以上古いバックアップを削除
find $BACKUP_DIR -name "portfolio_*.db" -mtime +30 -delete
```

```bash
# 実行権限付与
sudo chmod +x /usr/local/bin/backup-assetshold.sh

# 毎日午前2時にバックアップ実行
crontab -e
```

crontabに追加：
```
0 2 * * * /usr/local/bin/backup-assetshold.sh
```

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