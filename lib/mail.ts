import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendNotificationEmail = async (
  toEmail: string,
  studentName: string,
  action: "IN" | "OUT",
  time: Date,
  userId: string
) => {
  const actionText = action === "IN" ? "入室" : "退室";
  const timeString = time.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  // 保護者用履歴リンクの生成
  let historyLinkText = "";
  if (process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_URL) {
    const historyToken = jwt.sign(
      { userId, purpose: "parent_history" },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: "30d" }
    );
    const historyLink = `${process.env.NEXTAUTH_URL}/parent/history?token=${historyToken}`;
    historyLinkText = `\n\n▼ 利用状況を確認する\n${historyLink}`;
  }

  const mailOptions = {
    from: `"入退室システム" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `【お知らせ】${studentName}さんが${actionText}しました`,
    text: `${studentName}さんの保護者様\n\nお世話になっております。\n\n${studentName}さんが ${timeString} に${actionText}しました。${historyLinkText}\n\nこのメールは自動送信されています。`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 メール送信成功: ${toEmail}`);
  } catch (error) {
    console.error("📧 メール送信失敗:", error);
  }
};

export const sendPermissionRequestEmail = async (
  toEmail: string,
  studentName: string,
  magicLink: string,
  requestValidFrom?: string,
  requestValidUntil?: string
) => {
  const datesText = (requestValidFrom || requestValidUntil)
    ? `\n■ 本人の希望する利用期間\n開始日: ${requestValidFrom || '指定なし（今すぐ）'}\n終了日: ${requestValidUntil || '指定なし（無期限）'}\n`
    : "";

  const mailOptions = {
    from: `"入退室システム" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `【重要】${studentName}さんの自習室システム利用許可のお願い`,
    text: `${studentName}さんの保護者様\n\nお世話になっております。\n${studentName}さんより、パソコン部システム（自習室）の利用許可の申請がありました。\n${datesText}\n以下の専用リンクからアクセスし、本人の希望内容を確認のうえ、利用を許可する期間（開始日・終了日）を設定してください。\n\n▼ 設定・許可ページ（パスワード不要）\n${magicLink}\n\n※このリンクの有効期限は7日間です。\n※心当たりがない場合は、このメールを破棄してください。`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 許可申請メール送信成功: ${toEmail}`);
  } catch (error) {
    console.error("📧 許可申請メール送信失敗:", error);
    throw error;
  }
};

export const sendParentEmailChangeConfirmation = async (
  toEmail: string,
  studentName: string,
  confirmLink: string
) => {
  const mailOptions = {
    from: `"入退室システム" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `【確認】${studentName}さんの保護者メールアドレス変更`,
    text: `入退室システムからのお知らせ\n\n${studentName}さんより、保護者のメールアドレスをこのアドレスに変更するリクエストがありました。\n\nこの変更に同意する場合は、以下のリンクをクリックしてください。\n\n▼ メールアドレス変更を確認する\n${confirmLink}\n\n※このリンクの有効期限は7日間です。\n※心当たりがない場合は、このメールを無視してください。変更は行われません。`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 メール変更確認メール送信成功: ${toEmail}`);
  } catch (error) {
    console.error("📧 メール変更確認メール送信失敗:", error);
    throw error;
  }
};