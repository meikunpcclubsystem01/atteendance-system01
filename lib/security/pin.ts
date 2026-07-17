import crypto from "crypto";

// 4桁PINは総当たり空間が1万通りしかないため、素のSHA-256ではDB閲覧者が即座に逆算できる。
// サーバーシークレットを鍵にしたHMACにすることで、DBのハッシュ値だけではPINを復元できないようにする。
export function hashPin(pin: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(pin).digest("hex");
}
