/* VadeMed service worker — cache offline resiliente */
var CACHE = 'vademed-v197';
var CRITICAL = ['./', 'index.html'];       /* si esto no se cachea, NO aceptamos la version nueva */
var OPTIONAL = ['icon3.png', 'icon-180.png', 'manifest.json', 'med_capsule.png', 'ic_guias.png', 'ic_calc.png', 'ic_atlas.png', 'ic_labs.png', 'ic_calc_ped.png', 'avatar_hombre.png', 'avatar_mujer.png', 'temas_extra.txt'];

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
        .then(function(m){ if(!m) throw new Error('shell incompleto'); })
        /* Shell nuevo OK -> activar de inmediato (no esperar a que se cierren las pestañas).
           Asi las correcciones llegan al usuario en la siguiente recarga, no "algun dia". */
        .then(function(){ return self.skipWaiting(); });
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

  /* Navegacion de la APP (nivel superior). NO aplica a iframes ni a temas.
     RED PRIMERO con limite de 4s: con internet SIEMPRE abre lo fresco (nunca atorado en una
     copia rota); si la red tarda o no hay, usa la copia guardada. */
  if(req.mode === 'navigate' && req.destination !== 'iframe' && !esTema){
    e.respondWith(
      caches.open(CACHE).then(function(c){
        var net = fetch(req).then(function(res){
          if(res && res.status === 200){
            var cl = res.headers.get('content-length');
            /* solo guarda si NO parece truncado (el index real pesa ~2.5MB) */
            if(!cl || parseInt(cl, 10) > 800000){ c.put('index.html', res.clone()); }
          }
          return res;
        }).catch(function(){ return null; });
        var timeout = new Promise(function(resolve){ setTimeout(function(){ resolve('T'); }, 8000); });
        return Promise.race([net, timeout]).then(function(r){
          if(r && r !== 'T') return r;
          return c.match('index.html').then(function(m){ return m || net.then(function(rr){ return rr || c.match('./'); }); });
        });
      })
    );
    return;
  }

  /* Resto (temas, icono, etc.): cache primero, si no, red y se guarda para la proxima.
     OJO: si el host RE-DIRIGE (Netlify manda .html -> minuscula sin extension), una
     respuesta "redirected" NO se puede entregar a un iframe (es una navegacion) y el
     tema queda en blanco. La reconstruimos como respuesta limpia 200 para que abra y se
     pueda cachear para offline. */
  e.respondWith(
    caches.open(CACHE).then(function(c){
      return c.match(req).then(function(cached){
        var net = fetch(req).then(function(res){
          if(res && res.redirected){
            return res.blob().then(function(b){
              var ct = res.headers.get('content-type') || 'text/html; charset=utf-8';
              var clean = new Response(b, {status:200, statusText:'OK', headers:{'content-type':ct}});
              try{ c.put(req, clean.clone()); }catch(e){}
              return clean;
            });
          }
          if(res && res.status === 200){ try{ c.put(req, res.clone()); }catch(e){} }
          return res;
        }).catch(function(){ return cached || c.match(req, {ignoreSearch:true}); });
        /* CACHE PRIMERO = apertura INSTANTANEA (como antes). La frescura la garantiza la
           etiqueta ?tv=: al editar un tema se sube VM_TVER -> URL nueva -> no esta en cache
           -> baja la nueva UNA vez y queda cacheada. Si no hay cache exacto, red. */
        return cached || net;
      });
    })
  );
});
