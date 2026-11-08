const VERSION='aan-shell-2026-11-v7-reader-zoom',MEDIA='aan-media-2026-11';
const CORE=['./','./index.html','./styles.css?v=7','./app.js?v=7','./data.js?v=6','./supplement.js?v=6','./image-library.js?v=6','./zip-store.js','./manifest.webmanifest?v=6','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aan-shell-')&&k!==VERSION).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  const isMedia=url.pathname.includes('/images/')||url.pathname.includes('/thumbs/');
  if(isMedia){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(MEDIA).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
      return response;
    })));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
    return response;
  }).catch(()=>caches.match(event.request)));
});
