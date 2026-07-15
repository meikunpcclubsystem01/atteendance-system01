-- This repository has no Prisma migration history, so this is an explicit operator migration.
-- Resolve every row returned by the following query before applying the unique seat index:
-- SELECT "currentSeat", COUNT(*) FROM "User" WHERE "currentSeat" IS NOT NULL GROUP BY "currentSeat" HAVING COUNT(*) > 1;

BEGIN;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "parentEmailChangedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "guardianVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "guardianVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS "User_currentSeat_key" ON "User"("currentSeat");

CREATE TABLE IF NOT EXISTS "EmailChangePin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChangePin_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailChangePin"
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EmailChangeToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newParentEmail" TEXT NOT NULL,
    "guardianVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

-- Older installations may already have the original token table with only
-- tokenHash/usedAt/createdAt. Complete that table without deleting its rows.
ALTER TABLE "EmailChangeToken"
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ADD COLUMN IF NOT EXISTS "newParentEmail" TEXT,
ADD COLUMN IF NOT EXISTS "guardianVersion" INTEGER,
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

ALTER TABLE "EmailChangeToken"
ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "newParentEmail" SET NOT NULL,
ALTER COLUMN "guardianVersion" SET NOT NULL,
ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "PermissionToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guardianVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PermissionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminStepUpGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminStepUpGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "PermissionToken_tokenHash_key" ON "PermissionToken"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminStepUpGrant_tokenHash_key" ON "AdminStepUpGrant"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailChangePin_userId_createdAt_idx" ON "EmailChangePin"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailChangeToken_userId_createdAt_idx" ON "EmailChangeToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PermissionToken_userId_createdAt_idx" ON "PermissionToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminStepUpGrant_adminEmail_action_targetId_idx" ON "AdminStepUpGrant"("adminEmail", "action", "targetId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'EmailChangePin_userId_fkey'
    ) THEN
        ALTER TABLE "EmailChangePin"
        ADD CONSTRAINT "EmailChangePin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'EmailChangeToken_userId_fkey'
    ) THEN
        ALTER TABLE "EmailChangeToken"
        ADD CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PermissionToken_userId_fkey'
    ) THEN
        ALTER TABLE "PermissionToken"
        ADD CONSTRAINT "PermissionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
