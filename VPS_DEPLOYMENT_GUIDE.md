# 🔰 初心者向け：Ubuntu VPSへの出欠システム デプロイ完全ガイド（新リポジトリ版）

サーバーに詳しくない方でも、順番通りに進めれば「既存のWordPressを壊さずに」「サブドメインで出欠システムを動かす」ことができるマニュアルです。
現在、ソースコードは新しいGitHubリポジトリ（`atteendance-system01`）へ移行済みですので、その状態からスタートします。ゆっくり一つずつ進めていきましょう！

---

## ステップ1：お名前.com等で「サブドメイン」を作る

同じサーバー（VPS）で2つの異なるサイト（WordPressと今回の出欠システム）を動かすには、**URL（ドメイン）を分ける**のが一番簡単で安全です。
例えば、元のWordPressが `meikun.ed.jp` なら、今回のシステムは `attendance.meikun.ed.jp` のような名前にします。これを「サブドメイン」と呼びます。

1. ドメインを購入したサイト（お名前.comやムームードメインなど）の管理画面にログインします。
2. 「DNSレコード設定」という画面を探します。
3. 以下の内容で新しい設定（レコード）を追加します。
   - **タイプ（Type）**: `A`
   - **ホスト名（名前）**: 例として `attendance`
   - **値（IPアドレス）**: あなたのVPSのIPアドレス（例: `123.45.67.89`）
4. 保存します。（※反映されるまで数十分かかることがあります）

---

## ステップ2：VPSの中に「プログラムの置き場所」を作る

ここからは黒い画面（ターミナル / TeraTermなど）でVPSにログインして作業します。

1. **VPSにログインします**
   ```bash
   ssh ubuntu@あなたのVPSのIPアドレス
   ```

2. **プログラムを置くためのフォルダを作ります**
   今回は `/var/www` という場所の下に作ります。
   ```bash
   cd /var/www/
   sudo mkdir attendance-system
   sudo chown -R ubuntu:ubuntu attendance-system
   ```

3. **プログラム（ソースコード）を設置します**
   先ほど作成した**新しいリポジトリ**からダウンロードします。
   ```bash
   cd /var/www/attendance-system
   
   # 最後の「 .」を忘れずに！（このフォルダの中に中身を展開するという意味です）
   git clone https://github.com/meikunpcclubsystem01/atteendance-system01.git .
   ```

---

## ステップ3：秘密のパスワードファイル（`.env`）を作る

システムを動かす上で必要なパスワード（データベースやGoogleログインの鍵）を設定します。

1. **`.env`ファイルを作成して編集画面を開きます**
   ```bash
   nano .env
   ```
2. **以下の内容をコピー＆ペーストし、自分の情報に書き換えます**
   ```env
   # --- データベース ---
   DATABASE_URL="postgresql://postgres:正しいパスワード@db.dtmkgibvktcxaohlmxip.supabase.co:5432/postgres"

   # --- Googleログイン ---
   GOOGLE_CLIENT_ID="あなたのCLIENT_ID"
   GOOGLE_CLIENT_SECRET="あなたのCLIENT_SECRET"

   # --- システムの設定 ---
   # ステップ1で作ったサブドメインのURLにします（最後は / なし）
   NEXTAUTH_URL="https://entry.meikun-pc.club"
   
   # パスワードなどを暗号化するための適当な文字列
   NEXTAUTH_SECRET="ここは何か長くて適当な英数字の羅列にしてね"

   # --- メール・管理者設定 ---
   EMAIL_USER="meikunpcclubsystem01@gmail.com"
   EMAIL_PASS="cpxjbbdvutgfvcdt"
   ALLOWED_DOMAIN="niigata-meikun.ed.jp"
   NEXT_PUBLIC_ALLOWED_DOMAIN="niigata-meikun.ed.jp"
   ADMIN_EMAILS="meikunpcclubsystem01@gmail.com"
   ADMIN_PIN="あなたの管理用PIN"
   ```
3. **保存して閉じます**
   キーボードの `Ctrl` キーを押しながら `O`（オー）を押してEnter。
   次に `Ctrl` キーを押しながら `X` を押して画面を閉じます。

---

## ステップ4：Docker（ドッカー）でプログラムを起動する

Dockerは、「プログラムを動かすための箱」です。これを使うことで、サーバーを汚さずにシステムを動かせます。

1. **以下のコマンドを実行して、システムを立ち上げます**
   ```bash
   # VPS上で初めて実行する場合はビルドが始まります
   sudo docker compose up -d --build
   ```
   *※初回はダウンロードや組み立て（ビルド）が行われるため、5〜10分ほど時間がかかります。気長に待ちましょう。*

2. **「Started」や「done」と表示されれば成功です！**
   これで、VPSの「裏側（見えないところ）」でシステムが動き始めました。

---

## ステップ5：Nginx（エンジンエックス）で表門を開ける

VPSの裏側でシステムが動いているので、今度は外部からのアクセス（ステップ1で作ったURLへのアクセス）を裏側に案内する設定をします。これがNginxの役割です。
WordPressを壊さないように、慎重に追加します。

1. **Nginxの設定ファイルを作成します**
   ```bash
   sudo nano /etc/nginx/sites-available/attendance
   ```

2. **以下の内容をコピー＆ペーストします（ドメイン部分は書き換えてね）**
   ```nginx
   server {
       server_name entry.meikun-pc.club;

       location / {
           # アクセスが来たら、裏で動いているDocker(ポート3000番)にお客さんを案内する
           proxy_pass http://localhost:3000;
           
           # おまじない（決まり文句）
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. **保存して閉じます**（`Ctrl+O` → `Enter` → `Ctrl+X`）

4. **今作った設定を「有効化」します**
   ```bash
   sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
   ```

5. **設定の書き間違いがないかチェックし、Nginxを再起動します**
   ```bash
   # チェック（syntax is ok と出ればOK）
   sudo nginx -t

   # 再起動して設定を適用
   sudo systemctl reload nginx
   ```

---

## ステップ6：サイトをHTTPS（鍵付きマーク）にする

最後に、このままだと「保護されていない通信」になってしまうため、SSL証明書を発行します。（すでにWordPress用に入っている `certbot` を使います）

1. **以下のコマンドを実行します**
   ```bash
   sudo certbot --nginx -d entry.meikun-pc.club
   ```
2. 途中で「HTTPのアクセスをHTTPSに強制的に移動させますか？」みたいな英語が出た場合は、**2 (Redirect)** を選んでEnterを押してください。

---

## ステップ7（おまけ）：今後アップデートを反映する方法

手元のパソコンや別の場所でプログラムを書き換えてGitHubにPushした場合、VPS側のシステムにもその変更を「反映（Pull）」する必要があります。アップデートする時は以下の手順を行ってください。

1. **VPSにログインしてフォルダに移動**
   ```bash
   ssh ubuntu@あなたのVPSのIPアドレス
   cd /var/www/attendance-system
   ```

2. **GitHubから最新のコードを引っ張ってくる（Pull）**
   ```bash
   git pull origin main
   ```

3. **Dockerを一度止めて、ビルドし直して起動する**
   プログラムが変わったので、今の箱を壊して新しい箱を作り直します。（データは消えないので安心してください）
   ```bash
   # 停止
   sudo docker compose down
   # 再構築して起動
   sudo docker compose up -d --build
   ```

これで最新プログラムに入れ替わります！

---

🎉 **これで完了です！お疲れ様でした！** 🎉

スマホやパソコンのブラウザから `https://entry.meikun-pc.club` にアクセスしてみてください。あなたの作った出欠システムが表示されるはずです。
