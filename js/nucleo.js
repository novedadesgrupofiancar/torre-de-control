/* ===== Núcleo del panel: navegación, utilidades y llamadas al servidor ===== */

const Modulos = {};
const Estado = { config: null, seccion: null, alSalir: null };

// Menú: las 8 secciones + Reportes + Configuración. Sin "modulo" se muestra "Próximamente".
const SECCIONES = [
  { id: 'llamadas', chip: '1', nombre: 'Llamadas y conexión', modulo: 'Llamadas' },
  { id: 'campanias', chip: '2', nombre: 'Campañas', modulo: 'Campanias' },
  { id: 'asistencia', chip: '3', nombre: 'Marcas y asistencia', titulo: 'Marcas / llegadas tarde / home office / faltas', modulo: 'Asistencia' },
  { id: 'issues', chip: '4', nombre: 'Issues', modulo: 'Issues' },
  { id: 'redes', chip: '5', nombre: 'Redes', modulo: 'Redes' },
  { id: 'taller', chip: '6', nombre: 'Taller', modulo: 'Taller' },
  { id: 'whatsapp', chip: '7', nombre: 'Control de WhatsApp', modulo: 'WhatsApp' },
  { id: 'recordatorios', chip: '8', nombre: 'Recordatorios', modulo: 'Recordatorios' },
  { id: 'reportes', chip: 'R', nombre: 'Reportes', modulo: 'Reportes', extra: true },
  { id: 'credenciales', chip: 'Cr', nombre: 'Credenciales', modulo: 'Credenciales', extra: true },
  { id: 'config', chip: 'C', nombre: 'Configuración', modulo: 'Configuracion', extra: true }
];

/* ---------- Clave de acceso ---------- */

const CLAVE_STORAGE = 'torre-clave-acceso';

function obtenerClave() {
  try { return localStorage.getItem(CLAVE_STORAGE) || ''; } catch (e) { return ''; }
}
function guardarClave(clave) {
  try { localStorage.setItem(CLAVE_STORAGE, clave); } catch (e) { /* sin almacenamiento */ }
}
function borrarClave() {
  try { localStorage.removeItem(CLAVE_STORAGE); } catch (e) { /* sin almacenamiento */ }
}

/** Error que indica que la clave guardada ya no sirve */
class ClaveInvalida extends Error {}

/**
 * Llama a una acción del backend (Apps Script).
 * POST con Content-Type text/plain para evitar el bloqueo CORS.
 */
async function api(accion, datos, claveAcceso) {
  let respuesta;
  try {
    const r = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: accion, claveAcceso: claveAcceso || obtenerClave(), datos: datos || {} })
    });
    respuesta = await r.json();
  } catch (e) {
    throw new Error('No hay conexión con el servidor. Probá de nuevo en un momento.');
  }
  if (!respuesta.ok) {
    if (respuesta.codigo === 'CLAVE_INVALIDA') {
      if (!claveAcceso) { borrarClave(); mostrarIngreso('La clave guardada ya no es válida. Ingresala de nuevo.'); }
      throw new ClaveInvalida(respuesta.error);
    }
    throw new Error(respuesta.error || 'Error del servidor.');
  }
  return respuesta.datos;
}

/* ---------- Arranque e ingreso ---------- */

function arrancar() {
  document.getElementById('menu-lista').addEventListener('click', e => {
    const boton = e.target.closest('.menu-item');
    if (boton && boton.dataset.id) irA(boton.dataset.id);
  });
  document.getElementById('f-ingreso').addEventListener('submit', ingresar);
  if (obtenerClave()) abrirPanel();
  else mostrarIngreso();
}

/** Pantalla de ingreso: es lo único visible mientras no haya una clave válida */
function mostrarIngreso(mensaje) {
  document.getElementById('panel').hidden = true;
  document.getElementById('ingreso').hidden = false;
  document.getElementById('ingreso-error').textContent = mensaje || '';
  document.getElementById('contenido').replaceChildren();
  document.getElementById('check-dia').replaceChildren();
  Estado.config = null;
  const campo = document.getElementById('clave-acceso');
  campo.value = '';
  campo.focus();
}

