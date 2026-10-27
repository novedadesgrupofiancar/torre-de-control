/* ===== Reportes – Resumen para Jimena: armado del texto con reglas fijas (sin IA) =====
   Incluye llamadas y conexión, campañas, asistencia, issues, redes y taller. No incluye WhatsApp.
   Los comentarios de asistencia, issues y taller van tal cual se escribieron. */
const JimenaLogica = (() => {
  const fecha = iso => { if (!iso) return ''; const p = iso.slice(0, 10).split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
  const fechaHora = s => (s ? fecha(s) + ' ' + s.slice(11, 16) : '');
  const rango = (d, h) => (!h || h === d ? fecha(d) : `${fecha(d)} al ${fecha(h)}`);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function llamadas(c) {
    if (!c) return ['Sin reportes de 3CX cargados para esta semana.'];
    const l = [`(Reporte de 3CX del ${fecha(c.desde)} al ${fecha(c.hasta)})`];
    if (c.equipo) l.push('- ' + c.equipo.resumen);
    c.agentes.forEach(a => l.push('- ' + a.resumen));
    return l;
  }

  function campanias(r) {
    if (!r) return ['Sin datos de campañas.'];
    if (r.error) return [r.error];
    const x = r.resultados;
    const motivos = Object.keys(x.motivos).map(m => `${m.replace(/^No aplica – /, '')} ${x.motivos[m]}`).join(', ');
    const resto = Object.keys(x.estados).map(e => `${e} ${x.estados[e]}`).concat(Object.keys(x.otros).map(e => `${e} ${x.otros[e]}`)).join(' · ');
    return [
      `(Mes ${r.mes}: ${r.referencia})`,
      `- Gestionadas: ${x.gestionadas} · Ganadas: ${x.ganadas}`,
      `- No aplica: ${x.noAplica} (${motivos})`,
      `- ${resto}`
    ];
  }

  function asistencia(registros) {
    if (!registros.length) return ['Sin registros.'];
    return registros.map(r => {
      let t = `- ${r.agente} · ${r.evento} · ${rango(r.desde, r.hasta)}`;
      if (r.motivo) t += ` · Motivo: ${r.motivo}`;
      if (r.tipo_ho) t += ` · Tipo de HO: ${r.tipo_ho}`;
      if (r.hora_llegada) t += ` · Hora de llegada: ${r.hora_llegada}`;
      if (r.comentario) t += `\n  Comentario: ${r.comentario}`;
      return t;
    });
  }

  /** Solo los comentarios cargados dentro del período (el backend ya los filtra) */
  function issues(lista) {
    if (!lista.length) return ['Sin novedades en la semana.'];
    const l = [];
    lista.forEach(i => {
      l.push(`- ${i.issue} [${i.estado}${i.estado === 'Escalado' && i.escalado_a ? ' a ' + i.escalado_a : ''}]`);
      i.comentarios.forEach(c => {
        const estado = c.estado + (c.estado === 'Escalado' && c.escalado_a ? ' a ' + c.escalado_a : '');
        l.push(`  ${fechaHora(c.registrado_en)} · ${estado}${c.comentario ? ': ' + c.comentario : ''}`);
      });
    });
    return l;
  }

  function redes(monitoreos, opciones) {
    if (!monitoreos.length) return ['Sin monitoreos cargados.'];
    const l = [`- ${plural(monitoreos.length, 'monitoreo cargado', 'monitoreos cargados')}.`];
    const conPendientes = [];
    monitoreos.forEach(m => Object.keys(m.redes).forEach(red => {
      const r = m.redes[red];
      if (r.sin_responder === 'Sí') conPendientes.push(`${red} (monitoreo ${m.turno} del ${fecha(m.registrado_en)}: mensajes del ${fecha(r.fecha_mensajes)})`);
    }));
    l.push(conPendientes.length ? '- Con mensajes sin responder: ' + conPendientes.join('; ') + '.' : '- Sin mensajes sin responder.');
    // Métricas de tiempo de respuesta por página (tiempo hábil)
    if (opciones && opciones.atencion) {
      const MR = typeof MetricasRespuesta !== 'undefined' ? MetricasRespuesta : require('./metricas-respuesta.js');
      l.push('- Métricas por página:');
      MR.calcular(MR.observacionesDeRedes(monitoreos), opciones.redes || [], opciones.atencion, opciones.feriados || [])
        .forEach(m => l.push('  ' + m.resumen));
    }
    return l;
  }

  function taller(t) {
    const l = [];
    const llamadas = t.agendas.filter(a => a.se_llamo === 'Sí').length;
    if (t.agendas.length) {
      l.push(`- Agendas web: ${t.agendas.length} · Se llamó a ${llamadas} · Sin llamar ${t.agendas.length - llamadas}`);
      t.agendas.filter(a => a.se_llamo !== 'Sí').forEach(a =>
        l.push(`  Sin llamar: ${fecha(a.fecha)} ${a.hora} · ${a.taller}${a.comentario ? ' · ' + a.comentario : ''}`));
    } else l.push('- Agendas web: sin agendas cargadas.');
    if (t.comentarios.length) {
      l.push('- Comentarios:');
      t.comentarios.forEach(c => l.push(`  ${fechaHora(c.registrado_en)}: ${c.comentario}`));
    }
    if (t.capturas) l.push(`- ${plural(t.capturas, 'captura guardada', 'capturas guardadas')}.`);
    return l;
  }

  /**
   * datos: respuesta de datosResumenJimena; reporteCampanias: el reporte semanal de campañas (o {error});
   * opciones: { atencion, feriados, redes } de Configuración, para las métricas de Redes
   */
  function armar(datos, reporteCampanias, opciones) {
    const bloque = (titulo, lineas) => [titulo.toUpperCase(), ...lineas, ''].join('\n');
    return [
      `Resumen semanal – del ${fecha(datos.desde)} al ${fecha(datos.hasta)}`,
      '',
      bloque('Llamadas y conexión', llamadas(datos.llamadas)),
      bloque('Campañas', campanias(reporteCampanias)),
      bloque('Asistencia', asistencia(datos.asistencia)),
      bloque('Issues', issues(datos.issues)),
      bloque('Redes', redes(datos.redes, opciones)),
      bloque('Taller', taller(datos.taller))
    ].join('\n').trim();
  }

  return { armar };
})();

if (typeof module !== 'undefined') module.exports = JimenaLogica;
