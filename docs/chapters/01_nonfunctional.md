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