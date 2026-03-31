/* ============================================================
   sw.js — Service Worker de NewsScope PWA
   Estrategias de caché para funcionamiento offline y rendimiento
============================================================ */

/* ─── CONFIGURACIÓN DEL CACHÉ ─────────────────────────────── */

// Versión del caché: cambia este número cada vez que actualices
// el app (p.ej. "newscope-v2") para forzar la reinstalación.
const VERSION_CACHE     = 'newscope-v1';

// Caché para los archivos estáticos de la app (shell)
const CACHE_SHELL       = `${VERSION_CACHE}-shell`;

// Caché para las respuestas de la API de noticias
const CACHE_API         = `${VERSION_CACHE}-api`;

// Lista de archivos que se guardan en el primer arranque.
// IMPORTANTE: Si renombras o mueves alguno de estos archivos,
// actualiza también esta lista.
const ARCHIVOS_SHELL = [
  './',
  './index.html',
  './estilos.css',
  './script.js',
  './manifest.json',
  // Fuentes de Google (se guardan al primer uso si hay conexión)
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap'
];

// Tiempo máximo (en ms) que se espera una respuesta de la API
// antes de intentar servir desde caché. 5 segundos es un buen valor.
const TIMEOUT_API = 5000;


/* ─── EVENTO: INSTALL ─────────────────────────────────────── */
// Se dispara cuando el Service Worker se instala por primera vez.
// Aquí pre-cacheamos todos los archivos estáticos de la app.

self.addEventListener('install', evento => {
  console.log('[SW] Instalando NewsScope SW…');

  evento.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => {
        console.log('[SW] Pre-cacheando archivos de la app…');
        // addAll falla si uno solo falla; usamos add individual para más robustez
        return Promise.allSettled(
          ARCHIVOS_SHELL.map(url => cache.add(url).catch(err => {
            console.warn(`[SW] No se pudo cachear: ${url}`, err);
          }))
        );
      })
      .then(() => {
        console.log('[SW] Shell instalada correctamente.');
        // Activar inmediatamente sin esperar a que se cierren las pestañas viejas
        return self.skipWaiting();
      })
  );
});


/* ─── EVENTO: ACTIVATE ────────────────────────────────────── */
// Se dispara cuando el SW se activa (después del install).
// Aquí limpiamos los cachés viejos de versiones anteriores.

self.addEventListener('activate', evento => {
  console.log('[SW] Activando NewsScope SW…');

  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres
          .filter(nombre => nombre.startsWith('newscope-') && !nombre.startsWith(VERSION_CACHE))
          .map(nombreViejo => {
            console.log('[SW] Eliminando caché viejo:', nombreViejo);
            return caches.delete(nombreViejo);
          })
      ))
      .then(() => {
        console.log('[SW] SW activo. Tomando control de clientes existentes.');
        // Tomar control de todas las pestañas abiertas inmediatamente
        return self.clients.claim();
      })
  );
});


/* ─── EVENTO: FETCH ───────────────────────────────────────── */
// Intercepta TODAS las peticiones HTTP que hace la app.
// Aplica estrategias distintas según el tipo de recurso.

self.addEventListener('fetch', evento => {
  const url = new URL(evento.request.url);

  // ── 1. Peticiones a la API de noticias ──────────────────
  // Estrategia: Network First con fallback a caché
  // Si hay red → responde con datos frescos y guarda en caché.
  // Si no hay red → devuelve la última respuesta guardada.
  if (url.hostname === 'api.thenewsapi.com') {
    evento.respondWith(estrategiaNetworkFirstAPI(evento.request));
    return;
  }

  // ── 2. Fuentes de Google Fonts ──────────────────────────
  // Estrategia: Stale While Revalidate
  // Sirve desde caché inmediatamente y actualiza en segundo plano.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evento.respondWith(estrategiaStaleWhileRevalidate(evento.request, CACHE_SHELL));
    return;
  }

  // ── 3. Archivos estáticos de la app (HTML, CSS, JS) ─────
  // Estrategia: Cache First con fallback a red
  // Sirve desde caché si existe; si no, va a la red y guarda.
  if (url.origin === self.location.origin) {
    evento.respondWith(estrategiaCacheFirst(evento.request));
    return;
  }

  // ── 4. Cualquier otra petición ──────────────────────────
  // Dejar pasar a la red normalmente (imágenes externas, etc.)
  // pero intentar guardar en caché shell si es exitosa.
  evento.respondWith(
    fetch(evento.request).catch(() => caches.match(evento.request))
  );
});


/* ─── ESTRATEGIA: CACHE FIRST ─────────────────────────────── */
// Busca en caché → si existe, devuelve.
// Si no, va a la red, guarda la respuesta y la devuelve.
// Ideal para: HTML, CSS, JS (archivos del app shell).

async function estrategiaCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] Cache First — desde caché:', request.url);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_SHELL);
      cache.put(request, response.clone());
      console.log('[SW] Cache First — desde red (guardado):', request.url);
    }
    return response;
  } catch {
    // Sin red y sin caché: devolver página offline genérica si existe
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Sin conexión', { status: 503 });
  }
}


/* ─── ESTRATEGIA: NETWORK FIRST CON TIMEOUT (para la API) ── */
// Intenta la red con un timeout.
// Si la red responde a tiempo → guarda en caché y devuelve.
// Si la red falla o tarda demasiado → devuelve desde caché.
// Si no hay caché → devuelve un JSON de error amigable.

async function estrategiaNetworkFirstAPI(request) {
  const cache = await caches.open(CACHE_API);

  try {
    // Carrera entre la petición real y el timeout
    const response = await Promise.race([
      fetch(request.clone()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_API)
      )
    ]);

    if (response.ok) {
      // Guardar copia en caché para uso offline futuro
      cache.put(request, response.clone());
      console.log('[SW] API Network First — red OK:', request.url);
    }
    return response;

  } catch (err) {
    console.warn('[SW] API sin red, buscando en caché…', err.message);
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] API — desde caché:', request.url);
      return cached;
    }

    // Sin red y sin caché: devolver JSON de error amigable
    return new Response(
      JSON.stringify({
        error: true,
        message: 'Sin conexión a internet. Los datos en caché no están disponibles para esta consulta.',
        offline: true
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}


/* ─── ESTRATEGIA: STALE WHILE REVALIDATE ─────────────────── */
// Devuelve desde caché inmediatamente (si existe).
// En paralelo, actualiza la caché con la versión más nueva.
// Ideal para: fuentes, assets que cambian raramente.

async function estrategiaStaleWhileRevalidate(request, nombreCache) {
  const cache  = await caches.open(nombreCache);
  const cached = await cache.match(request);

  // Actualizar en segundo plano siempre
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Si tenemos caché, devolver inmediatamente sin esperar la red
  return cached || fetchPromise;
}


/* ─── EVENTO: MESSAGE ─────────────────────────────────────── */
// Permite que el script principal envíe mensajes al SW.
// Por ejemplo, para forzar un skip waiting o limpiar caché.

self.addEventListener('message', evento => {
  if (evento.data && evento.data.tipo === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting solicitado desde la app.');
    self.skipWaiting();
  }

  if (evento.data && evento.data.tipo === 'LIMPIAR_CACHE_API') {
    caches.delete(CACHE_API).then(() => {
      console.log('[SW] Caché de API limpiada.');
      evento.ports[0]?.postMessage({ ok: true });
    });
  }
});
