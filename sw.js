const CACHE = 'savage-pos-v373';

const ASSETS = [
  './staff.html?v=373',
  './staff.css?v=373',
  './staff.js?v=373',
  './config.js?v=373',
  './manifest.webmanifest?v=373'
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .catch(error => console.warn('預快取失敗：', error))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /*
   * 客人前台圖片、QR Code 與一般資源：
   * 優先使用網路，失敗時才找快取。
   */
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || !response.ok) {
          throw new Error(`HTTP ${response ? response.status : 'no response'}`);
        }

        const copy = response.clone();

        caches.open(CACHE).then(cache => {
          cache.put(event.request, copy).catch(() => {});
        });

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);

        if (cached) {
          return cached;
        }

        /*
         * 快取也沒有時，回傳真正的錯誤 Response，
         * 避免 Failed to convert value to Response。
         */
        return new Response('Resource unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url =
    event.notification.data?.url ||
    './staff.html?v=373';

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(clientList => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }

        return clients.openWindow(url);
      })
  );
});