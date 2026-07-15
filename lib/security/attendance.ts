export interface AttendanceEligibility {
  isRegistered: boolean;
  guardianVerifiedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

export function attendanceEligibilityError(user: AttendanceEligibility, now = new Date()): string | null {
  if (!user.isRegistered) return "初回登録が完了していません";
  if (!user.guardianVerifiedAt) return "保護者情報が学校で確認されていません";
  if (!user.validUntil) return "保護者による利用許可が完了していません";
  if (user.validFrom && now < user.validFrom) return "利用開始日前です";
  if (now > user.validUntil) return "利用有効期限が切れています";
  return null;
}
