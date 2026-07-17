-- 座席別利用統計のため、入退室ログに座席カラムを追加する。
-- 追加のみで既存行は変更しない（過去ログの seat は NULL のまま）。
-- アプリ更新前に本番DBへ適用すること。再実行しても安全。

BEGIN;

ALTER TABLE "AttendanceLog" ADD COLUMN IF NOT EXISTS "seat" TEXT;

COMMIT;
