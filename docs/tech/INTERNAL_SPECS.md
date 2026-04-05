# 🏫 自習室入退室管理システム：内部技術仕様書 (Internal Specs)

本資料は、システムの核心となるロジックとセキュリティ仕様を網羅した、開発・保守者向けの詳細ドキュメントです。

---

## 1. 認証・セキュリティ (Security Deep-Dive)

### 1.1 QRコード (JWT) プロトコル
- **アルゴリズム**: HMAC SHA256 (HS256)
- **署名キー**: `NEXTAUTH_SECRET` (環境変数)
- **TTL (有効期限)**: 60秒
- **検証ロジック**: 
    - `/api/scanner/verify` で `jsonwebtoken.verify()` を実行。
    - 署名、期限、および `purpose: "qr"` クレームをチェック。
- **防止策**: フロントエンドは `setInterval` で30秒ごとに新しいトークンを fetch し、常に最新の有効なQRを表示。

### 1.2 保護者用マジックリンク (Idempotency)
- **仕組み**: トークン検証後、その JWT のシグネチャを SHA-256 でハッシュ化し、`SystemSetting` テーブルに `used_permission_[Hash]` キーで保存。
- **効果**: 同一リンクの2回目以降のクリックは DB 照会により拒否される（再利用防止）。

---

## 2. データベース物理設計 (Data Modeling)

| テーブル名 | 主要フィールド | 役割 / ロジック |
| :--- | :--- | :--- |
| `User` | `validUntil` (DateTime) | この日付を過ぎるとログインは可能だがQRボタンが無効化される。 |
| | `studentId` (String, UK) | Google Auth ログイン時に email の `@` 以前を抽出して自動付与。 |
| | `currentStatus` (Enum) | `IN` または `OUT`。打刻の度に反転。 |
| `AttendanceLog` | `action` + `userId` | 入退室履歴。ペアリングすることで滞在時間を算出可能。 |
| `SystemSetting`| `key: seat_layout` | 二次元配列 `string[][]` を文字列化した JSON。 |

---

## 3. API ロジック詳細

### 3.1 入退室 (`/api/checkin`)
1. **検証**: QRトークンの整合性チェック。
2. **トランザクション (`$transaction`)**:
    - `User.update`: ステータス更新、座席番号のセット/クリア。
    - `AttendanceLog.create`: 打刻履歴作成。
3. **通知**: `sendNotificationEmail` を `await` せずに非同期実行し、レスポンス速度を優先。

### 3.2 深夜強制退出 (`/api/cron/reset-seats`)
- **クエリ**: `currentStatus: "IN"` のユーザーを全抽出。
- **一括更新**: 全員のステータスを `OUT` にし、`currentSeat` を `null` に。
- **目的**: 翌日の座席占有を防ぐためのクリーンアップ。

---

## 4. インフラ構成 (Ops)

### Nginx 直書き設定例 (Reverse Proxy)
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Docker ライフサイクル
- `npx prisma generate`: ビルド済みの型定義を生成。
- `npx prisma db push`: スキーマ修正を DB に反映（マイグレーションなしの軽量同期）。
