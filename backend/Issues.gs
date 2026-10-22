/**
 * Sección 4 – Issues.
 * El issue se guarda una sola vez. Cada actualización (comentario y/o cambio de estado)
 * es una fila nueva en "comentarios_issues"; el estado actual es el del último comentario.
 */

const ESTADOS_ISSUE = ['Detectado', 'Escalado', 'Solucionado'];

function crearIssue(d) {
  const conf = obtenerConfiguracion();
  const estado = enLista_(d.estado || 'Detectado', ESTADOS_ISSUE, 'estado');
  const ahora = ahora_();
  const issue = {
    id: nuevoId_(),
    registrado_en: ahora,
    fecha: fechaISO_(d.fecha || hoy_(), 'fecha'),
    issue: requerido_(texto_(d.issue, 300), 'issue'),
    detalles: texto_(d.detalles)
  };
  const primerEstado = {
    id: nuevoId_(),
    issue_id: issue.id,
    registrado_en: ahora,
    comentario: '',
    estado: estado,
    escalado_a: estado === 'Escalado' ? enLista_(d.escalado_a, conf.listas.escalado, 'escalado a') : ''
  };
  agregarFilas_('issues', [issue]);
  agregarFilas_('comentarios_issues', [primerEstado]);
  return true;
}

/** Agrega una actualización. Los comentarios anteriores no se tocan. */
function agregarComentarioIssue(d) {
  const conf = obtenerConfiguracion();
  const actual = listarIssues().filter(i => i.id === d.issue_id)[0];
  if (!actual) throw new Error('No se encontró el issue.');
  const estado = enLista_(d.estado || actual.estado, ESTADOS_ISSUE, 'estado');
  const escalado_a = estado === 'Escalado'
    ? enLista_(d.escalado_a || actual.escalado_a, conf.listas.escalado, 'escalado a') : '';
  const comentario = texto_(d.comentario);
  if (!comentario && estado === actual.estado && escalado_a === actual.escalado_a) {
    throw new Error('Escribí un comentario o cambiá el estado.');
  }
  agregarFilas_('comentarios_issues', [{
    id: nuevoId_(), issue_id: actual.id, registrado_en: ahora_(),
    comentario: comentario, estado: estado, escalado_a: escalado_a
  }]);
  return true;
}

/** Issues con su historial completo y su estado actual */
function listarIssues() {
  const porIssue = {};
  leerFilas_('comentarios_issues')
    .sort((a, b) => a.registrado_en.localeCompare(b.registrado_en))
    .forEach(c => { (porIssue[c.issue_id] = porIssue[c.issue_id] || []).push(c); });

  return leerFilas_('issues').map(i => {
    const comentarios = porIssue[i.id] || [];
    const ultimo = comentarios[comentarios.length - 1] || {};
    return Object.assign({}, i, {
      comentarios: comentarios,
      estado: ultimo.estado || 'Detectado',
      escalado_a: ultimo.escalado_a || '',
      actualizado_en: ultimo.registrado_en || i.registrado_en
    });
  }).sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en));
}
