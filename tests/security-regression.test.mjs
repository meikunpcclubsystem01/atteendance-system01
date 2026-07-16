import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attendanceEligibilityError } from "../lib/security/attendance.ts";
import { isSchoolMailbox, normalizeEmail } from "../lib/security/email.ts";

const source = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("guardian email policy canonicalizes domains without rewriting the local part", () => {
  assert.equal(normalizeEmail(" Parent.Name@NIIGATA-MEIKUN.ED.JP "), "Parent.Name@niigata-meikun.ed.jp");
  assert.equal(isSchoolMailbox("student@NIIGATA-MEIKUN.ED.JP", "niigata-meikun.ed.jp"), true);
  assert.equal(isSchoolMailbox("parent@example.org", "niigata-meikun.ed.jp"), false);
  assert.equal(normalizeEmail("not-an-email"), null);
});

test("attendance requires registration, verified guardian, and an active permission window", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  assert.equal(attendanceEligibilityError({ isRegistered: false, guardianVerifiedAt: null, validFrom: null, validUntil: null }, now), "初回登録が完了していません");
  assert.equal(attendanceEligibilityError({ isRegistered: true, guardianVerifiedAt: null, validFrom: null, validUntil: null }, now), "保護者情報が学校で確認されていません");
  assert.equal(attendanceEligibilityError({ isRegistered: true, guardianVerifiedAt: now, validFrom: null, validUntil: null }, now), "保護者による利用許可が完了していません");
  assert.equal(attendanceEligibilityError({ isRegistered: true, guardianVerifiedAt: now, validFrom: null, validUntil: new Date("2026-07-16T00:00:00Z") }, now), null);
});

test("email confirmation GET remains non-mutating and POST owns token consumption", () => {
  const route = source("app/api/user/confirm-parent-email/route.ts");
  const getBody = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.doesNotMatch(getBody, /\$transaction|\.update|\.create|\.delete/);
  assert.match(route, /export async function POST/);
  assert.match(route, /usedAt: null/);
  assert.match(route, /guardianVersion: \{ increment: 1 \}/);
});

test("single-use capabilities and PIN attempt budgets are enforced with conditional writes", () => {
  const emailChange = source("app/api/user/change-parent-email/route.ts");
  const pinVerify = source("app/api/user/email-change-verify-pin/route.ts");
  const permission = source("app/api/parent/permission/route.ts");
  assert.match(emailChange, /consumedAt: null/);
  assert.match(emailChange, /emailChangePin\.updateMany/);
  assert.match(pinVerify, /attempts: \{ increment: 1 \}/);
  assert.match(pinVerify, /attempts: \{ lt: 5 \}/);
  assert.match(permission, /permissionToken\.updateMany/);
  assert.match(permission, /guardianVersion: decoded\.guardianVersion/);
});

test("attendance and administrator destructive actions use database-owned invariants", () => {
  const checkin = source("app/api/checkin/route.ts");
  const schema = source("prisma/schema.prisma");
  const deleteRoute = source("app/api/admin/users/[id]/route.ts");
  assert.match(checkin, /pg_advisory_xact_lock/);
  assert.match(checkin, /TransactionIsolationLevel\.ReadCommitted/);
  assert.match(checkin, /user\.updateMany/);
  assert.match(schema, /currentSeat\s+String\?\s+@unique/);
  assert.match(deleteRoute, /adminStepUpGrant\.updateMany/);
  assert.match(deleteRoute, /action: "DELETE_USER"/);
});

test("Next.js is at or above the patched 16.2.5 line", () => {
  const pkg = JSON.parse(source("package.json"));
  const [major, minor, patch] = pkg.dependencies.next.split(".").map(Number);
  assert.ok(major > 16 || (major === 16 && (minor > 2 || (minor === 2 && patch >= 5))));
});

test("mail transport keeps vulnerable Nodemailer feature paths unreachable", () => {
  const mail = source("lib/mail.ts");
  assert.match(mail, /disableFileAccess:\s*true/);
  assert.match(mail, /disableUrlAccess:\s*true/);
  assert.doesNotMatch(mail, /\braw\s*:/);
  assert.doesNotMatch(mail, /\benvelope\s*:/);
  assert.doesNotMatch(mail, /\blist\s*:/);
  assert.doesNotMatch(mail, /\bjsonTransport\s*:/);
  assert.doesNotMatch(mail, /type:\s*["']OAuth2["']/);
});
