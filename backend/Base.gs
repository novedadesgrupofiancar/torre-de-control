/**
 * Base de datos del panel: planilla "Torre de control – Base" en Drive, una hoja por entidad.
 * Todas las filas se agregan al final con fecha y hora; nada se sobrescribe.
 * Editar o eliminar no borra filas: la versión anterior queda marcada en "estado_registro"
 * (Reemplazado / Eliminado) y la corregida se agrega al final con "reemplaza_a".
 */

const ZONA = 'America/Montevideo';
const NOMBRE_PLANILLA = 'Torre de control – Base';
const NOMBRE_CARPETA_CAPTURAS = 'Torre de control – Capturas';
const HOJA_CONFIG = 'configuración';
// Subir este número si se agregan hojas nuevas, para que se creen en la próxima llamada
const VERSION_BASE = '8';

// Columnas para editar y eliminar registros guardando el historial (se agregan al final de cada hoja)
const COLUMNAS_HISTORIAL = ['reemplaza_a', 'estado_registro', 'modificado_en'];

// Encabezados de cada hoja (el orden es el de las columnas)
const HOJAS = {
  'asistencia': ['id', 'registrado_en', 'agente', 'evento', 'motivo', 'tipo_ho', 'hora_llegada', 'desde', 'hasta', 'comentario'].concat(COLUMNAS_HISTORIAL),
  'issues': ['id', 'registrado_en', 'fecha', 'issue', 'detalles'],
  'comentarios_issues': ['id', 'issue_id', 'registrado_en', 'comentario', 'estado', 'escalado_a'],
  // Columnas agregadas en la etapa 4 (al final, para no mover las existentes): cantidad_sin_responder, muestra_mensaje, muestra_respuesta
  'redes': ['id', 'registrado_en', 'monitoreo_id', 'turno', 'red', 'sin_responder', 'fecha_mensajes', 'cantidad_sin_responder', 'muestra_mensaje', 'muestra_respuesta'].concat(COLUMNAS_HISTORIAL),
  'agendas_web': ['id', 'registrado_en', 'fecha', 'hora', 'taller', 'comentario', 'se_llamo', 'historial_llamado'].concat(COLUMNAS_HISTORIAL),
  'bitacora_taller': ['id', 'registrado_en', 'comentario'].concat(COLUMNAS_HISTORIAL),
  'capturas': ['id', 'registrado_en', 'seccion', 'nombre', 'link', 'archivo_id'],
  'whatsapp': ['id', 'registrado_en', 'linea', 'horario', 'comentario', 'cantidad_sin_responder', 'fecha_mensajes', 'muestra_mensaje', 'muestra_respuesta'].concat(COLUMNAS_HISTORIAL),
  'check_diario': ['id', 'registrado_en', 'fecha'],
  'fotos_campañas': ['id', 'registrado_en', 'foto_id', 'fecha_foto', 'mes', 'origen', 'hoja', 'km', 'agente', 'clave', 'oportunidad'],
  'llamadas': ['id', 'registrado_en', 'carga_id', 'desde', 'hasta', 'semana', 'agente', 'interno', 'pct_atendidas', 'atendidas', 'ofrecidas', 'detalle_colas', 'desconexiones', 'minutos_desconectado', 'sesiones_sin_cerrar', 'resumen'],
  'reportes_3cx': ['id', 'registrado_en', 'mensaje_id', 'adjunto', 'fecha_mail', 'tipo', 'fecha_datos', 'archivo_id'],
  'credenciales': ['id', 'registrado_en', 'credencial_id', 'iv', 'datos', 'borrado'],
  'cruces_3cx': ['id', 'registrado_en', 'cruce_id', 'mes', 'desde', 'hasta', 'agente', 'origen', 'hoja', 'km', 'cliente', 'telefono', 'oportunidad', 'resultado'],
  'configuración': ['clave', 'valor', 'registrado_en']
};

let planillaEnMemoria_ = null;

/** Crea la planilla, las hojas y la carpeta de capturas la primera vez */
function inicializarBase_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('VERSION_BASE') === VERSION_BASE && props.getProperty('ID_PLANILLA')) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = obtenerPlanilla_();
    Object.keys(HOJAS).forEach(nombre => asegurarColumnas_(obtenerHoja_(nombre, ss), HOJAS[nombre]));
    // Borra la hoja vacía que trae toda planilla nueva
    ss.getSheets().forEach(hoja => {
      if (!HOJAS[hoja.getName()] && hoja.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja);
    });
    // Si la planilla o la carpeta se crearon con un nombre anterior, se renombran (los datos se conservan)
    if (ss.getName() !== NOMBRE_PLANILLA) ss.rename(NOMBRE_PLANILLA);
    const carpeta = obtenerCarpetaCapturas_();
    if (carpeta.getName() !== NOMBRE_CARPETA_CAPTURAS) carpeta.setName(NOMBRE_CARPETA_CAPTURAS);
    props.setProperty('VERSION_BASE', VERSION_BASE);
  } finally {
    lock.releaseLock();
  }
}

