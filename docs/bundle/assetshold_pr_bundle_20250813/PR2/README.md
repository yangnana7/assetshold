# PR2: セキュリティ初期化

- SESSION_SECRET を必須化（未設定なら起動失敗）
- helmet 導入、cookie に sameSite/secure/httpOnly
- /api/login に rate-limit
- 初回セットアップ: ユーザ未存在時に ADMIN_SETUP_REQUIRED を返し、/api/setup で初期パスワード設定
