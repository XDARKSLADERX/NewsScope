/* ============================================================
   script.js — NewsScope PWA
   País: Francia 🇫🇷 | API: The News API (thenewsapi.com)
   Versión PWA: agrega registro del Service Worker,
   instalación, persistencia del token, y estado offline.
============================================================ */

/* ─── CONFIGURACIÓN ─────────────────────────────────────── */

const URL_BASE = 'https://api.thenewsapi.com/v1';

/* ─── REGISTRO DEL SERVICE WORKER (PWA) ─────────────────── */

/**
 * BLOQUE PWA #1: REGISTRO DEL SERVICE WORKER
 *
 * Un Service Worker es un script que el navegador ejecuta
 * en segundo plano, separado de la página web.
 * Es la pieza central que permite:
 *   - Funcionamiento offline (caché de red)
 *   - Actualizaciones en segundo plano
 *   - Notificaciones push (en el futuro)
 *
 * Solo se registra si el navegador lo soporta.
 * Todos los navegadores modernos lo hacen (Chrome, Firefox,
 * Safari 11.1+, Edge).
 */

// Referencia global al SW en espera (para el botón "Actualizar")
let swEnEspera = null;

// Variable para el evento de instalación (botón "Instalar App")
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  // Esperar a que la página cargue completamente antes de registrar el SW
  window.addEventListener('load', async () => {
    try {
      // Registrar el SW apuntando al archivo sw.js
      // IMPORTANTE: sw.js debe estar en la RAÍZ del proyecto,
      // no en una subcarpeta. De lo contrario su alcance (scope)
      // quedará limitado a esa subcarpeta.
      const registro = await navigator.serviceWorker.register('./sw.js');
      console.log('[App] Service Worker registrado. Scope:', registro.scope);

      // Detectar si hay un SW nuevo esperando activarse
      registro.addEventListener('updatefound', () => {
        const nuevoWorker = registro.installing;
        nuevoWorker.addEventListener('statechange', () => {
          if (nuevoWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay una actualización lista → mostrar banner al usuario
            swEnEspera = nuevoWorker;
            mostrarBannerActualizacion();
          }
        });
      });

      // Si el SW ya está activo (recarga de página), actualizar estado
      actualizarEstadoPwa();

    } catch (error) {
      console.error('[App] Error al registrar el Service Worker:', error);
    }
  });

  // Recargar la página cuando el nuevo SW tome el control
  // (después de que el usuario pulse "Actualizar")
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}


/* ─── BLOQUE PWA #2: INSTALACIÓN DE LA APP ──────────────── */

/**
 * El navegador lanza el evento 'beforeinstallprompt' cuando
 * detecta que la app cumple los criterios de instalabilidad
 * (HTTPS + manifest.json + Service Worker activo).
 *
 * Capturamos el evento para mostrarlo cuando nosotros queramos
 * (botón personalizado), en lugar de dejarlo al navegador.
 */
window.addEventListener('beforeinstallprompt', evento => {
  evento.preventDefault();       // Evitar que el navegador lo muestre solo
  deferredPrompt = evento;       // Guardar para usarlo después
  // Mostrar el botón personalizado "Instalar App" en el header
  const boton = document.getElementById('boton-instalar');
  if (boton) boton.style.display = 'block';
  console.log('[App] App lista para instalar.');
});

/**
 * Se llama al hacer clic en "⬇ Instalar App".
 * Muestra el diálogo nativo de instalación del sistema operativo.
 */
async function instalarApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log('[App] Resultado de instalación:', outcome);
  deferredPrompt = null;
  document.getElementById('boton-instalar').style.display = 'none';
}

// Ocultar botón si el usuario ya instaló la app
window.addEventListener('appinstalled', () => {
  console.log('[App] ¡App instalada correctamente!');
  document.getElementById('boton-instalar').style.display = 'none';
  actualizarEstadoPwa();
});


/* ─── BLOQUE PWA #3: DETECCIÓN DE CONECTIVIDAD ──────────── */

/**
 * Monitorea si el usuario tiene o no conexión a internet.
 * Cuando está offline, muestra un banner informativo.
 * Cuando vuelve online, lo oculta.
 */

