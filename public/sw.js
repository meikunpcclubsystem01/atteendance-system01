const CACHE_NAME = 'attendance-system-v1';
const STATIC_ASSETS = [
    '/',
    '/register',
    '/scanner',
];

// インストール時に基本的な静的アセットをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

// ネットワークファースト戦略（APIはキャッシュしない）
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API・認証系はネットワークのみ
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功したレスポンスをキャッシュに保存
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(() => {
                // オフライン時はキャッシュから返す
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // キャッシュにもない場合はオフラインメッセージ
                    return new Response(
                        '<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;color:white;"><div style="text-align:center;"><h1>📡 オフライン</h1><p>インターネット接続を確認してください</p></div></body></html>',
                        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                });
            })
    );
});
