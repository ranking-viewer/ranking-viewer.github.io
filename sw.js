const CACHE_NAME = 'ranking-system-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/viewer/index.html',
  '/css/common.css',
  '/css/viewer.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/viewer.js',
  '/manifest.json'
];

// インストール時に静的ファイルをキャッシュ
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュの削除
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// ネットワークファースト (API通信はキャッシュしない)
self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);

  // GAS API へのアクセスは常にネットワークへ直接リクエスト
  if (url.hostname.includes('script.google.com')) {
    evt.respondWith(fetch(evt.request));
    return;
  }

  // 静的アセットはキャッシュファースト
  evt.respondWith(
    caches.match(evt.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(evt.request);
    })
  );
});