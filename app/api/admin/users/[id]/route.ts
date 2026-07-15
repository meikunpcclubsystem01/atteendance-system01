import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { isSchoolMailbox, normalizeEmail } from "@/lib/security/email";

// 管理者権限チェック用のユーティリティ関数
async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;

  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];
  return adminEmails.includes(session.user.email);
}

// ユーザー情報（有効期限・学籍番号）の更新
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
  }

  try {
    const { id } = await params;

    // セキュリティ: URLパラメータのidの型・形式を検証
    if (!id || typeof id !== "string" || id.length > 100) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const { validFrom, validUntil, studentId, parentEmail } = await req.json();

    const data: Prisma.UserUpdateInput = {};
    if (validFrom !== undefined) data.validFrom = validFrom ? new Date(`${validFrom}T00:00:00+09:00`) : null;
    if (validUntil !== undefined) data.validUntil = validUntil ? new Date(`${validUntil}T23:59:59+09:00`) : null;

    if (studentId !== undefined) {
      if (typeof studentId === "string" && studentId.length > 50) {
        return NextResponse.json({ error: "学籍番号は50文字以内で入力してください" }, { status: 400 });
      }
      data.studentId = studentId === "" ? null : studentId;
    }

    if (parentEmail !== undefined) {
      if (parentEmail !== "") {
        const normalizedParentEmail = normalizeEmail(parentEmail);
        if (!normalizedParentEmail) {
          return NextResponse.json({ error: "不正なメールアドレス形式です" }, { status: 400 });
        }
        const allowedDomain = process.env.ALLOWED_DOMAIN || "niigata-meikun.ed.jp";
        if (isSchoolMailbox(normalizedParentEmail, allowedDomain)) {
          return NextResponse.json({ error: "学校のメールアドレスは保護者メールとして登録できません" }, { status: 400 });
        }
        data.parentEmail = normalizedParentEmail;
        data.guardianVerifiedAt = new Date();
      } else {
        data.parentEmail = null;
        data.guardianVerifiedAt = null;
      }
      data.guardianVersion = { increment: 1 };
    }

    const user = await prisma.user.update({
      where: { id },
      data,
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// ユーザーアカウントの完全削除
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
  }

  try {
    const { id } = await params;

    // セキュリティ: URLパラメータのidの型・形式を検証
    if (!id || typeof id !== "string" || id.length > 100) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // 自爆（自分自身の削除）防止機能
    const session = await getServerSession(authOptions);
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (session?.user?.email && targetUser?.email === session.user.email) {
      return NextResponse.json({ error: "Cannot delete your own admin account" }, { status: 400 });
    }

    const stepUpToken = req.headers.get("x-admin-step-up");
    if (!session?.user?.email || !stepUpToken || stepUpToken.length > 256) {
      return NextResponse.json({ error: "削除には暗証番号の再確認が必要です" }, { status: 403 });
    }

    const tokenHash = crypto.createHash("sha256").update(stepUpToken).digest("hex");
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.adminStepUpGrant.updateMany({
        where: {
          tokenHash,
          adminEmail: session.user.email!,
          action: "DELETE_USER",
          targetId: id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new Error("INVALID_STEP_UP_GRANT");
      }

      await tx.user.delete({ where: { id } });
      await tx.adminLog.create({
        data: {
          adminEmail: session.user.email!,
          action: "DELETE_USER",
          details: `ユーザー削除: ${targetUser?.name || "不明"} (${targetUser?.studentId || id})`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_STEP_UP_GRANT") {
      return NextResponse.json({ error: "暗証番号の再確認が無効または期限切れです" }, { status: 403 });
    }
    console.error("Failed to delete user:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
