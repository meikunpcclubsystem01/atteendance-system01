import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.SECURITY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("SECURITY_TEST_DATABASE_URL is required");
const databaseUrl = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
  throw new Error("The security database test only accepts a local disposable PostgreSQL URL");
}

const pool = new pg.Pool({ connectionString, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const fixtureIds = [];
const runId = crypto.randomBytes(6).toString("hex");
const future = new Date(Date.now() + 86_400_000);

async function createUser(label) {
  const user = await prisma.user.create({
    data: {
      email: `security-${label}-${runId}@example.test`,
      isRegistered: true,
      guardianVerifiedAt: new Date(),
      validUntil: future,
      currentStatus: "OUT",
    },
  });
  fixtureIds.push(user.id);
  return user;
}

async function claimSeat(userId, seat) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-user:${userId}`}))`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.currentStatus !== "OUT") throw new Error("already transitioned");

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-seat:${seat}`}))`;
    const occupied = await tx.user.findFirst({
      where: { currentSeat: seat, id: { not: userId } },
      select: { id: true },
    });
    if (occupied) throw new Error("seat occupied");

    const changed = await tx.user.updateMany({
      where: { id: userId, currentStatus: user.currentStatus, currentSeat: user.currentSeat },
      data: { currentStatus: "IN", currentSeat: seat },
    });
    if (changed.count !== 1) throw new Error("state conflict");
    await tx.attendanceLog.create({ data: { userId, action: "IN" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function run() {
  const a = await createUser("a");
  const b = await createUser("b");
  const sharedSeat = `security-seat-${runId}`;
  const seatResults = await Promise.allSettled([claimSeat(a.id, sharedSeat), claimSeat(b.id, sharedSeat)]);
  assert.equal(seatResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await prisma.user.findMany({ where: { currentSeat: sharedSeat }, select: { id: true } })).length, 1);

  const c = await createUser("c");
  const transitionResults = await Promise.allSettled([
    claimSeat(c.id, `security-seat-c1-${runId}`),
    claimSeat(c.id, `security-seat-c2-${runId}`),
  ]);
  assert.equal(transitionResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await prisma.attendanceLog.findMany({ where: { userId: c.id }, select: { id: true } })).length, 1);

  const permissionHash = crypto.randomBytes(32).toString("hex");
  await prisma.permissionToken.create({
    data: { tokenHash: permissionHash, userId: c.id, guardianVersion: c.guardianVersion, expiresAt: future },
  });
  const consumePermission = () => prisma.permissionToken.updateMany({
    where: { tokenHash: permissionHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  const permissionResults = await Promise.all([consumePermission(), consumePermission()]);
  assert.equal(permissionResults.reduce((sum, result) => sum + result.count, 0), 1);

  const pinRecord = await prisma.emailChangePin.create({
    data: { userId: c.id, pin: "fixture", expiresAt: future },
  });
  const attempts = await Promise.all(Array.from({ length: 6 }, () => prisma.emailChangePin.updateMany({
    where: { id: pinRecord.id, attempts: { lt: 5 }, verified: false },
    data: { attempts: { increment: 1 } },
  })));
  assert.equal(attempts.reduce((sum, result) => sum + result.count, 0), 5);
  assert.equal((await prisma.emailChangePin.findUniqueOrThrow({ where: { id: pinRecord.id } })).attempts, 5);

  const grantHash = crypto.randomBytes(32).toString("hex");
  await prisma.adminStepUpGrant.create({
    data: { tokenHash: grantHash, adminEmail: "admin@example.test", action: "DELETE_USER", targetId: c.id, expiresAt: future },
  });
  const consumeGrant = () => prisma.adminStepUpGrant.updateMany({
    where: { tokenHash: grantHash, action: "DELETE_USER", targetId: c.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  const grantResults = await Promise.all([consumeGrant(), consumeGrant()]);
  assert.equal(grantResults.reduce((sum, result) => sum + result.count, 0), 1);

  const emailHash = crypto.randomBytes(32).toString("hex");
  await prisma.emailChangeToken.create({
    data: { tokenHash: emailHash, userId: c.id, newParentEmail: "new@example.test", guardianVersion: c.guardianVersion, expiresAt: future },
  });
  const consumeEmailChange = () => prisma.$transaction(async (tx) => {
    const token = await tx.emailChangeToken.updateMany({
      where: { tokenHash: emailHash, usedAt: null, revokedAt: null, guardianVersion: c.guardianVersion },
      data: { usedAt: new Date() },
    });
    if (token.count !== 1) return false;
    const user = await tx.user.updateMany({
      where: { id: c.id, guardianVersion: c.guardianVersion },
      data: { parentEmail: "new@example.test", guardianVersion: { increment: 1 } },
    });
    if (user.count !== 1) throw new Error("stale guardian");
    return true;
  });
  const emailResults = await Promise.allSettled([consumeEmailChange(), consumeEmailChange()]);
  assert.equal(emailResults.filter((result) => result.status === "fulfilled" && result.value === true).length, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: c.id } })).guardianVersion, c.guardianVersion + 1);

  console.log("database security invariants passed");
}

try {
  await run();
} finally {
  if (fixtureIds.length > 0) {
    await prisma.adminStepUpGrant.deleteMany({ where: { targetId: { in: fixtureIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } }).catch(() => undefined);
  }
  await prisma.$disconnect();
  await pool.end();
}
