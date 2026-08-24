importScripts("./version.js");
const CACHE=`poollog-mini-${self.FPL_VERSION || "dev"}-postfreeze-20260824b`;
const ASSETS=["./","./index.html","./styles.css","./version.js","./app.js","./manifest.webmanifest","./sam-logo.png","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./favicon-32.png"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(event.request.url.startsWith(self.location.origin)){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(event.request).then(r=>r || caches.match("./index.html")))
  );
});