function manejarOnline() {
  const banner = document.getElementById('banner-offline');
  if (banner) banner.style.display = 'none';
  actualizarEstadoPwa();
  console.log('[App] Conexión restaurada.');
}

function manejarOffline() {
  const banner = document.getElementById('banner-offline');
  if (banner) banner.style.display = 'block';
  actualizarEstadoPwa();
  console.log('[App] Sin conexión — modo offline activado.');
}

window.addEventListener('online',  manejarOnline);
window.addEventListener('offline', manejarOffline);


/* ─── BLOQUE PWA #4: BANNER DE ACTUALIZACIÓN ────────────── */

/**
 * Muestra el banner inferior que notifica que hay una nueva
 * versión del Service Worker lista para activarse.
 */
function mostrarBannerActualizacion() {
  const banner = document.getElementById('banner-actualizacion');
  if (banner) banner.style.display = 'flex';
}

/**
 * Se llama al pulsar "ACTUALIZAR" en el banner.
 * Le envía un mensaje al SW en espera para que tome el control.
 * Después, el evento 'controllerchange' recargará la página.
 */
function aplicarActualizacion() {
  if (swEnEspera) {
    swEnEspera.postMessage({ tipo: 'SKIP_WAITING' });
  }
}


/* ─── BLOQUE PWA #5: LIMPIAR CACHÉ DE LA API ────────────── */

/**
 * Envía un mensaje al Service Worker para borrar las
 * respuestas de la API que están almacenadas en caché.
 * Útil cuando el usuario quiere forzar datos frescos.
 */
function limpiarCacheApi() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    alert('El Service Worker no está activo aún. Recarga la página e intenta de nuevo.');
    return;
  }

  // Crear un canal de mensajes para recibir confirmación del SW
  const canal = new MessageChannel();
  canal.port1.onmessage = (evento) => {
    if (evento.data?.ok) {
      alert('✅ Caché de la API limpiada correctamente. Los próximos resultados vendrán frescos de la red.');
      actualizarEstadoPwa();
    }
  };

  navigator.serviceWorker.controller.postMessage(
    { tipo: 'LIMPIAR_CACHE_API' },
    [canal.port2]
  );
}


/* ─── BLOQUE PWA #6: PANEL DE ESTADO ────────────────────── */

/**
 * Actualiza el pequeño panel informativo en el sidebar
 * que muestra el estado actual de la PWA.
 */
async function actualizarEstadoPwa() {
  const contenedor = document.getElementById('estado-pwa');
  if (!contenedor) return;

  const tieneSwSoporte = 'serviceWorker' in navigator;
  const estaOnline     = navigator.onLine;
  const esModoApp      = window.matchMedia('(display-mode: standalone)').matches
                         || window.navigator.standalone === true;

  // Obtener información del SW registrado
  let estadoSW = 'No soportado';
  if (tieneSwSoporte) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active)      estadoSW = '✅ Activo';
      else if (reg?.waiting) estadoSW = '🔄 Actualización lista';
      else if (reg?.installing) estadoSW = '⚙️ Instalando…';
      else                   estadoSW = '⏳ Registrando…';
    } catch { estadoSW = '❌ Error'; }
  }

  contenedor.innerHTML = `
    <div>SW: <strong>${estadoSW}</strong></div>
    <div>Red: <strong>${estaOnline ? '🟢 Online' : '🔴 Offline'}</strong></div>
    <div>Modo: <strong>${esModoApp ? '📱 App instalada' : '🌐 Navegador'}</strong></div>
  `;
}


/* ─── BLOQUE PWA #7: PERSISTENCIA DEL TOKEN ─────────────── */

/**
 * GUARDAR TOKEN: Cada vez que el usuario escribe su token,
 * lo guarda en localStorage para que no tenga que reingresarlo.
 *
 * CARGAR TOKEN: Al iniciar la app, recupera el token guardado.
 *
 * NOTA DE SEGURIDAD: localStorage es suficiente para una app
 * personal. Para producción, considera IndexedDB cifrado.
 */
function guardarToken() {
  const token = document.getElementById('tokenApi')?.value?.trim();
  if (token) localStorage.setItem('newscope_token', token);
}

function cargarToken() {
  const tokenGuardado = localStorage.getItem('newscope_token');
  const campo = document.getElementById('tokenApi');
  if (campo && tokenGuardado) {
    campo.value = tokenGuardado;
  }
}


