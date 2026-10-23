/**
 * Reportes de 3CX que llegan por mail (programados en la consola de 3CX).
 * Busca en el Gmail de la cuenta del panel los adjuntos .csv, reconoce cada reporte por sus
 * columnas, guarda el archivo en la carpeta "Torre de control – Reportes 3CX" y lo registra
 * en la hoja "reportes_3cx" para no volver a leerlo. Usa el servicio avanzado de Gmail (solo lectura).
 */

const NOMBRE_CARPETA_3CX = 'Torre de control – Reportes 3CX';
// Se buscan los mails de los últimos días (los ya leídos se saltean)
const DIAS_BUSQUEDA_MAILS = 30;
const TIPOS_REPORTE_3CX = ['atendidas', 'conexion', 'salientes'];

function obtenerCarpeta3CX_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ID_CARPETA_3CX');
  if (id) return DriveApp.getFolderById(id);
  const carpeta = DriveApp.createFolder(NOMBRE_CARPETA_3CX);
  props.setProperty('ID_CARPETA_3CX', carpeta.getId());
  return carpeta;
}

/** Reconoce el reporte por los encabezados de la primera línea */
function tipoReporte3CX_(texto) {
  const enc = texto.split(/\r?\n/)[0] || '';
  if (enc.indexOf('Queue') >= 0 && enc.indexOf('Calls Answered') >= 0) return 'atendidas';
  if (enc.indexOf('Logged In') >= 0 && enc.indexOf('Logged Out') >= 0) return 'conexion';
  if (enc.indexOf('Call Time') >= 0 && enc.indexOf('Direction') >= 0) return 'salientes';
  return '';
}

/**
 * Fecha de los datos del archivo: la primera fecha que aparece en el CSV
 * (Day en conexión, Call Time en salientes). El de atendidas no trae fechas:
 * se toma el día anterior al mail, porque el reporte programado es del día anterior.
 */
function fechaDatos3CX_(tipo, texto, fechaMail) {
  const fechas = texto.match(/^\d{4}-\d{2}-\d{2}/gm) || [];
  if (tipo !== 'atendidas' && fechas.length) return fechas.sort()[0];
  return sumarDias_(fechaMail, -1);
}

/** Adjuntos .csv de un mensaje (recorre las partes anidadas) */
function adjuntosCsv_(parte, lista) {
  lista = lista || [];
  if (!parte) return lista;
  if (parte.filename && /\.csv$/i.test(parte.filename) && parte.body && parte.body.attachmentId) {
    lista.push({ nombre: parte.filename, adjuntoId: parte.body.attachmentId });
  }
  (parte.parts || []).forEach(p => adjuntosCsv_(p, lista));
  return lista;
}

/**
 * Gmail entrega el adjunto en base64 "web safe" y a veces sin el relleno final ("="),
 * que Utilities no acepta: se pasa a base64 común con relleno. Si ya viene en bytes, se usa tal cual.
 */
function decodificarAdjunto_(datos) {
  if (typeof datos !== 'string') return datos;
  let b64 = datos.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Utilities.base64Decode(b64);
}

/** Lee los mails nuevos con reportes de 3CX y guarda sus adjuntos. Devuelve el estado. */
function importarReportes3CX() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const leidos = {};
    leerFilas_('reportes_3cx').forEach(f => { leidos[f.mensaje_id + '|' + f.adjunto] = true; });
    const respuesta = Gmail.Users.Messages.list('me', { q: 'has:attachment filename:csv newer_than:' + DIAS_BUSQUEDA_MAILS + 'd', maxResults: 200 });
    const nuevos = [];
    (respuesta.messages || []).forEach(m => {
      const mensaje = Gmail.Users.Messages.get('me', m.id);
      const fechaMail = Utilities.formatDate(new Date(Number(mensaje.internalDate)), ZONA, 'yyyy-MM-dd HH:mm:ss');
      adjuntosCsv_(mensaje.payload).forEach(a => {
        if (leidos[m.id + '|' + a.nombre]) return;
        const datos = Gmail.Users.Messages.Attachments.get('me', m.id, a.adjuntoId).data;
        const bytes = decodificarAdjunto_(datos);
        const texto = Utilities.newBlob(bytes).getDataAsString('UTF-8').replace(/^﻿/, '');
        const tipo = tipoReporte3CX_(texto);
        const fila = {
          id: nuevoId_(), registrado_en: ahora_(), mensaje_id: m.id, adjunto: a.nombre,
          fecha_mail: fechaMail, tipo: tipo || 'no es de 3CX', fecha_datos: '', archivo_id: ''
        };
        if (tipo) {
          fila.fecha_datos = fechaDatos3CX_(tipo, texto, fechaMail.slice(0, 10));
          const archivo = obtenerCarpeta3CX_().createFile(Utilities.newBlob(bytes, 'text/csv', tipo + ' ' + fila.fecha_datos + ' ' + a.nombre));
          fila.archivo_id = archivo.getId();
        }
        nuevos.push(fila);
      });
    });
    agregarFilas_('reportes_3cx', nuevos);
    PropertiesService.getScriptProperties().setProperty('ULTIMA_LECTURA_3CX', ahora_());
    return estadoReportes3CX_();
  } finally {
    lock.releaseLock();
  }
}

