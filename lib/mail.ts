import nodemailer from "nodemailer";

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
  time: Date
) => {
  const actionText = action === "IN" ? "入室" : "退室";
  const timeString = time.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const mailOptions = {
    from: `"入退室システム" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `【お知らせ】${studentName}さんが${actionText}しました`,
    text: `${studentName}さんの保護者様\n\nお世話になっております。\n\n${studentName}さんが ${timeString} に${actionText}しました。\n\nこのメールは自動送信されています。`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 メール送信成功: ${toEmail}`);
  } catch (error) {
    console.error("📧 メール送信失敗:", error);
  }
};