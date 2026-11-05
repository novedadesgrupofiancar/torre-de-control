/**
 * Sección 7 – Control de WhatsApp.
 * Además de línea, horario y comentario: cantidad sin responder, el más viejo y una muestra
 * opcional de tiempo de respuesta (en la línea Bot, la primera respuesta del agente humano).
 */

function registrarControlWhatsApp(d) {
  const fila = Object.assign({ id: nuevoId_(), registrado_en: ahora_() }, camposWhatsApp_(d));
  agregarFilas_('whatsapp', [fila]);
  return fila;
}

/** Guarda la versión corregida (con la fecha de registro original) y marca la anterior como reemplazada */
function editarControlWhatsApp(d) {
  const campos = camposWhatsApp_(d);
  return reemplazarRegistros_('whatsapp', 'id', texto_(d.id, 60), 'Reemplazado', anteriores =>
    [Object.assign({ id: nuevoId_(), registrado_en: anteriores[0].registrado_en, reemplaza_a: anteriores[0].id }, campos)])[0];
}

function camposWhatsApp_(d) {
  const conf = obtenerConfiguracion();
  const linea = enLista_(d.linea, conf.listas.lineas_whatsapp, 'WhatsApp controlado');
  const campos = Object.assign({
    linea: linea,
    horario: horaHHMM_(d.horario, 'horario'),
    comentario: texto_(d.comentario)
  }, camposRespuesta_(d, linea));
  delete campos.sin_responder; // la hoja de WhatsApp no tiene esa columna
  return campos;
}

function listarControlesWhatsApp() {
  return leerFilas_('whatsapp').sort((a, b) =>
    (b.registrado_en.slice(0, 10) + b.horario + b.registrado_en).localeCompare(a.registrado_en.slice(0, 10) + a.horario + a.registrado_en));
}
