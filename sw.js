importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE='savage-order-v402';
const ASSETS=[
  './',
  './index.html',
  './styles.css?v=3811',
  './app.js?v=3811',
  './pwa.js?v=402',
  './config.js?v=380',
  './manifest.webmanifest?v=401'
];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(ASSETS))
      .catch(()=>{})
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request)
      .then(r=>{
        if(r&&r.ok){
          const c=r.clone();
          caches.open(CACHE).then(x=>x.put(e.request,c)).catch(()=>{});
        }
        return r;
      })
      .catch(()=>caches.match(e.request))
  );
});
