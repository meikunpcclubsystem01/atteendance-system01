// インメモリのレート制限ユーティリティ
// 本番環境ではRedisを推奨するが、小規模運用ではこれで十分

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lockedUntil?: number;
}

const stores: Record<string, Map<string, RateLimitEntry>> = {};

function getStore(name: string): Map<string, RateLimitEntry> {
    if (!stores[name]) {
        stores[name] = new Map();
    }
    return stores[name];
}

/**
 * レート制限チェック
 * @param storeName - ストア名（例: "pin_verify", "email_send"）
 * @param key - 識別キー（例: ユーザーID、メールアドレス）
 * @param maxAttempts - 最大試行回数
 * @param windowMs - ウィンドウ時間（ミリ秒）
 * @param lockoutMs - ロックアウト時間（ミリ秒、省略時はウィンドウ時間）
 * @returns { allowed: boolean, retryAfterMs?: number }
 */
export function checkRateLimit(
    storeName: string,
    key: string,
    maxAttempts: number,
    windowMs: number,
    lockoutMs?: number
): { allowed: boolean; retryAfterMs?: number } {
    const store = getStore(storeName);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry) {
        store.set(key, { count: 1, firstAttempt: now });
        return { allowed: true };
    }

    // ロックアウト中かチェック
    if (entry.lockedUntil && now < entry.lockedUntil) {
        return { allowed: false, retryAfterMs: entry.lockedUntil - now };
    }

    // ウィンドウ期間が過ぎていたらリセット
    if (now - entry.firstAttempt > windowMs) {
        store.set(key, { count: 1, firstAttempt: now });
        return { allowed: true };
    }

    // 制限超過
    if (entry.count >= maxAttempts) {
        entry.lockedUntil = now + (lockoutMs || windowMs);
        return { allowed: false, retryAfterMs: lockoutMs || windowMs };
    }

    entry.count++;
    return { allowed: true };
}

/**
 * レート制限のリセット（成功時に呼ぶ）
 */
export function resetRateLimit(storeName: string, key: string): void {
    const store = getStore(storeName);
    store.delete(key);
}

// 古いエントリーを定期的にクリーンアップ（メモリリーク防止）
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24時間
    Object.values(stores).forEach(store => {
        store.forEach((entry, key) => {
            if (now - entry.firstAttempt > maxAge) {
                store.delete(key);
            }
        });
    });
}, 60 * 60 * 1000); // 1時間ごと
