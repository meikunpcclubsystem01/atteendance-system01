# 出欠管理システム

新潟明訓PC同好会向けの出欠・在室管理システムです。

## 本番環境の場所

- 公開URL: [https://entry.meikun-pc.club](https://entry.meikun-pc.club)
- VPS上の実体: `/var/www/attendance-system`
- ホームから開く入口: `~/attendance-system`
- Nginx設定: `/etc/nginx/sites-available/attendance`

`/var/www` は隠しディレクトリではありませんが、VPSへログインした直後のホームディレクトリからは見えません。初回配置後に次のシンボリックリンクを作ると、ターミナルやSFTPから `~/attendance-system` として見つけられます。

```bash
ln -s /var/www/attendance-system ~/attendance-system
cd ~/attendance-system
```

リンクは入口を追加するだけで、実体の配置、Nginx、Dockerの設定は変わりません。詳しい初回構築と更新手順は [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) を参照してください。

## ローカル開発

```bash
npm ci
cp .env.example .env
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いて確認します。環境変数の実値は `.env` のみに保存し、リポジトリへコミットしないでください。

## 検証

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

DBスキーマを変更するリリースでは、アプリ更新前に [セキュリティ更新用SQLの注意事項](./prisma/manual-migrations/README.md) も確認してください。

## 関連資料

- [利用者向けガイド](./USER_GUIDE.md)
- [運用・引き継ぎ資料](./PROJECT_HANDOVER.md)
- [技術仕様](./docs/tech/INTERNAL_SPECS.md)