function estadoReportes3CX_() {
  const filas = leerFilas_('reportes_3cx').filter(f => TIPOS_REPORTE_3CX.indexOf(f.tipo) >= 0);
  const ultimo = {};
  filas.forEach(f => { if (!ultimo[f.tipo] || f.fecha_mail > ultimo[f.tipo].fecha_mail) ultimo[f.tipo] = f; });
  return {
    ultima_lectura: PropertiesService.getScriptProperties().getProperty('ULTIMA_LECTURA_3CX') || '',
    ultimo_por_tipo: TIPOS_REPORTE_3CX.map(t => ({
      tipo: t, fecha_mail: ultimo[t] ? ultimo[t].fecha_mail : '', fecha_datos: ultimo[t] ? ultimo[t].fecha_datos : ''
    }))
  };
}

/**
 * Lee los mails nuevos y devuelve el contenido de los reportes cuyos datos caen en el período.
 * tipos: lista opcional para pedir solo algunos (ej: ['salientes']).
 */
function reportes3CXDelPeriodo(d) {
  const desde = fechaISO_(d.desde, 'desde');
  const hasta = fechaISO_(d.hasta, 'hasta');
  const tipos = d.tipos && d.tipos.length ? d.tipos : TIPOS_REPORTE_3CX;
  let estado, errorLectura = '';
  try {
    estado = importarReportes3CX();
  } catch (e) {
    errorLectura = 'No se pudieron leer los mails: ' + (e.message || e);
    estado = estadoReportes3CX_();
  }
  const archivos = leerFilas_('reportes_3cx')
    .filter(f => tipos.indexOf(f.tipo) >= 0 && f.fecha_datos >= desde && f.fecha_datos <= hasta && f.archivo_id)
    .sort((a, b) => (a.fecha_datos + a.fecha_mail).localeCompare(b.fecha_datos + b.fecha_mail))
    .map(f => ({
      id: f.id, tipo: f.tipo, fecha_datos: f.fecha_datos, fecha_mail: f.fecha_mail, nombre: f.adjunto,
      texto: DriveApp.getFileById(f.archivo_id).getBlob().getDataAsString('UTF-8').replace(/^﻿/, '')
    }));
  return { estado: estado, error: errorLectura, archivos: archivos, firma_guardada: firmaGuardada_(d.claveFirma) };
}

/* ---------- Firmas: evitan guardar dos veces el mismo resultado ---------- */

function firmaGuardada_(clave) {
  return clave ? PropertiesService.getScriptProperties().getProperty('FIRMA_' + texto_(clave, 200)) || '' : '';
}
function guardarFirma_(clave, firma) {
  if (clave && firma) PropertiesService.getScriptProperties().setProperty('FIRMA_' + texto_(clave, 200), texto_(firma, 8000));
}

/**
 * Para ejecutar una vez desde el editor: autoriza el permiso de lectura de Gmail
 * y muestra en el registro qué reportes encontró.
 */
function probarLecturaMails3CX() {
  inicializarBase_();
  const estado = importarReportes3CX();
  Logger.log(JSON.stringify(estado, null, 2));
}
