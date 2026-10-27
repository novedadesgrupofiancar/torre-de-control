/**
 * Sección 7 – Control de WhatsApp.
 * Además de línea, horario y comentario: cantidad sin responder, el más viejo y una muestra
 * opcional de tiempo de respuesta (en la línea Bot, la primera respuesta del agente humano).
 */

function registrarControlWhatsApp(d) {
  const conf = obtenerConfiguracion();
  const linea = enLista_(d.linea, conf.listas.lineas_whatsapp, 'WhatsApp controlado');
  const fila = Object.assign({
    id: nuevoId_(),
    registrado_en: ahora_(),
    linea: linea,
    horario: horaHHMM_(d.horario, 'horario'),
    comentario: texto_(d.comentario)
  }, camposRespuesta_(d, linea));
  delete fila.sin_responder; // la hoja de WhatsApp no tiene esa columna
  agregarFilas_('whatsapp', [fila]);
  return fila;
}

function listarControlesWhatsApp() {
  return leerFilas_('whatsapp').sort((a, b) =>
    (b.registrado_en.slice(0, 10) + b.horario + b.registrado_en).localeCompare(a.registrado_en.slice(0, 10) + a.horario + a.registrado_en));
}
