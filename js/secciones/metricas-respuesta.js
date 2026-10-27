/* ===== Métricas de respuesta de Redes y WhatsApp (sin interfaz) =====
   Entrada: observaciones de los monitoreos, una por página o línea:
   { grupo, momento: 'aaaa-mm-dd hh:mm', cantidad: número o null (registros viejos),
     masViejo: 'aaaa-mm-dd hh:mm' o '' (los viejos con solo fecha quedan fuera), muestraMensaje, muestraRespuesta } */
const MetricasRespuesta = (() => {
  const TH = typeof TiempoHabil !== 'undefined' ? TiempoHabil : require('../tiempo-habil.js');
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const conHora = s => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s || '');
  const fechaCorta = iso => { const p = iso.slice(0, 10).split('-'); return `${p[2]}/${p[1]}`; };
  const nombreDia = iso => DIAS[new Date(iso.slice(0, 10) + 'T12:00:00Z').getUTCDay()];

  /** Métricas por grupo (página o línea) para las observaciones del período */
  function calcular(observaciones, grupos, atencion, feriados) {
    const nombres = grupos.concat([...new Set(observaciones.map(o => o.grupo))].filter(g => !grupos.includes(g)));
    return nombres.map(grupo => {
      const obs = observaciones.filter(o => o.grupo === grupo);
      const tiempos = obs.filter(o => conHora(o.muestraMensaje) && conHora(o.muestraRespuesta))
        .map(o => TH.minutos(o.muestraMensaje, o.muestraRespuesta, atencion, feriados));
      const conCantidad = obs.filter(o => o.cantidad !== null && o.cantidad !== undefined && o.cantidad !== '');
      const antiguedades = obs.filter(o => Number(o.cantidad) > 0 && conHora(o.masViejo))
        .map(o => ({ o, min: TH.minutos(o.masViejo, o.momento, atencion, feriados) }));
      const peor = antiguedades.reduce((a, b) => (!a || b.min > a.min ? b : a), null);
      const m = {
        grupo,
        monitoreos: obs.length,
        muestras: tiempos.length,
        respuestaPromedio: tiempos.length ? tiempos.reduce((s, x) => s + x, 0) / tiempos.length : null,
        pendientesPromedio: conCantidad.length ? conCantidad.reduce((s, o) => s + Number(o.cantidad), 0) / conCantidad.length : null,
        pendientesMax: conCantidad.length ? Math.max(...conCantidad.map(o => Number(o.cantidad))) : null,
        antiguedadMax: peor ? peor.min : null,
        peor: peor ? peor.o : null
      };
      m.resumen = resumen(m);
      return m;
    });
  }

  function resumen(m) {
    let t = `${m.grupo}: ` + (m.muestras
      ? `respuesta promedio ${TH.formatear(m.respuestaPromedio)} (${m.muestras} ${m.muestras === 1 ? 'muestra' : 'muestras'}).`
      : 'sin muestras de tiempo de respuesta.');
    if (m.peor) {
      t += ` En el monitoreo del ${nombreDia(m.peor.momento)} ${fechaCorta(m.peor.momento)} tuvo ${m.peor.cantidad} ${Number(m.peor.cantidad) === 1 ? 'pendiente' : 'pendientes'} y el más viejo esperaba ${TH.formatear(m.antiguedadMax)} hábiles.`;
    } else if (m.pendientesMax > 0) {
      t += ` Máximo de pendientes en un monitoreo: ${m.pendientesMax}.`;
    } else if (m.pendientesMax === 0) {
      t += ' Sin pendientes en el período.';
    }
    return t;
  }

  /** Texto para celdas: "Sin muestras" en lugar de 0 cuando no hay datos */
  const textoTiempo = (min, vacio) => (min === null ? vacio || 'Sin muestras' : TH.formatear(min));
  const textoNumero = (n, decimales) => (n === null ? '—' : (Math.round(n * Math.pow(10, decimales || 0)) / Math.pow(10, decimales || 0)).toString().replace('.', ','));

  const numeroONull = v => (v === '' || v === null || v === undefined ? null : Number(v));

  /** Monitoreos de Redes (listarMonitoreos) → observaciones. El momento es cuando se guardó el monitoreo. */
  function observacionesDeRedes(monitoreos) {
    return monitoreos.flatMap(m => Object.keys(m.redes).map(red => {
      const r = m.redes[red];
      return { grupo: red, momento: m.registrado_en.slice(0, 16), cantidad: numeroONull(r.cantidad_sin_responder),
        masViejo: r.fecha_mensajes || '', muestraMensaje: r.muestra_mensaje || '', muestraRespuesta: r.muestra_respuesta || '' };
    }));
  }

  /** Controles de WhatsApp → observaciones. El momento es la fecha del registro con el horario cargado. */
  function observacionesDeWhatsApp(controles) {
    return controles.map(c => ({ grupo: c.linea, momento: c.registrado_en.slice(0, 10) + ' ' + c.horario,
      cantidad: numeroONull(c.cantidad_sin_responder), masViejo: c.fecha_mensajes || '',
      muestraMensaje: c.muestra_mensaje || '', muestraRespuesta: c.muestra_respuesta || '' }));
  }

  return { calcular, textoTiempo, textoNumero, observacionesDeRedes, observacionesDeWhatsApp };
})();

if (typeof module !== 'undefined') module.exports = MetricasRespuesta;
