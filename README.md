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

**自動設定（推奨）**:
```bash
# 自動セットアップスクリプトを実行
chmod +x setup-service.sh
./setup-service.sh
```

**手動設定**:
```bash
# 現在のユーザー名とアプリケーションパスを確認
whoami
pwd

# 提供されたサービスファイルをシステムにコピー
sudo cp assetshold.service /etc/systemd/system/

# または手動でサービスファイル作成
sudo nano /etc/systemd/system/assetshold.service
```

リポジトリに含まれる `assetshold.service` ファイルと `setup-service.sh` スクリプトを使用して自動設定することを推奨します。手動作成する場合は以下の内容で保存（**ユーザー名とパスを実際の環境に合わせて変更**）：

```ini
[Unit]
Description=Assets Portfolio Management Application
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
Group=YOUR_USERNAME
WorkingDirectory=/path/to/your/assetshold
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=assetshold

[Install]
WantedBy=multi-user.target
```

**実際の設定例**：
```ini
[Unit]
Description=Assets Portfolio Management Application
After=network.target

[Service]
Type=simple
User=yangnana
Group=yangnana
WorkingDirectory=/home/yangnana/assetshold
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=assetshold

[Install]
WantedBy=multi-user.target
```

#### 4. 権限とディレクトリ設定

```bash
# アプリケーションディレクトリの所有者を確認・修正
sudo chown -R $USER:$USER ~/assetshold
chmod 755 ~/assetshold

# データディレクトリ作成と権限設定
mkdir -p ~/assetshold/data ~/assetshold/backup
chmod 755 ~/assetshold/data ~/assetshold/backup

# Node.jsのパス確認
which node
which npm
```

#### 5. サービス起動

```bash
# サービス有効化・起動
sudo systemctl daemon-reload
sudo systemctl enable assetshold
sudo systemctl start assetshold

# ステータス確認
sudo systemctl status assetshold

# ログ確認（詳細）
sudo journalctl -u assetshold -f --no-pager

# サービス起動に失敗した場合の詳細確認
sudo journalctl -u assetshold --no-pager | tail -20
```

#### 6. リバースプロキシ設定（nginx）

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

#### 7. ネットワークアクセス設定

**直接アクセス（開発・テスト用）**:
```bash
# ポート3009を開放して直接アクセスを許可
sudo ufw allow 22
sudo ufw allow 3009
sudo ufw --force enable

# アクセスURL
# 同一ネットワーク内から: http://サーバーのIP:3009
# ローカルから: http://localhost:3009
```

**nginx経由のアクセス（本番推奨）**:
```bash
# nginxのみ外部公開（ポート3009は内部のみ）
sudo ufw allow 22
sudo ufw allow 80
sudo ufw --force enable

# アクセスURL（nginx設定後）
# http://assets.local または http://サーバーのIP
```

#### 8. 運用管理

```bash
# サービス再起動
sudo systemctl restart assetshold

# ログ監視
sudo tail -f /var/log/syslog | grep assetshold

# アプリケーション更新
cd ~/assetshold
git pull origin master
cd client && npm run build && cd ..
sudo systemctl restart assetshold
```

### CSV ファイル監視

サーバー起動中に `data/portfolio.csv` を編集・保存すると、自動的にデータベースに同期されます。

### バックアップ管理

#### 自動バックアップ

アプリケーション終了時に自動でデータベースバックアップが作成されます。
バックアップファイルは `backup/` ディレクトリに `portfolio_YYYYMMDD_HHMMSS.db` 形式で保存されます。

#### バックアップ掃除

バックアップファイルの自動掃除スクリプトが用意されています：

```bash
# デフォルト（最新10個を保持）
node scripts/cleanup-backups.js

# 保持数を指定
node scripts/cleanup-backups.js ./backup 20

# 環境変数で保持数を指定
KEEP_BACKUPS=30 node scripts/cleanup-backups.js

# ヘルプ表示
node scripts/cleanup-backups.js --help
```

#### 定期実行の設定

```bash
# crontabに追加して毎日午前2時に実行
crontab -e
```

crontabに追加：
```
# 毎日午前2時にバックアップ掃除（最新10個を保持）
0 2 * * * cd /path/to/assetshold && node scripts/cleanup-backups.js

# 週1回日曜日の午前3時に実行
0 3 * * 0 cd /path/to/assetshold && KEEP_BACKUPS=20 node scripts/cleanup-backups.js
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

### Ubuntu systemd サービスエラー

#### エラー: `status=217/USER`

```
systemd[1]: assetshold.service: Main process exited, code=exited, status=217/USER
systemd[1]: assetshold.service: Failed to determine user credentials: No such process
```

**原因**: systemd設定ファイルで指定したユーザーが存在しないか、権限に問題がある

**クイック修正**:
```bash
cd ~/assetshold
git pull origin master  # 最新の修正ファイルを取得
chmod +x setup-service.sh
./setup-service.sh
sudo systemctl start assetshold
```

**解決手順**:

1. **ユーザー確認**:
```bash
# 現在のユーザー名確認
whoami
# ユーザーが存在するか確認
id $USER
# システムに登録されているユーザー一覧確認
getent passwd | grep -E ":/home/.*:/bin/(bash|sh)$"
```

2. **サービスファイルの自動修正**:
```bash
# 現在のユーザー名でサービスファイルを更新
cd ~/assetshold
USERNAME=$(whoami)
sed -i "s/User=yangnana/User=$USERNAME/" assetshold.service
sed -i "s/Group=yangnana/Group=$USERNAME/" assetshold.service
sed -i "s|WorkingDirectory=/home/yangnana/assetshold|WorkingDirectory=$PWD|" assetshold.service

# 修正されたファイルをシステムにコピー
sudo cp assetshold.service /etc/systemd/system/
```

3. **権限確認と修正**:
```bash
# アプリケーションディレクトリの所有者確認
ls -la ~/assetshold
# 必要に応じて所有者修正
sudo chown -R $USER:$USER ~/assetshold
# データディレクトリの作成と権限設定
mkdir -p ~/assetshold/data ~/assetshold/backup
chmod 755 ~/assetshold/data ~/assetshold/backup
```

4. **サービス再読み込み・起動**:
```bash
sudo systemctl daemon-reload
sudo systemctl restart assetshold
sudo systemctl status assetshold

# 起動確認
curl http://localhost:3009
```

#### その他の一般的な問題

**Node.jsパスエラー**:
```bash
# Node.jsの実際のパスを確認
which node
# systemdサービスファイルのExecStartパスを正しく設定
ExecStart=/usr/bin/node server.js  # 実際のパスに合わせる
```

**権限エラー**:
```bash
# SQLiteファイルとディレクトリの権限確認
ls -la ~/assetshold/data/
chmod 755 ~/assetshold/data
chmod 644 ~/assetshold/data/portfolio.db  # 存在する場合
```

**ログ確認**:
```bash
# 詳細なエラーログ確認
sudo journalctl -u assetshold -f --no-pager
sudo systemctl status assetshold -l
```