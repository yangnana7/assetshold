# assetshold 改修バンドル（2025-08-12）

このフォルダには 5 本の段階的PR案（PR1〜PR5）が入っています。各PRには：
- `patches/*.patch`: 代表的な差分（unified diff）
- `files/`: 新規追加 or 置換用の完成版ファイル（パッチ適用が合わない場合はこちらを参照）
- `tests/`: 追加の最小テスト
- `migrations/`: DBマイグレーション（必要なPRのみ）

> 注意: リポジトリの既存コードと差分の行番号が完全には一致しない可能性があります。パッチが当たらない場合は、`files/` の完成版を参考に**手動でマージ**してください。

## 適用順
1. PR1: DBマイグレーション & バグ修正
2. PR2: セキュリティ初期化（SESSION_SECRET必須化、admin初期化フロー、helmet等）
3. PR3: CSV 正本ヘッダ対応 & バリデーション強化 & エクスポート
4. PR4: UI修繕 & ダッシュボード（月次二本線） & 多層カード
5. PR5: 市場データの実用化（USDJPY/CNYJPY、田中貴金属）

## 共通準備
```bash
cd /path/to/assetshold
cp .env.example .env  # 無ければ作成
# 重要: .env に SESSION_SECRET を設定（長いランダム文字列）
# 重要: MARKETH_ENABLE は既定 0、本番で必要時のみ 1
npm i helmet express-rate-limit dayjs sqlite3 node-fetch@2 recharts @tanstack/react-table
# （react系は client/ 側に入れる場合は workspace 単位で調整）
```

## テスト実行（例）
```bash
npm i -D jest supertest playwright @playwright/test
npm run test
```

---
