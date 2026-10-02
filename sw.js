const CACHE_NAME = 'topscore-live-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './detail.html',
  './control.html',
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

// ネットワークリクエストのキャッチ（基本ネットワーク優先・失敗時はキャッシュ）
self.addEventListener('fetch', (event) => {
  // GAS API・QR画像生成APIへのリクエストはキャッシュせず常にネットワークへ
  if (event.request.url.includes('script.google.com') || event.request.url.includes('api.qrserver.com')) {
    return;
  }

  // それ以外も基本はネットワーク優先（更新がすぐ反映されるように）、失敗時はキャッシュ
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});