async function ingresar(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const clave = form.clave.value.trim();
  const error = document.getElementById('ingreso-error');
  error.textContent = '';
  if (!clave) return;
  let inicio;
  const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
    try {
      inicio = await api('obtenerInicio', {}, clave);
    } catch (err) {
      error.textContent = err instanceof ClaveInvalida ? 'Clave incorrecta.' : err.message;
    }
  }, 'Verificando…');
  if (!ok || !inicio) return;
  guardarClave(clave);
  abrirPanel(inicio);
}

async function abrirPanel(inicio) {
  document.getElementById('ingreso').hidden = true;
  document.getElementById('panel').hidden = false;
  pintarMenu();
  const main = document.getElementById('contenido');
  main.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    if (!inicio) inicio = await api('obtenerInicio');
    Estado.config = inicio.config;
  } catch (e) {
    if (e instanceof ClaveInvalida) return;
    main.innerHTML = '';
    aviso('No se pudo cargar la configuración: ' + e.message, 'error');
    return;
  }
  Modulos.Recordatorios.cargarCheck();
  let ultima = null;
  try { ultima = localStorage.getItem('seccion'); } catch (e) { /* sin almacenamiento */ }
  irA(ultima || 'recordatorios');
}

function pintarMenu() {
  document.getElementById('menu-lista').innerHTML = SECCIONES.map(s => `
    ${s.id === 'reportes' ? '<div class="menu-sep"></div>' : ''}
    <button type="button" class="menu-item${s.id === Estado.seccion ? ' activo' : ''}" data-id="${s.id}"
      ${s.id === Estado.seccion ? 'aria-current="page"' : ''}>
      <span class="chip-num">${s.chip}</span><span>${esc(s.nombre)}</span>
    </button>`).join('') + enlacesMenu();
}

