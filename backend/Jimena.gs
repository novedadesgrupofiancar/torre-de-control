/**
 * Reportes – Resumen para Jimena.
 * Devuelve los datos de la semana (lunes a viernes) de cada sección incluida:
 * llamadas y conexión, asistencia, issues, redes y taller. No incluye WhatsApp.
 * El texto se arma en el navegador con reglas fijas (sin IA); campañas se calcula allá también.
 */

function datosResumenJimena(fecha) {
  const lunes = lunesDe_(fechaISO_(fecha, 'semana'));
  const viernes = sumarDias_(lunes, 4);
  const enPeriodo = registrado => registrado.slice(0, 10) >= lunes && registrado.slice(0, 10) <= viernes;

  // Llamadas: la carga más reciente cuyo período toca la semana
  const carga = listarCargasLlamadas().filter(c => c.desde <= viernes && c.hasta >= lunes)[0] || null;

  // Asistencia: registros cuyo rango desde–hasta toca la semana
  const asistencia = leerFilas_('asistencia')
    .filter(r => r.desde <= viernes && (r.hasta || r.desde) >= lunes)
    .sort((a, b) => (a.desde + a.agente).localeCompare(b.desde + b.agente));

  // Issues: solo los comentarios cargados dentro del período
  const issues = listarIssues()
    .map(i => Object.assign({}, i, { comentarios: i.comentarios.filter(c => enPeriodo(c.registrado_en)) }))
    .filter(i => i.comentarios.length);

  const redes = listarMonitoreos().filter(m => enPeriodo(m.registrado_en)).reverse();

  const taller = {
    agendas: listarAgendasWeb().filter(a => a.fecha >= lunes && a.fecha <= viernes),
    comentarios: listarBitacora().filter(b => enPeriodo(b.registrado_en)).reverse(),
    capturas: listarCapturas('Taller').filter(c => enPeriodo(c.registrado_en)).length
  };

  return { desde: lunes, hasta: viernes, llamadas: carga, asistencia: asistencia, issues: issues, redes: redes, taller: taller };
}
