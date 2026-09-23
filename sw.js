const CACHE = 'savage-order-v412';

const ASSETS = [
  './',
  './index.html',
  './styles.css?v=411',
  './app.js?v=412',
  './pwa.js?v=412',
  './config.js?v=407',
  './manifest.webmanifest?v=401'
];


/* =========================================================
   安裝 Service Worker
========================================================= */

self.addEventListener('install', event => {

  self.skipWaiting();

  event.waitUntil(

    caches
      .open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .catch(error => {
        console.warn(
          'Cache install failed',
          error
        );
      })

  );

});


/* =========================================================
   啟用新版 Service Worker
========================================================= */

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


/* =========================================================
   網頁快取
========================================================= */

// Only versioned local static assets use cache-first. Orders, payment calls,
// navigation and live menu responses always use the network.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.searchParams.has('v') ||
      !/\.(?:js|css|webmanifest)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});

/* =========================================================
   接收 Cloudflare Web Push
========================================================= */

self.addEventListener('push', event => {

  let data = {};

  try{

    if(event.data){

      data =
        event.data.json();

    }

  }
  catch(error){

    data = {

      body:
        event.data
          ? event.data.text()
          : '訂單狀態已更新'

    };

  }


  const title =
    data.title ||
    '小野人配送通知';


  const options = {

    body:
      data.body ||
      '您的訂單狀態已更新',

    icon:
      './icon-192.svg',

    badge:
      './icon-192.svg',

    tag:
      data.tag ||
      'savage-order-delivery',

    renotify:true,

    data:{

      url:
        data.url ||
        './?source=push',

      status:
        data.status ||
        '',

      mall:
        data.mall ||
        ''

    }

  };


  event.waitUntil(

    self.registration
      .showNotification(
        title,
        options
      )

  );

});


/* =========================================================
   客人點通知
========================================================= */

self.addEventListener(
  'notificationclick',
  event => {

    event.notification.close();


    const targetUrl =

      event.notification.data?.url ||

      './?source=push';


    event.waitUntil(

      clients
        .matchAll({

          type:'window',

          includeUncontrolled:true

        })

        .then(windowClients => {

          /*
           * 如果小野人 App 已經開著
           * 直接切回去
           */

          for(
            const client of
            windowClients
          ){

            if('focus' in client){

              if('navigate' in client){

                client.navigate(
                  targetUrl
                );

              }

              return client.focus();

            }

          }


          /*
           * App 沒開
           * 直接開啟
           */

          if(
            clients.openWindow
          ){

            return clients.openWindow(
              targetUrl
            );

          }

        })

    );

  }
);