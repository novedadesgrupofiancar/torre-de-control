/**
 * Torre de control – API del backend.
 *
 * El frontend (GitHub Pages) llama con POST, Content-Type text/plain y cuerpo JSON:
 *   { "action": "listarIssues", "claveAcceso": "...", "datos": { ... } }
 * Respuesta JSON:
 *   { "ok": true, "datos": ... }  o  { "ok": false, "error": "...", "codigo": "..." }
 *
 * Toda acción exige la clave de acceso, guardada en Propiedades del script (CLAVE_ACCESO).
 * Nunca se escribe la clave en el código.
 */

// Largo mínimo de la clave de acceso
const LARGO_MINIMO_CLAVE = 24;

// Acciones disponibles: nombre → función que recibe "datos"
const ACCIONES = {
  obtenerInicio: () => ({ config: obtenerConfiguracion(), hoy: hoy_() }),

  // Configuración
  obtenerConfiguracion: () => obtenerConfiguracion(),
  guardarConfiguracion: d => guardarConfiguracion(d.bloque, d.valor),

  // Sección 3 y reporte RRHH
  listarAsistencia: () => listarAsistencia(),
  registrarAsistencia: d => registrarAsistencia(d),
  reporteRRHH: d => reporteRRHH(d.fecha),
  exportarRRHHExcel: d => exportarRRHHExcel(d.fecha),

  // Sección 4
  listarIssues: () => listarIssues(),
  crearIssue: d => crearIssue(d),
  agregarComentarioIssue: d => agregarComentarioIssue(d),

  // Sección 5
  listarMonitoreos: () => listarMonitoreos(),
  registrarMonitoreo: d => registrarMonitoreo(d),

  // Sección 6
  listarAgendasWeb: () => listarAgendasWeb(),
  registrarAgendaWeb: d => registrarAgendaWeb(d),
  marcarLlamadoAgenda: d => marcarLlamadoAgenda(d.id, d.llamado === true),
  listarBitacora: () => listarBitacora(),
  registrarBitacora: d => registrarBitacora(d),
  listarCapturas: d => listarCapturas(d.seccion),
  subirCaptura: d => subirCaptura(d),
  obtenerImagenCaptura: d => obtenerImagenCaptura(d.archivo_id),

  // Sección 7
  listarControlesWhatsApp: () => listarControlesWhatsApp(),
  registrarControlWhatsApp: d => registrarControlWhatsApp(d),

  // Sección 8
  obtenerRecordatorios: () => obtenerRecordatorios(),
  obtenerCheckDiario: () => obtenerCheckDiario(),
  marcarCheckDiario: () => marcarCheckDiario()
};

function doPost(e) {
  let pedido;
  try {
    pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return responder_({ ok: false, error: 'Pedido inválido.', codigo: 'PEDIDO_INVALIDO' });
  }
  return responder_(atender_(pedido));
}

/** Por GET se aceptan los mismos parámetros (action, claveAcceso y datos en JSON) */
function doGet(e) {
  const p = (e && e.parameter) || {};
  let datos = {};
  try { datos = p.datos ? JSON.parse(p.datos) : {}; } catch (err) { /* datos vacíos */ }
  return responder_(atender_({ action: p.action, claveAcceso: p.claveAcceso, datos: datos }));
}

function atender_(pedido) {
  const accion = String(pedido.action || '');

  // Solo se usa una vez: guarda la clave si todavía no hay ninguna
  if (accion === 'configurarClaveInicial') return configurarClaveInicial_(pedido.claveAcceso);

  if (!claveValida_(pedido.claveAcceso)) {
    return { ok: false, error: 'Clave de acceso inválida.', codigo: 'CLAVE_INVALIDA' };
  }
  if (!Object.prototype.hasOwnProperty.call(ACCIONES, accion)) {
    return { ok: false, error: 'Acción desconocida: ' + accion, codigo: 'ACCION_DESCONOCIDA' };
  }
  try {
    inicializarBase_();
    return { ok: true, datos: ACCIONES[accion](pedido.datos || {}) };
  } catch (err) {
    return { ok: false, error: err.message || String(err), codigo: 'ERROR' };
  }
}

function claveValida_(clave) {
  const guardada = PropertiesService.getScriptProperties().getProperty('CLAVE_ACCESO');
  return !!guardada && typeof clave === 'string' && clave === guardada;
}

function configurarClaveInicial_(clave) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CLAVE_ACCESO')) {
    return { ok: false, error: 'La clave ya está configurada.', codigo: 'CLAVE_YA_CONFIGURADA' };
  }
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_CLAVE) {
    return { ok: false, error: 'La clave debe tener al menos ' + LARGO_MINIMO_CLAVE + ' caracteres.', codigo: 'CLAVE_CORTA' };
  }
  props.setProperty('CLAVE_ACCESO', clave);
  return { ok: true, datos: true };
}

function responder_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
