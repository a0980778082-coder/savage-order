const CACHE='savage-pos-v374';
const ASSETS=[
  './staff.html?v=374',
  './staff.css?v=377',
  './staff.js?v=377',
  './config.js?v=377',
  './manifest.webmanifest?v=377',
  './linepay-qr.png?v=374'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).catch(err=>console.warn('預快取失敗',err))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(!response || !response.ok) throw new Error('HTTP '+(response?response.status:'no response'));
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(event.request);
        if(cached) return cached;
        return new Response('Resource unavailable',{
          status:503,
          statusText:'Service Unavailable',
          headers:{'Content-Type':'text/plain; charset=utf-8'}
        });
      })
  );
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=(event.notification.data&&event.notification.data.url)||'./staff.html?v=374';
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
