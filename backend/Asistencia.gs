/**
 * Sección 3 – Marcas / llegadas tarde / home office / faltas
 * y reporte semanal para RRHH.
 */

const EVENTOS_ASISTENCIA = ['Falta', 'Llegada tarde', 'Home office', 'No marcó'];
const TIPOS_HO = ['Excepción', 'Premio', 'Otro'];

function registrarAsistencia(d) {
  const conf = obtenerConfiguracion();
  const agente = requerido_(texto_(d.agente, 100), 'agente');
  if (!conf.agentes.some(a => a.nombre === agente)) throw new Error('El agente no está cargado en Configuración.');
  const evento = enLista_(d.evento, EVENTOS_ASISTENCIA, 'evento');
  const desde = fechaISO_(d.desde, 'desde');
  const hasta = texto_(d.hasta) ? fechaISO_(d.hasta, 'hasta') : desde;
  if (hasta < desde) throw new Error('La fecha "hasta" es anterior a "desde".');
  const motivo = texto_(d.motivo, 200);
  if (motivo && conf.listas.motivos.indexOf(motivo) < 0) throw new Error('El motivo no está en la lista.');

  const fila = {
    id: nuevoId_(),
    registrado_en: ahora_(),
    agente: agente,
    evento: evento,
    motivo: motivo,
    tipo_ho: evento === 'Home office' ? enLista_(d.tipo_ho, TIPOS_HO, 'tipo de HO') : '',
    hora_llegada: evento === 'Llegada tarde' ? horaHHMM_(d.hora_llegada, 'hora de llegada') : '',
    desde: desde,
    hasta: hasta,
    comentario: texto_(d.comentario)
  };
  agregarFilas_('asistencia', [fila]);
  return fila;
}

/** Todos los registros, del más reciente al más viejo */
function listarAsistencia() {
  return leerFilas_('asistencia').sort((a, b) =>
    (b.desde + b.registrado_en).localeCompare(a.desde + a.registrado_en));
}

/**
 * Reporte semanal para RRHH (lunes a domingo de la semana que contiene la fecha).
 * Los comentarios van tal cual se escribieron.
 */
function reporteRRHH(fecha) {
  const lunes = lunesDe_(fechaISO_(fecha, 'semana'));
  const domingo = sumarDias_(lunes, 6);
  const registros = leerFilas_('asistencia')
    .filter(r => r.desde <= domingo && (r.hasta || r.desde) >= lunes)
    .sort((a, b) => (a.desde + a.agente).localeCompare(b.desde + b.agente));

  const titulos = { 'No marcó': 'No marcó', 'Falta': 'Faltas', 'Llegada tarde': 'Llegadas tarde', 'Home office': 'Home office' };
  const grupos = ['No marcó', 'Falta', 'Llegada tarde', 'Home office'].map(evento => ({
    evento: evento,
    titulo: titulos[evento],
    items: registros.filter(r => r.evento === evento)
  }));

  const lineas = ['Reporte semanal de asistencia – del ' + fechaCorta_(lunes) + ' al ' + fechaCorta_(domingo), ''];
  grupos.forEach(g => {
    lineas.push(g.titulo.toUpperCase() + ' (' + g.items.length + ')');
    if (!g.items.length) lineas.push('Sin registros.');
    g.items.forEach(r => {
      let linea = '- ' + r.agente + ' · ' + rangoTexto_(r) + ' · Motivo: ' + (r.motivo || '—');
      if (r.tipo_ho) linea += ' · Tipo de HO: ' + r.tipo_ho;
      if (r.hora_llegada) linea += ' · Hora de llegada: ' + r.hora_llegada;
      lineas.push(linea);
      lineas.push('  Comentario: ' + (r.comentario || '—'));
    });
    lineas.push('');
  });

  return {
    desde: lunes,
    hasta: domingo,
    grupos: grupos,
    texto: lineas.join('\n').trim(),
    destinatario: obtenerConfiguracion().destinatarios.rrhh
  };
}

function exportarRRHHExcel(fecha) {
  const r = reporteRRHH(fecha);
  const encabezados = ['Evento', 'Agente', 'Desde', 'Hasta', 'Motivo', 'Tipo de HO', 'Hora de llegada', 'Comentario', 'Registrado'];
  const filas = [];
  r.grupos.forEach(g => g.items.forEach(x => filas.push([
    x.evento, x.agente, fechaCorta_(x.desde), fechaCorta_(x.hasta || x.desde), x.motivo,
    x.tipo_ho, x.hora_llegada, x.comentario, fechaCorta_(x.registrado_en) + ' ' + x.registrado_en.slice(11, 16)
  ])));
  return exportarExcel_('RRHH semanal ' + r.desde + ' al ' + r.hasta, encabezados, filas);
}

function rangoTexto_(r) {
  const hasta = r.hasta || r.desde;
  return hasta === r.desde ? fechaCorta_(r.desde) : fechaCorta_(r.desde) + ' al ' + fechaCorta_(hasta);
}
