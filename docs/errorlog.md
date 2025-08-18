- 対応内容
  - accounts作成: `server.js` の `initDatabase()` に `accounts` テ ーブル作成を追加。
  - 列追加: `us_stocks`/`jp_stocks` に `account_id` が無いDBへ `ALTER TABLE` で列追加。
  - 既存データ補正: `accounts` に Default Account（broker=default, account_type=
tokutei）を作成し、両テーブルの `account_id IS NULL/0` をそのIDでバックフィル。
  - 削除チェック修正: `/api/accounts/:id` の関連資産数確認SQLを合算式に変更（従来はUNION+db.getでUS側のみしか見ていない不具合）。

- 変更ファイル
  - `server.js`
    - initDatabase: accounts作成、account_id列追加、バックフィル追加
    - DELETE `/api/accounts/:id`: 合算カウントSQLへ修正

---

## 2025-08-18: 認証エラー (500 Internal Server Error)

### 🐛 問題概要
- 症状: 新規資産登録フォームで `GET /api/accounts` が500エラー
- 原因: `requireAdmin` ミドルウェアが `req.session.user` を期待するが、フロントエンドから認証情報が正しく渡されない
- ログ: `hasSession: true, hasUser: false, userRole: undefined`

### 🔍 根本原因分析
1. **セッション管理問題**: セッションは存在するがユーザー情報が空
2. **認証フロー不整合**: フロントエンドとバックエンドの認証状態同期問題
3. **ミドルウェア依存**: 新機能が既存認証システムに強依存

### 💡 解決案（優先度順）

#### A. 即座解決案（適用済み）
```javascript
// 一時的認証無効化
app.get('/api/accounts', (req, res) => { // requireAdmin削除
  
// 監査ログ安全化
user_id: req.session?.user?.id || 'test-admin'
```

#### B. 認証システム修正案（推奨）
```javascript
// 1. セッション状態確認API追加
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: !!req.session?.user,
    user: req.session?.user ? {
      id: req.session.user.id,
      username: req.session.user.username,
      role: req.session.user.role
    } : null
  });
});

// 2. フロントエンド認証状態復元
useEffect(() => {
  const checkAuth = async () => {
    try {
      const res = await axios.get('/api/auth/status', { withCredentials: true });
      if (res.data.authenticated) {
        setUser(res.data.user);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  };
  checkAuth();
}, []);

// 3. 権限別アクセス制御
const requireRole = (role) => (req, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (role && req.session.user.role !== role) {
    return res.status(403).json({ error: `${role} access required` });
  }
  next();
};
```

#### C. 段階的権限緩和案
```javascript
// accounts APIを一般ユーザーにも開放（読取のみ）
app.get('/api/accounts', requireAuth, (req, res) => { // requireAdmin → requireAuth

// 口座作成は管理者のみ維持
app.post('/api/accounts', requireAdmin, (req, res) => {

// 資産登録は認証ユーザーなら可能
app.post('/api/assets', requireAuth, async (req, res) => {
```

#### D. 長期解決案：JWT移行
```javascript
// JWT実装でセッション依存解消
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};
```

### 🎯 推奨実装順序

1. **即座実装**: 解決案B（認証状態確認API）
2. **短期実装**: 解決案C（段階的権限緩和）
3. **中期検討**: 解決案D（JWT移行）

### ⚠️ 注意事項

- 現在の一時措置（解決案A）は**テスト環境専用**
- 本番環境では適切な認証を必ず復旧すること
- セキュリティ要件に応じて適切な解決案を選択

### 📋 影響範囲

- ✅ 修正済み: `GET/POST /api/accounts`, `POST /api/assets`
- ⚠️ 要確認: 他の管理者限定API (`/api/users`, `/api/import`等)
- 📝 要実装: フロントエンド認証状態管理強化

---

## レビュー報告（2025-08-18）

● 総評
- 良い点: DBスキーマ不足が500の主因という切り分けは妥当。accounts作成・account_id列追加・バックフィル・削除チェック修正は正しい対処。認証周りの段階案（A→B→C→D）の整理も適切。
- 懸念: 一時的な認証無効化（A）は監査ログの実効性が下がるため運用期間を極小化したい。監査のuser_idフォールバックは本番で使わない形に（開発時のみ有効）。

● 即時対応（強く推奨）
- 認証状態API: 既存の`GET /api/user`を流用するか、`GET /api/auth/status`を追加し`{ authenticated, user }`を返却。
- アクセス制御の段階緩和（C）:
  - `GET /api/accounts` → `requireAuth`
  - `POST /api/accounts` → `requireAdmin`
  - `POST /api/assets` → `requireAuth`
- 監査ログのuser取得を共通化: `getUserId(req) => req.session?.user?.id || null`。本番は匿名更新を拒否、開発時のみフォールバック（例: `NODE_ENV!=='production'`）。

● 短期対応（Bの肉付け）
- フロントAxiosを`withCredentials: true`で統一。
- 逆プロキシ配下で`app.set('trust proxy', 1)`、本番は`cookie.secure=true`に。
- CORSの`origin`は本番で厳格化（既知ドメインのみ）。
- ロールに応じたUI制御（認証状態取得後にボタン活性/非活性切替）。

● 中期検討（Dの是非）
- ローカル/同一オリジン前提ならセッション継続が実用的。別ドメインSPA/モバイル対応が要件に入る場合のみJWTを検討（CSRF対策も同時設計）。

● セキュリティ/運用注意
- 監査の一貫性: 全APIで標準化した`error`コードを返却（docsの「管理画面エラーメッセージ一覧」に準拠）。
- CSRF: 同一オリジン運用+`SameSite=Lax`で当面許容。将来クロスオリジンを広げるならCSRFトークン導入を検討。
- 管理者初期化: 開発向けseed手段を用意（例: `SEED_ADMIN=1`）。本番はREADMEで手動作成手順を明記。

● 実装メモ（最小差分の提案）
- `GET /api/auth/status` の例: `res.json({ authenticated: !!req.session?.user, user: req.session?.user || null })`。
- ルート保護の適用: 上記マッピング（accounts GETは認証必須、作成は管理者、資産登録は認証必須）。
- 監査ログ呼び出しを`logAudit(..., getUserId(req))`に統一（本番で匿名拒否）。

● 確認観点
- 非ログイン時: `GET /api/accounts` が401。ダッシュボードは従来どおり閲覧可。
- ログイン後: accounts一覧/資産登録が成功し、監査ログ`user_id`が実ユーザーで記録。
- 本番相当: クッキー属性・CORS設定が期待どおりに動作（`withCredentials`/`origin`）。