/* ─── NAVEGACIÓN ────────────────────────────────────────── */

/**
 * Cambia la sección visible de la aplicación.
 */
function mostrarSeccion(nombre, boton) {
  document.querySelectorAll('main section').forEach(s => s.classList.add('oculto'));
  document.getElementById('sec-' + nombre).classList.remove('oculto');
  document.querySelectorAll('[id^="ctrl-"]').forEach(c => c.classList.add('oculto'));
  document.getElementById('ctrl-' + nombre).classList.remove('oculto');
  document.querySelectorAll('.boton-nav').forEach(b => b.classList.remove('activo'));
  boton.classList.add('activo');
}


/* ─── FUNCIONES AUXILIARES ──────────────────────────────── */

/**
 * Obtiene el token de API. Ahora también lo guarda en localStorage.
 */
function obtenerToken() {
  const token = document.getElementById('tokenApi').value.trim();
  if (!token) {
    alert('Por favor ingresa tu token de The News API antes de continuar.');
    return null;
  }
  // PWA: guardar automáticamente para persistencia entre sesiones
  guardarToken();
  return token;
}

/**
 * Muestra el indicador de carga animado.
 */
function mostrarCarga(idContenedor) {
  document.getElementById(idContenedor).innerHTML = `
    <div class="cargando">
      <div class="punto-carga"></div>
      <div class="punto-carga"></div>
      <div class="punto-carga"></div>
    </div>`;
}

/**
 * Muestra un mensaje de error con formato visual.
 * Si la respuesta viene del SW offline, muestra aviso especial.
 */
function mostrarError(idContenedor, mensaje) {
  const esOffline = !navigator.onLine;
  const extra = esOffline
    ? `<br><small>📡 Estás sin conexión. Si ya consultaste este endpoint antes, los datos deberían aparecer desde caché.</small>`
    : `<br><small>Verifica tu token, los parámetros ingresados y tu conexión a internet.</small>`;

  document.getElementById(idContenedor).innerHTML = `
    <div class="caja-error">
      <span class="icono-error">⚠️</span>
      <div>
        <strong>Error:</strong> ${mensaje}
        ${extra}
      </div>
    </div>`;
}

/**
 * Convierte una fecha ISO 8601 a formato legible en español.
 */
