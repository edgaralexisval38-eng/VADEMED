/* VadeMed service worker — cache offline */
var CACHE = 'vademed-v1';
var SHELL = ['./', 'index.html', 'icon.png', 'manifest.json'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(SHELL.map(function(u){
        return fetch(u, {cache:'reload'}).then(function(r){ if(r && r.ok) return c.put(u, r); }).catch(function(){});
      }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch(_) { return; }
  if(url.origin !== self.location.origin) return; /* deja pasar fuentes/CDN externos */

  /* Navegación (abrir la app): caché primero para que SIEMPRE abra, y actualiza en segundo plano */
  if(req.mode === 'navigate'){
    e.respondWith(
      caches.open(CACHE).then(function(c){
        var upd = fetch(req).then(function(res){ if(res && res.status === 200) c.put('index.html', res.clone()); return res; }).catch(function(){});
        return c.match('index.html').then(function(m){ return m || upd.then(function(r){ return r || c.match('./'); }); });
      })
    );
    return;
  }

  /* Resto (temas, ícono, etc.): caché primero, si no, red y se guarda para la próxima */
  e.respondWith(
    caches.open(CACHE).then(function(c){
      return c.match(req).then(function(cached){
        var net = fetch(req).then(function(res){ if(res && res.status === 200) c.put(req, res.clone()); return res; }).catch(function(){ return cached; });
        return cached || net;
      });
    })
  );
});
