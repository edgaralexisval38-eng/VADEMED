/* VadeMed service worker — cache offline resiliente */
var CACHE = 'vademed-v9';
var CRITICAL = ['./', 'index.html'];       /* si esto no se cachea, NO aceptamos la version nueva */
var OPTIONAL = ['icon.png', 'manifest.json'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      /* Criticos: deben bajar bien. Si fallan, install se rechaza y se queda el SW viejo
         (con su cache buena) — asi nunca perdemos el offline por una actualizacion a media senal. */
      var crit = Promise.all(CRITICAL.map(function(u){
        return fetch(u, {cache:'reload'}).then(function(r){
          if(!r || !r.ok) throw new Error('no se pudo cachear ' + u);
          return c.put(u, r);
        });
      }));
      /* Opcionales: si fallan, no pasa nada. */
      var opt = Promise.all(OPTIONAL.map(function(u){
        return fetch(u, {cache:'reload'}).then(function(r){ if(r && r.ok) return c.put(u, r); }).catch(function(){});
      }));
      return crit.then(function(){ return opt; })
        .then(function(){ return c.match('index.html'); })
        .then(function(m){ if(!m) throw new Error('shell incompleto'); return self.skipWaiting(); });
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    /* Solo purgamos caches viejos si el NUEVO ya quedo bien poblado. */
    caches.open(CACHE).then(function(c){ return c.match('index.html'); }).then(function(m){
      if(!m) return;   /* nuevo incompleto: conservamos lo viejo, no borramos nada */
      return caches.keys().then(function(keys){
        return Promise.all(keys.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
      });
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch(_) { return; }
  if(url.origin !== self.location.origin) return; /* deja pasar fuentes/CDN externos */

  var esTema = url.pathname.indexOf('/RESUMENCLINIC/') >= 0;

  /* Navegacion de la APP (nivel superior). NO aplica a iframes ni a temas */
  if(req.mode === 'navigate' && req.destination !== 'iframe' && !esTema){
    e.respondWith(
      caches.open(CACHE).then(function(c){
        var upd = fetch(req).then(function(res){ if(res && res.status === 200) c.put('index.html', res.clone()); return res; }).catch(function(){});
        /* offline-first para que abra siempre: primero la copia guardada, si no hay, red, si no, './' */
        return c.match('index.html').then(function(m){ return m || upd.then(function(r){ return r || c.match('./'); }); });
      })
    );
    return;
  }

  /* Resto (temas, icono, etc.): cache primero, si no, red y se guarda para la proxima */
  e.respondWith(
    caches.open(CACHE).then(function(c){
      return c.match(req).then(function(cached){
        var net = fetch(req).then(function(res){ if(res && res.status === 200) c.put(req, res.clone()); return res; }).catch(function(){ return cached; });
        return cached || net;
      });
    })
  );
});