/** Links externos del menú (se cargan en Configuración › Links del menú; abren en otra pestaña) */
function enlacesMenu() {
  const miro = Estado.config && Estado.config.enlaces && Estado.config.enlaces.miro;
  if (!miro || !/^https:\/\//.test(miro)) return '';
  return `<div class="menu-sep"></div>
    <a class="menu-item" href="${esc(miro)}" target="_blank" rel="noopener">
      <span class="chip-num">M</span><span>Miro</span>
    </a>`;
}

async function irA(id) {
  const s = SECCIONES.find(x => x.id === id) || SECCIONES.find(x => x.id === 'recordatorios');
  if (Estado.alSalir) { try { Estado.alSalir(); } catch (e) { /* nada */ } Estado.alSalir = null; }
  Estado.seccion = s.id;
  pintarMenu();
  try { localStorage.setItem('seccion', s.id); } catch (e) { /* sin almacenamiento */ }

  // Cada sección se dibuja en un contenedor nuevo; si se cambia de sección a mitad de carga,
  // lo que llegue tarde queda en un contenedor que ya no está en la página.
  const main = document.getElementById('contenido');
  const vista = document.createElement('div');
  vista.className = 'vista';
  main.replaceChildren(vista);
  window.scrollTo(0, 0);

  if (!s.modulo) {
    vista.innerHTML = encabezado(s) + `
      <section class="tarjeta proximamente">
        <span class="pildora pildora-azul">Próximamente</span>
        <p class="nota">Esta sección se construye en la próxima etapa.</p>
      </section>`;
    return;
  }
  vista.innerHTML = encabezado(s) + '<div class="cargando">Cargando…</div>';
  try {
    await Modulos[s.modulo].render(vista, s);
  } catch (e) {
    vista.innerHTML = encabezado(s) + `<section class="tarjeta"><p>No se pudo cargar la sección.</p><p class="nota">${esc(e.message)}</p></section>`;
  }
}

/* ---------- Piezas de interfaz ---------- */

function encabezado(s) {
  const etiqueta = s.extra ? 'Panel' : 'Sección ' + s.chip;
  return `<header class="encabezado"><p class="eyebrow">${etiqueta}</p><h1>${esc(s.titulo || s.nombre)}</h1></header>`;
}

function banners(lista) {
  return `<div class="banners">${lista.map(b => `<div class="banner banner-${b.tipo}" role="alert">${b.html}</div>`).join('')}</div>`;
}

function campo(etiqueta, control, clase, oculto) {
  return `<label class="campo ${clase || ''}" ${oculto ? 'hidden' : ''}><span class="etiqueta">${etiqueta}</span>${control}</label>`;
}

function opcionesHtml(lista, seleccionado, vacio) {
  return (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') +
    lista.map(v => `<option value="${esc(v)}"${v === seleccionado ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function vacioHtml(texto) { return `<p class="vacio">${esc(texto)}</p>`; }

function barra(pct, clase) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="barra ${clase || ''}" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>`;
}

/** Anillo de progreso circular */
function anillo(pct, valor, texto, color) {
  const tam = 104, grosor = 8, r = (tam - grosor) / 2, circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="anillo" style="width:${tam}px;height:${tam}px">
    <svg width="${tam}" height="${tam}" aria-hidden="true">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="#243041" stroke-width="${grosor}"/>
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${color || '#6AA7E8'}" stroke-width="${grosor}"
        stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - p / 100)}"/>
    </svg>
    <div class="anillo-texto"><strong>${esc(valor)}</strong><span>${esc(texto)}</span></div>
  </div>`;
}

function aviso(mensaje, tipo) {
  const el = document.createElement('div');
  el.className = 'aviso' + (tipo === 'error' ? ' error' : '');
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = mensaje;
  document.getElementById('avisos').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 3500);
}

function abrirModal(html) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `<div class="tarjeta modal-caja" role="dialog" aria-modal="true">${html}</div>`;
  modal.hidden = false;
  const enfocable = modal.querySelector('[data-cerrar]');
  if (enfocable) enfocable.focus();
  return modal.firstElementChild;
}
function cerrarModal() {
  const modal = document.getElementById('modal');
  modal.hidden = true;
  modal.innerHTML = '';
}
document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal' || e.target.closest('[data-cerrar]')) cerrarModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

/** Deshabilita el botón mientras corre la acción; si falla muestra el error y devuelve false */
async function conBoton(boton, accion, textoEspera) {
  const texto = boton ? boton.textContent : '';
  if (boton) { boton.disabled = true; boton.textContent = textoEspera || 'Guardando…'; }
  try {
    await accion();
    return true;
  } catch (e) {
    aviso(e.message, 'error');
    return false;
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = texto; }
  }
}

function leerForm(form) {
  const datos = {};
  new FormData(form).forEach((v, k) => { datos[k] = typeof v === 'string' ? v.trim() : v; });
  return datos;
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return;
  } catch (e) { /* el iframe puede bloquear el portapapeles: se usa el método clásico */ }
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('No se pudo copiar. Seleccioná el texto y copialo a mano.');
}

function descargarBase64(nombre, base64, tipo) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function nuevoIdLocal() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

/* ---------- Texto y fechas ---------- */

function esc(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hoyISO() { return isoLocal(new Date()); }
function horaActual() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}
function diaSemana(iso) { return new Date(iso + 'T12:00:00').getDay(); }
function lunesDe(iso) { const w = diaSemana(iso); return sumarDias(iso, w === 0 ? -6 : 1 - w); }
function fmtFecha(iso) {
  if (!iso) return '';
  const p = iso.slice(0, 10).split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}
function fmtFechaHora(s) { return s ? fmtFecha(s) + ' ' + s.slice(11, 16) : ''; }
function fmtRango(desde, hasta) {
  return !hasta || hasta === desde ? fmtFecha(desde) : `${fmtFecha(desde)} – ${fmtFecha(hasta)}`;
}
function nombreDia(iso) {
  const hoy = hoyISO();
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  const d = DIAS[diaSemana(iso)];
  return d.charAt(0).toUpperCase() + d.slice(1) + ' ' + fmtFecha(iso).slice(0, 5);
}