function formatearFecha(fechaIso) {
  if (!fechaIso) return '—';
  try {
    return new Date(fechaIso).toLocaleDateString('es-CO', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch {
    return fechaIso;
  }
}

/**
 * Construye el HTML de una tarjeta de artículo.
 */
function construirTarjeta(articulo, mostrarUuid = true) {
  const htmlImagen = articulo.image_url
    ? `<img class="tarjeta-imagen"
            src="${articulo.image_url}"
            alt="${articulo.title || 'Imagen del artículo'}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />`
    : '';

  const placeholder = `<div class="tarjeta-imagen-placeholder"
    style="${articulo.image_url ? 'display:none' : ''}">🎬</div>`;

  const categorias = (articulo.categories || []).join(', ') || 'entretenimiento';

  const botonUuid = mostrarUuid
    ? `<button class="boton-uuid" onclick="copiarUuid('${articulo.uuid}')"
              title="Copiar UUID para Similares o Detalle">📋 UUID</button>`
    : '';

  return `
    <article class="tarjeta">
      ${htmlImagen}
      ${placeholder}
      <div class="tarjeta-cuerpo">
        <div class="tarjeta-categoria">${categorias}</div>
        <h3 class="tarjeta-titulo">
          <a href="${articulo.url || '#'}" target="_blank" rel="noopener">
            ${articulo.title || 'Sin título'}
          </a>
        </h3>
        <p class="tarjeta-extracto">${articulo.description || articulo.snippet || ''}</p>
        <div class="tarjeta-pie">
          <span class="tarjeta-fuente">${articulo.source || '—'}</span>
          <span class="tarjeta-fecha">${formatearFecha(articulo.published_at)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:0.5rem">
          <a class="enlace-leer" href="${articulo.url || '#'}" target="_blank">Leer →</a>
          ${botonUuid}
        </div>
      </div>
    </article>`;
}

/**
 * Copia el UUID al portapapeles y lo pega en los campos relacionados.
 */
function copiarUuid(uuid) {
  navigator.clipboard.writeText(uuid).then(() => {
    document.getElementById('sim-uuid').value   = uuid;
    document.getElementById('uuid-valor').value = uuid;
    alert('UUID copiado: ' + uuid + '\n(También pegado en los campos de Similares y Detalle)');
  });
}


/* ─── EP1: TOP HEADLINES — /v1/news/top ─────────────────── */

async function obtenerTitulares() {
  const token   = obtenerToken(); if (!token) return;
  const idioma  = document.getElementById('top-idioma').value;
  const cat     = document.getElementById('top-categoria').value;
  const limite  = document.getElementById('top-limite').value;

  mostrarCarga('contenido-top');

  try {
    const params = new URLSearchParams({
      api_token:  token,
      locale:     'fr',
      language:   idioma,
      categories: cat,
      limit:      limite
    });

    const respuesta = await fetch(`${URL_BASE}/news/top?${params}`);
    const datos     = await respuesta.json();

    // Si el SW devolvió un error offline, mostrarlo de forma amigable
    if (datos.offline) throw new Error(datos.message);
    if (!respuesta.ok) throw new Error(datos.message || `HTTP ${respuesta.status}`);
    if (!datos.data || datos.data.length === 0)
      throw new Error('No se encontraron titulares para los parámetros seleccionados.');

    const articulos = datos.data;
    document.getElementById('meta-top').textContent =
      `${articulos.length} resultados · /v1/news/top · locale=fr`;

    const [primero, ...resto] = articulos;

    let html = `
      <div class="historia-destacada">
        <div class="historia-principal">
          ${primero.image_url
            ? `<img class="tarjeta-imagen" src="${primero.image_url}"
                    alt="${primero.title || ''}"
                    onerror="this.style.display='none'">`
            : ''}
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-categoria">${(primero.categories || []).join(', ')}</div>
            <h2 class="tarjeta-titulo" style="font-size:1.6rem">
              <a href="${primero.url || '#'}" target="_blank">${primero.title || ''}</a>
            </h2>
            <p class="tarjeta-extracto">${primero.description || ''}</p>
            <div class="tarjeta-pie">
              <span class="tarjeta-fuente">${primero.source || '—'}</span>
              <span class="tarjeta-fecha">${formatearFecha(primero.published_at)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:0.5rem">
              <a class="enlace-leer" href="${primero.url || '#'}" target="_blank">Leer →</a>
              <button class="boton-uuid" onclick="copiarUuid('${primero.uuid}')">📋 UUID</button>
            </div>
          </div>
        </div>
        <div class="historia-lateral">`;

    resto.slice(0, 2).forEach(a => { html += construirTarjeta(a); });
    html += `</div></div>`;

    if (resto.length > 2) {
      html += `<div class="cuadricula-noticias">`;
      resto.slice(2).forEach(a => { html += construirTarjeta(a); });
      html += `</div>`;
    }

    document.getElementById('contenido-top').innerHTML = html;

  } catch (error) {
    mostrarError('contenido-top', error.message);
  }
}


/* ─── EP2: TODOS LOS ARTÍCULOS — /v1/news/all ───────────── */

async function obtenerTodosArticulos() {
  const token  = obtenerToken(); if (!token) return;
  const desde  = document.getElementById('todos-desde').value;
  const hasta  = document.getElementById('todos-hasta').value;
  const orden  = document.getElementById('todos-orden').value;
  const limite = document.getElementById('todos-limite').value;

  mostrarCarga('contenido-todos');

  try {
    const params = new URLSearchParams({
      api_token:  token,
      locale:     'fr',
      categories: 'entertainment',
      sort:       orden,
      limit:      limite
    });

    if (desde) params.append('published_after',  desde + 'T00:00:00');
    if (hasta) params.append('published_before', hasta + 'T23:59:59');

    const respuesta = await fetch(`${URL_BASE}/news/all?${params}`);
    const datos     = await respuesta.json();

    if (datos.offline) throw new Error(datos.message);
    if (!respuesta.ok) throw new Error(datos.message || `HTTP ${respuesta.status}`);
    if (!datos.data || datos.data.length === 0)
      throw new Error('No se encontraron artículos para el rango de fechas seleccionado.');

    const articulos = datos.data;
    document.getElementById('meta-todos').textContent =
      `${articulos.length} artículos · /v1/news/all · locale=fr`;

    const fuentesUnicas = [...new Set(articulos.map(a => a.source).filter(Boolean))];
    const conImagen     = articulos.filter(a => a.image_url).length;

    let html = `
      <div class="cuadricula-estadisticas">
        <div class="tarjeta-estadistica">
          <div class="estadistica-etiqueta">Total artículos</div>
          <div class="estadistica-valor">${articulos.length}</div>
          <div class="estadistica-sub">en esta consulta</div>
        </div>
        <div class="tarjeta-estadistica">
          <div class="estadistica-etiqueta">Fuentes únicas</div>
          <div class="estadistica-valor">${fuentesUnicas.length}</div>
          <div class="estadistica-sub">${fuentesUnicas.slice(0, 3).join(', ')}</div>
        </div>
        <div class="tarjeta-estadistica">
          <div class="estadistica-etiqueta">Con imagen</div>
          <div class="estadistica-valor">${conImagen}</div>
          <div class="estadistica-sub">artículos con fotografía</div>
        </div>
      </div>
      <div class="cuadricula-noticias">`;

    articulos.forEach(a => { html += construirTarjeta(a); });
    html += `</div>`;

    document.getElementById('contenido-todos').innerHTML = html;

  } catch (error) {
    mostrarError('contenido-todos', error.message);
  }
}


/* ─── EP3: BÚSQUEDA — /v1/news/all?search= ─────────────── */

async function buscarNoticias() {
  const token    = obtenerToken(); if (!token) return;
  const palabras = document.getElementById('buscar-termino').value.trim();
  const idioma   = document.getElementById('buscar-idioma').value;
  const desde    = document.getElementById('buscar-desde').value;
  const limite   = document.getElementById('buscar-limite').value;

  if (!palabras) {
    alert('Por favor ingresa al menos una palabra clave para buscar.');
    return;
  }

  mostrarCarga('contenido-buscar');

  try {
    const params = new URLSearchParams({
      api_token:  token,
      search:     palabras,
      categories: 'entertainment',
      locale:     'fr',
      limit:      limite
    });

    if (idioma) params.append('language', idioma);
    if (desde)  params.append('published_after', desde + 'T00:00:00');

    const respuesta = await fetch(`${URL_BASE}/news/all?${params}`);
    const datos     = await respuesta.json();

    if (datos.offline) throw new Error(datos.message);
    if (!respuesta.ok) throw new Error(datos.message || `HTTP ${respuesta.status}`);
    if (!datos.data || datos.data.length === 0)
      throw new Error(`No se encontraron resultados para "${palabras}".`);

    const articulos = datos.data;
    document.getElementById('meta-buscar').textContent =
      `${articulos.length} resultados para "${palabras}"`;

    let html = `<div class="cuadricula-noticias">`;
    articulos.forEach(a => { html += construirTarjeta(a); });
    html += `</div>`;

    document.getElementById('contenido-buscar').innerHTML = html;

  } catch (error) {
    mostrarError('contenido-buscar', error.message);
  }
}


/* ─── EP4: ARTÍCULOS SIMILARES — /v1/news/similar/{uuid} ── */

async function obtenerSimilares() {
  const token  = obtenerToken(); if (!token) return;
  const uuid   = document.getElementById('sim-uuid').value.trim();
  const limite = document.getElementById('sim-limite').value;

  if (!uuid) {
    alert('Por favor ingresa el UUID de un artículo.');
    return;
  }

  mostrarCarga('contenido-similares');

  try {
    const params = new URLSearchParams({ api_token: token, limit: limite });
    const respuesta = await fetch(`${URL_BASE}/news/similar/${uuid}?${params}`);
    const datos     = await respuesta.json();

    if (datos.offline) throw new Error(datos.message);
    if (!respuesta.ok) throw new Error(datos.message || `HTTP ${respuesta.status}`);
    if (!datos.data || datos.data.length === 0)
      throw new Error('No se encontraron artículos similares para este UUID.');

    const articulos = datos.data;
    document.getElementById('meta-similares').textContent =
      `${articulos.length} artículos similares · UUID: ${uuid.slice(0, 8)}…`;

    let html = `
      <p style="font-size:0.8rem;color:var(--apagado);margin-bottom:1rem">
        Artículos relacionados con:
        <code style="font-family:var(--fuente-mono);color:var(--acento)">${uuid}</code>
      </p>
      <div class="contenedor-horizontal">
        <div class="fila-horizontal">`;

    articulos.forEach(a => { html += construirTarjeta(a); });
    html += `</div></div>`;

    document.getElementById('contenido-similares').innerHTML = html;

  } catch (error) {
    mostrarError('contenido-similares', error.message);
  }
}


/* ─── EP5: FUENTES — /v1/news/sources ──────────────────── */

async function obtenerFuentes() {
  const token  = obtenerToken(); if (!token) return;
  const pais   = document.getElementById('src-pais').value;
  const idioma = document.getElementById('src-idioma').value;

  mostrarCarga('contenido-fuentes');

  try {
    const params = new URLSearchParams({ api_token: token, country: pais });
    if (idioma) params.append('language', idioma);

    const respuesta = await fetch(`${URL_BASE}/news/sources?${params}`);
    const datos     = await respuesta.json();

    if (datos.offline) throw new Error(datos.message);
    if (!respuesta.ok) throw new Error(datos.message || `HTTP ${respuesta.status}`);
    if (!datos.data || datos.data.length === 0)
      throw new Error('No se encontraron fuentes para los parámetros seleccionados.');

    const fuentes = datos.data;
    const idiomasUnicos = [...new Set(fuentes.map(f => f.language).filter(Boolean))];
    document.getElementById('meta-fuentes').textContent =
      `${fuentes.length} fuentes · país=${pais.toUpperCase()}`;

    let html = `
      <div class="cuadricula-estadisticas mb-2">
        <div class="tarjeta-estadistica">
          <div class="estadistica-etiqueta">Fuentes registradas</div>
          <div class="estadistica-valor">${fuentes.length}</div>
          <div class="estadistica-sub">país: ${pais.toUpperCase()}</div>
        </div>
        <div class="tarjeta-estadistica">
          <div class="estadistica-etiqueta">Idiomas disponibles</div>
          <div class="estadistica-valor">${idiomasUnicos.length}</div>
          <div class="estadistica-sub">${idiomasUnicos.join(', ')}</div>
        </div>
      </div>
      <div style="overflow-x:auto">
      <table class="tabla-fuentes">
        <thead><tr>
          <th>Nombre</th><th>Dominio</th><th>Idioma</th><th>País</th><th>Categorías</th>
        </tr></thead>
        <tbody>`;

    fuentes.forEach(f => {
      const etiquetas = (f.categories || [])
        .map(c => `<span class="etiqueta-pill">${c}</span>`).join(' ');
      html += `
        <tr>
          <td class="nombre-fuente">${f.name || f.domain || '—'}</td>
          <td><a class="url-fuente" href="https://${f.domain || '#'}" target="_blank">${f.domain || '—'}</a></td>
          <td>${f.language || '—'}</td>
          <td>${(f.country || '').toUpperCase() || '—'}</td>
          <td>${etiquetas || '<span class="etiqueta-pill">general</span>'}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    document.getElementById('contenido-fuentes').innerHTML = html;

  } catch (error) {
    mostrarError('contenido-fuentes', error.message);
  }
}


/* ─── EP6: ARTÍCULO POR UUID — /v1/news/{uuid} ──────────── */

async function obtenerPorUuid() {
  const token = obtenerToken(); if (!token) return;
  const uuid  = document.getElementById('uuid-valor').value.trim();

  if (!uuid) {
    alert('Por favor ingresa el UUID del artículo.');
    return;
  }

  mostrarCarga('contenido-uuid');

  try {
    const params = new URLSearchParams({ api_token: token });
    const respuesta = await fetch(`${URL_BASE}/news/${uuid}?${params}`);
    const datos     = await respuesta.json();

    if (datos.offline) throw new Error(datos.message);
    if (!respuesta.ok)
      throw new Error(datos.message || `HTTP ${respuesta.status} — UUID no encontrado o inválido.`);
    if (!datos.data)
      throw new Error('El servidor no devolvió datos para este UUID.');

    const a = datos.data;
    document.getElementById('meta-uuid').textContent = `UUID: ${uuid.slice(0, 12)}…`;

    const htmlImagen = a.image_url
      ? `<img class="detalle-imagen" src="${a.image_url}" alt="${a.title || 'Imagen'}">`
      : `<div class="detalle-imagen" style="display:flex;align-items:center;justify-content:center;font-size:3rem;opacity:0.3">🎬</div>`;

    const categorias    = (a.categories || []).join(', ') || '—';
    const palabrasClave = (a.keywords   || []).join(', ') || '—';

    const html = `
      <div class="detalle-articulo">
        <div>
          ${htmlImagen}
          <h2 style="font-family:var(--fuente-serif);font-size:1.4rem;margin-top:1rem;line-height:1.4">
            ${a.title || 'Sin título'}
          </h2>
          <p style="font-size:0.85rem;color:var(--apagado);line-height:1.7;margin-top:0.75rem">
            ${a.description || a.snippet || ''}
          </p>
          <a class="enlace-leer" href="${a.url || '#'}" target="_blank"
             style="display:inline-block;margin-top:1rem">
            Leer artículo completo →
          </a>
        </div>
        <div>
          <ul class="lista-metadatos">
            <li><span class="meta-clave">UUID</span>
              <span class="meta-valor" style="font-family:var(--fuente-mono);font-size:0.72rem;word-break:break-all">${a.uuid || uuid}</span></li>
            <li><span class="meta-clave">Fuente</span><span class="meta-valor">${a.source || '—'}</span></li>
            <li><span class="meta-clave">Fecha</span><span class="meta-valor">${formatearFecha(a.published_at)}</span></li>
            <li><span class="meta-clave">Idioma</span><span class="meta-valor">${a.language || '—'}</span></li>
            <li><span class="meta-clave">Región</span><span class="meta-valor">${(a.locale || '').toUpperCase() || '—'}</span></li>
            <li><span class="meta-clave">Categorías</span><span class="meta-valor">${categorias}</span></li>
            <li><span class="meta-clave">Palabras clave</span><span class="meta-valor">${palabrasClave}</span></li>
            <li><span class="meta-clave">URL</span>
              <span class="meta-valor"><a href="${a.url || '#'}" target="_blank">${(a.url || '').slice(0, 50)}…</a></span></li>
          </ul>
        </div>
      </div>`;

    document.getElementById('contenido-uuid').innerHTML = html;

  } catch (error) {
    mostrarError('contenido-uuid', error.message);
  }
}


/* ─── INICIALIZACIÓN ────────────────────────────────────── */

(function inicializar() {
  const hoy   = new Date();
  const antes = new Date(hoy);
  antes.setDate(antes.getDate() - 30);
  const formatoFecha = d => d.toISOString().split('T')[0];

  document.getElementById('todos-desde').value  = formatoFecha(antes);
  document.getElementById('todos-hasta').value  = formatoFecha(hoy);
  document.getElementById('buscar-desde').value = formatoFecha(antes);

  // PWA: recuperar el token guardado de sesiones anteriores
  cargarToken();

  // PWA: guardar token automáticamente al salir del campo
  const campoToken = document.getElementById('tokenApi');
  if (campoToken) {
    campoToken.addEventListener('blur', guardarToken);
    campoToken.addEventListener('change', guardarToken);
  }

  // PWA: actualizar el panel de estado después de que el SW se registre
  setTimeout(actualizarEstadoPwa, 1500);

  // ── ALTURA DINÁMICA DEL HEADER ──────────────────────────
  // Mide el header real y actualiza la variable CSS --alto-header.
  // Así el panel lateral y el cuerpo siempre se posicionan bien
  // sin importar si el nav hace wrap (dos líneas) o no.
  function actualizarAltoHeader() {
    const header = document.querySelector('header');
    if (header) {
      const alto = header.offsetHeight;
      document.documentElement.style.setProperty('--alto-header', alto + 'px');
    }
  }

  actualizarAltoHeader();
  window.addEventListener('resize', actualizarAltoHeader);

  // Re-medir cuando las fuentes de Google terminen de cargar
  // (pueden cambiar ligeramente el alto del header)
  document.fonts.ready.then(actualizarAltoHeader);
})();
