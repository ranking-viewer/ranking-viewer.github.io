const CACHE_NAME = 'topscore-live-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './404.html',
  './css/common.css',
  './css/viewer.css',
  './js/config.js',
  './js/viewer.js',
  './manifest.json',
  './img/guide1.png',
  './img/guide2.png',
  './img/guide3.png',
  './img/guide4.png',
  './img/icon-192.png',
  './img/icon-512.png'
];

// インストール時にファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ネットワークリクエストのキャッチ（キャッシュファースト）
self.addEventListener('fetch', (event) => {
  // GAS APIへのリクエストはキャッシュせず常にネットワークへ
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});