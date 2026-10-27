/**
 * Sección 5 – Redes.
 * Cada carga de monitoreo guarda una fila por red, todas con el mismo monitoreo_id.
 * Por red: cantidad de mensajes sin responder, fecha y hora del más viejo y una muestra opcional
 * de tiempo de respuesta (mensaje del cliente y primera respuesta del agente).
 */

/**
 * Valida los campos de tiempo de respuesta (se usan en Redes y en WhatsApp).
 * "sin_responder" (Sí/No) se sigue completando a partir de la cantidad, para el historial.
 */
function camposRespuesta_(r, nombre) {
  const t = texto_(r.cantidad_sin_responder, 6);
  const cantidad = Number(t);
  if (t === '' || !Number.isInteger(cantidad) || cantidad < 0) {
    throw new Error('Falta la cantidad de mensajes sin responder en ' + nombre + ' (0 si no hay).');
  }
  const campos = {
    cantidad_sin_responder: cantidad,
    sin_responder: cantidad > 0 ? 'Sí' : 'No',
    fecha_mensajes: cantidad > 0 ? fechaHora_(r.fecha_mensajes, 'mensaje sin responder más viejo (' + nombre + ')') : '',
    muestra_mensaje: '',
    muestra_respuesta: ''
  };
  // Muestra de tiempo de respuesta: opcional, pero si se carga van las dos fechas
  const msj = texto_(r.muestra_mensaje, 19), resp = texto_(r.muestra_respuesta, 19);
  if (msj || resp) {
    campos.muestra_mensaje = fechaHora_(msj, 'mensaje del cliente (' + nombre + ')');
    campos.muestra_respuesta = fechaHora_(resp, 'primera respuesta (' + nombre + ')');
    if (campos.muestra_respuesta < campos.muestra_mensaje) {
      throw new Error('En ' + nombre + ' la respuesta no puede ser anterior al mensaje del cliente.');
    }
  }
  return campos;
}

function registrarMonitoreo(d) {
  const conf = obtenerConfiguracion();
  const turno = enLista_(d.turno, conf.listas.turnos, 'turno de monitoreo');
  const respuestas = d.filas || [];
  const monitoreoId = nuevoId_();
  const ahora = ahora_();

  const filas = conf.listas.redes.map(red => {
    const r = respuestas.filter(x => x.red === red)[0];
    if (!r) throw new Error('Faltan los datos de ' + red + '.');
    return Object.assign({ id: nuevoId_(), registrado_en: ahora, monitoreo_id: monitoreoId, turno: turno, red: red },
      camposRespuesta_(r, red));
  });
  agregarFilas_('redes', filas);
  return true;
}

/** Monitoreos agrupados, del más reciente al más viejo */
function listarMonitoreos() {
  const grupos = {};
  leerFilas_('redes').forEach(f => {
    const g = grupos[f.monitoreo_id] = grupos[f.monitoreo_id] ||
      { id: f.monitoreo_id, registrado_en: f.registrado_en, turno: f.turno, redes: {} };
    g.redes[f.red] = {
      sin_responder: f.sin_responder, fecha_mensajes: f.fecha_mensajes,
      cantidad_sin_responder: f.cantidad_sin_responder, muestra_mensaje: f.muestra_mensaje, muestra_respuesta: f.muestra_respuesta
    };
  });
  return Object.keys(grupos).map(k => grupos[k])
    .sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
}