function obtenerPlanilla_() {
  if (planillaEnMemoria_) return planillaEnMemoria_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ID_PLANILLA');
  if (id) {
    planillaEnMemoria_ = SpreadsheetApp.openById(id);
  } else {
    planillaEnMemoria_ = SpreadsheetApp.create(NOMBRE_PLANILLA);
    planillaEnMemoria_.setSpreadsheetTimeZone(ZONA);
    props.setProperty('ID_PLANILLA', planillaEnMemoria_.getId());
  }
  return planillaEnMemoria_;
}

function obtenerCarpetaCapturas_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ID_CARPETA_CAPTURAS');
  if (id) return DriveApp.getFolderById(id);
  const carpeta = DriveApp.createFolder(NOMBRE_CARPETA_CAPTURAS);
  props.setProperty('ID_CARPETA_CAPTURAS', carpeta.getId());
  return carpeta;
}

/** Devuelve la hoja; si no existe la crea con sus encabezados en formato texto */
function obtenerHoja_(nombre, ss) {
  ss = ss || obtenerPlanilla_();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    const encabezados = HOJAS[nombre];
    if (!encabezados) throw new Error('Hoja desconocida: ' + nombre);
    hoja = ss.insertSheet(nombre);
    // Formato texto en todas las columnas para que Sheets no convierta fechas ni números
    hoja.getRange(1, 1, hoja.getMaxRows(), encabezados.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/** Agrega al final las columnas que falten en una hoja existente (no mueve ni renombra las que ya están) */
function asegurarColumnas_(hoja, encabezados) {
  const actuales = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0].map(String);
  const faltan = encabezados.filter(c => actuales.indexOf(c) < 0);
  if (!faltan.length) return;
  const desde = hoja.getLastColumn() + 1;
  const sobran = desde + faltan.length - 1 - hoja.getMaxColumns();
  if (sobran > 0) hoja.insertColumnsAfter(hoja.getMaxColumns(), sobran);
  hoja.getRange(1, desde, hoja.getMaxRows(), faltan.length).setNumberFormat('@');
  hoja.getRange(1, desde, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
}

/**
 * Lee las filas de una hoja como objetos {columna: texto}.
 * Salvo que se pida el historial, no devuelve las filas reemplazadas ni eliminadas.
 */
function leerFilas_(nombre, conHistorial) {
  const hoja = obtenerHoja_(nombre);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  const datos = hoja.getRange(1, 1, ultima, hoja.getLastColumn()).getValues();
  const encabezados = datos.shift().map(String);
  return datos.map(fila => {
    const obj = {};
    encabezados.forEach((col, i) => { obj[col] = aTexto_(fila[i]); });
    return obj;
  }).filter(obj => conHistorial || !obj.estado_registro);
}

/** Agrega filas al final de la hoja (nunca reemplaza filas existentes) */
function agregarFilas_(nombre, objetos) {
  if (!objetos.length) return objetos;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    escribirAlFinal_(obtenerHoja_(nombre), objetos);
    return objetos;
  } finally {
    lock.releaseLock();
  }
}

/** Escribe filas al final de la hoja (quien llama ya tiene el bloqueo) */
function escribirAlFinal_(hoja, objetos) {
  if (!objetos.length) return;
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  const filas = objetos.map(obj => encabezados.map(col => celda_(obj[col])));
  const desde = hoja.getLastRow() + 1;
  const faltan = desde + filas.length - 1 - hoja.getMaxRows();
  if (faltan > 0) hoja.insertRowsAfter(hoja.getMaxRows(), faltan);
  hoja.getRange(desde, 1, filas.length, encabezados.length).setNumberFormat('@').setValues(filas);
}

/**
 * Edita o elimina registros sin borrar nada: las filas vigentes donde columna = valor quedan
 * marcadas como "Reemplazado" o "Eliminado" con la fecha, y las filas que devuelve
 * armarNuevas(anteriores) se agregan al final (cada una con reemplaza_a = id de la anterior).
 */
function reemplazarRegistros_(nombre, columna, valor, estado, armarNuevas) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const hoja = obtenerHoja_(nombre);
    const datos = hoja.getDataRange().getValues();
    const encabezados = datos[0].map(String);
    const colEstado = encabezados.indexOf('estado_registro');
    const colFecha = encabezados.indexOf('modificado_en');
    if (colEstado < 0 || colFecha < 0) throw new Error('La hoja ' + nombre + ' no admite cambios.');
    const anteriores = [];
    for (let i = 1; i < datos.length; i++) {
      const fila = {};
      encabezados.forEach((col, j) => { fila[col] = aTexto_(datos[i][j]); });
      if (valor && fila[columna] === valor && !fila.estado_registro) anteriores.push({ numero: i + 1, fila: fila });
    }
    if (!anteriores.length) throw new Error('Ese registro ya fue editado o eliminado. Actualizá la pantalla.');
    // Se arman antes de marcar nada: si una validación falla, la hoja queda como estaba
    const nuevas = armarNuevas ? armarNuevas(anteriores.map(a => a.fila)) : [];
    const ahora = ahora_();
    nuevas.forEach(n => { n.modificado_en = ahora; });
    anteriores.forEach(a => {
      hoja.getRange(a.numero, colEstado + 1).setNumberFormat('@').setValue(estado);
      hoja.getRange(a.numero, colFecha + 1).setNumberFormat('@').setValue(ahora);
    });
    escribirAlFinal_(hoja, nuevas);
    return nuevas;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cambia campos de una fila por id. Solo se usa para el "¿Se llamó?" de agendas web,
 * que además deja el historial de cambios dentro de la misma fila.
 */
function actualizarFila_(nombre, id, calcularCambios) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const hoja = obtenerHoja_(nombre);
    const datos = hoja.getDataRange().getValues();
    const encabezados = datos[0].map(String);
    const colId = encabezados.indexOf('id');
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][colId]) !== id) continue;
      const fila = {};
      encabezados.forEach((col, j) => { fila[col] = aTexto_(datos[i][j]); });
      if (fila.estado_registro) throw new Error('Ese registro ya fue editado o eliminado. Actualizá la pantalla.');
      const cambios = calcularCambios(fila);
      Object.keys(cambios).forEach(col => {
        const j = encabezados.indexOf(col);
        if (j >= 0) hoja.getRange(i + 1, j + 1).setNumberFormat('@').setValue(celda_(cambios[col]));
      });
      return Object.assign(fila, cambios);
    }
    throw new Error('No se encontró el registro.');
  } finally {
    lock.releaseLock();
  }
}

