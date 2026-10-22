/**
 * Sección 6 – Taller: agendas web, bitácora libre y capturas de pantalla.
 */

/* ---------- Agendas web ---------- */

function registrarAgendaWeb(d) {
  const conf = obtenerConfiguracion();
  const fila = {
    id: nuevoId_(),
    registrado_en: ahora_(),
    fecha: fechaISO_(d.fecha, 'fecha'),
    hora: horaHHMM_(d.hora, 'hora'),
    taller: enLista_(d.taller, conf.listas.talleres, 'taller'),
    comentario: texto_(d.comentario),
    se_llamo: 'No',
    historial_llamado: ''
  };
  agregarFilas_('agendas_web', [fila]);
  return fila;
}

/** Marca o desmarca "¿Se llamó?" y deja anotado cada cambio con fecha y hora */
function marcarLlamadoAgenda(id, llamado) {
  const valor = llamado ? 'Sí' : 'No';
  return actualizarFila_('agendas_web', texto_(id, 60), fila => ({
    se_llamo: valor,
    historial_llamado: (fila.historial_llamado ? fila.historial_llamado + '\n' : '') + ahora_() + ' → ' + valor
  }));
}

function listarAgendasWeb() {
  return leerFilas_('agendas_web').sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

/* ---------- Bitácora libre ---------- */

function registrarBitacora(d) {
  const fila = { id: nuevoId_(), registrado_en: ahora_(), comentario: requerido_(texto_(d.comentario), 'comentario') };
  agregarFilas_('bitacora_taller', [fila]);
  return fila;
}

function listarBitacora() {
  return leerFilas_('bitacora_taller').sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
}

/* ---------- Capturas de pantalla ---------- */

const TIPOS_IMAGEN = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** Sube a "Panel – Capturas" una imagen pegada con Ctrl+V y guarda el link */
function subirCaptura(d) {
  const extension = TIPOS_IMAGEN[d.mime];
  if (!extension) throw new Error('El portapapeles no tiene una imagen compatible.');
  const bytes = Utilities.base64Decode(d.base64);
  if (bytes.length > 15 * 1024 * 1024) throw new Error('La imagen supera los 15 MB.');
  const seccion = texto_(d.seccion, 30) || 'Taller';
  const ahora = ahora_();
  const nombre = seccion + ' ' + ahora.replace(/:/g, '.') + '.' + extension;
  const archivo = obtenerCarpetaCapturas_().createFile(Utilities.newBlob(bytes, d.mime, nombre));
  const fila = {
    id: nuevoId_(), registrado_en: ahora, seccion: seccion,
    nombre: nombre, link: archivo.getUrl(), archivo_id: archivo.getId()
  };
  agregarFilas_('capturas', [fila]);
  return fila;
}

function listarCapturas(seccion) {
  return leerFilas_('capturas')
    .filter(c => !seccion || c.seccion === seccion)
    .sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
}

/** Devuelve la imagen como data URL para mostrarla en el panel */
function obtenerImagenCaptura(archivoId) {
  const existe = leerFilas_('capturas').some(c => c.archivo_id === archivoId);
  if (!existe) throw new Error('Captura no encontrada.');
  const blob = DriveApp.getFileById(archivoId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}
