/**
 * Sección 5 – Redes.
 * Cada carga de monitoreo guarda una fila por red, todas con el mismo monitoreo_id.
 */

function registrarMonitoreo(d) {
  const conf = obtenerConfiguracion();
  const turno = enLista_(d.turno, conf.listas.turnos, 'turno de monitoreo');
  const respuestas = d.filas || [];
  const monitoreoId = nuevoId_();
  const ahora = ahora_();

  const filas = conf.listas.redes.map(red => {
    const r = respuestas.filter(x => x.red === red)[0];
    if (!r || (r.sin_responder !== 'Sí' && r.sin_responder !== 'No')) {
      throw new Error('Falta indicar si hay mensajes sin responder en ' + red + '.');
    }
    return {
      id: nuevoId_(),
      registrado_en: ahora,
      monitoreo_id: monitoreoId,
      turno: turno,
      red: red,
      sin_responder: r.sin_responder,
      fecha_mensajes: r.sin_responder === 'Sí' ? fechaISO_(r.fecha_mensajes, 'de qué fecha (' + red + ')') : ''
    };
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
    g.redes[f.red] = { sin_responder: f.sin_responder, fecha_mensajes: f.fecha_mensajes };
  });
  return Object.keys(grupos).map(k => grupos[k])
    .sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
}