// Registros que se pueden eliminar desde el panel: tipo → [hoja, columna que lo identifica]
const REGISTROS_ELIMINABLES = {
  asistencia: ['asistencia', 'id'],
  redes: ['redes', 'monitoreo_id'], // un monitoreo completo (todas sus redes)
  agenda_web: ['agendas_web', 'id'],
  bitacora_taller: ['bitacora_taller', 'id'],
  whatsapp: ['whatsapp', 'id']
};

/** Elimina un registro del panel; en la planilla queda marcado como "Eliminado" con la fecha */
function eliminarRegistro(d) {
  const destino = REGISTROS_ELIMINABLES[d.tipo];
  if (!destino) throw new Error('Ese tipo de registro no se puede eliminar.');
  reemplazarRegistros_(destino[0], destino[1], texto_(d.id, 60), 'Eliminado');
  return true;
}

/** Exporta una tabla a .xlsx (vía una planilla temporal que después se envía a la papelera) */
function exportarExcel_(nombre, encabezados, filas) {
  const temporal = SpreadsheetApp.create(nombre);
  try {
    const hoja = temporal.getSheets()[0];
    const datos = [encabezados].concat(filas.map(f => f.map(celda_)));
    hoja.getRange(1, 1, datos.length, encabezados.length).setNumberFormat('@').setValues(datos);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, encabezados.length);
    SpreadsheetApp.flush();
    const url = 'https://docs.google.com/spreadsheets/d/' + temporal.getId() + '/export?format=xlsx';
    const respuesta = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    return { nombre: nombre + '.xlsx', base64: Utilities.base64Encode(respuesta.getBlob().getBytes()) };
  } finally {
    DriveApp.getFileById(temporal.getId()).setTrashed(true);
  }
}

/* ---------- Utilidades de fechas y validación ---------- */

function ahora_() { return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss'); }
function hoy_() { return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd'); }
function nuevoId_() { return Utilities.getUuid(); }

function sumarDias_(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = domingo … 6 = sábado */
function diaSemana_(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
function lunesDe_(iso) {
  const dia = diaSemana_(iso);
  return sumarDias_(iso, dia === 0 ? -6 : 1 - dia);
}
function fechaCorta_(iso) {
  if (!iso) return '';
  const p = iso.slice(0, 10).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function aTexto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'yyyy-MM-dd HH:mm:ss');
  return v === null || v === undefined ? '' : String(v);
}
/** Valor listo para la celda: evita que un texto que empieza con "=" se tome como fórmula */
function celda_(v) {
  const t = v === null || v === undefined ? '' : String(v);
  return t.charAt(0) === '=' ? "'" + t : t;
}
function texto_(v, max) { return String(v === null || v === undefined ? '' : v).trim().slice(0, max || 5000); }
function requerido_(v, campo) {
  if (!v) throw new Error('Falta completar: ' + campo + '.');
  return v;
}
function fechaISO_(v, campo) {
  v = texto_(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Falta o es inválida la fecha: ' + campo + '.');
  return v;
}
/** "aaaa-mm-ddThh:mm" o "aaaa-mm-dd hh:mm" → "aaaa-mm-dd hh:mm" */
function fechaHora_(v, campo) {
  v = texto_(v, 19).replace('T', ' ').slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) throw new Error('Falta o es inválida la fecha y hora: ' + campo + '.');
  return v;
}

function horaHHMM_(v, campo) {
  v = texto_(v, 5);
  if (!/^\d{2}:\d{2}$/.test(v)) throw new Error('Falta o es inválida la hora: ' + campo + '.');
  return v;
}
function enLista_(v, lista, campo) {
  v = texto_(v, 200);
  if (lista.indexOf(v) < 0) throw new Error('Elegí una opción válida en: ' + campo + '.');
  return v;
}
