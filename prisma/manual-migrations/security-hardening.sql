-- This repository has no Prisma migration history, so this is an explicit operator migration.
-- Resolve every row returned by the following query before applying the unique seat index:
-- SELECT "currentSeat", COUNT(*) FROM "User" WHERE "currentSeat" IS NOT NULL GROUP BY "currentSeat" HAVING COUNT(*) > 1;

ALTER TABLE "User"
ADD COLUMN "parentEmailChangedAt" TIMESTAMP(3),
ADD COLUMN "guardianVerifiedAt" TIMESTAMP(3),
ADD COLUMN "guardianVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "User_currentSeat_key" ON "User"("currentSeat");

CREATE TABLE "EmailChangePin" (
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

CREATE TABLE "EmailChangeToken" (
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

CREATE TABLE "PermissionToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guardianVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PermissionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminStepUpGrant" (
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

CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE UNIQUE INDEX "PermissionToken_tokenHash_key" ON "PermissionToken"("tokenHash");
CREATE UNIQUE INDEX "AdminStepUpGrant_tokenHash_key" ON "AdminStepUpGrant"("tokenHash");
CREATE INDEX "EmailChangePin_userId_createdAt_idx" ON "EmailChangePin"("userId", "createdAt");
CREATE INDEX "EmailChangeToken_userId_createdAt_idx" ON "EmailChangeToken"("userId", "createdAt");
CREATE INDEX "PermissionToken_userId_createdAt_idx" ON "PermissionToken"("userId", "createdAt");
CREATE INDEX "AdminStepUpGrant_adminEmail_action_targetId_idx" ON "AdminStepUpGrant"("adminEmail", "action", "targetId");

ALTER TABLE "EmailChangePin"
ADD CONSTRAINT "EmailChangePin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailChangeToken"
ADD CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PermissionToken"
ADD CONSTRAINT "PermissionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
