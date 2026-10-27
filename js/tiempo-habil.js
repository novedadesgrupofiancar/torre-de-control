/* ===== Tiempo hábil (única función de cálculo para Redes, WhatsApp y el resumen para Jimena) =====
   Cuenta solo los minutos dentro del horario de atención, en días de atención que no sean feriado.
   Si algo llega fuera de horario, el reloj arranca en la siguiente apertura.
   atencion: { dias: [1..5] (0 domingo … 6 sábado), desde: 'hh:mm', hasta: 'hh:mm' } · feriados: ['aaaa-mm-dd'] */
const TiempoHabil = (() => {
  const aMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const dia = s => s.slice(0, 10);
  const minutoDelDia = s => (s.length > 10 ? aMin(s.slice(11, 16)) : 0);
  function siguienteDia(iso) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const diaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay();

  /** Minutos hábiles entre dos momentos "aaaa-mm-dd hh:mm" */
  function minutos(inicio, fin, atencion, feriados) {
    if (!inicio || !fin || fin <= inicio) return 0;
    const abre = aMin(atencion.desde), cierra = aMin(atencion.hasta);
    const libres = new Set(feriados || []);
    let total = 0;
    for (let d = dia(inicio); d <= dia(fin); d = siguienteDia(d)) {
      if (!atencion.dias.includes(diaSemana(d)) || libres.has(d)) continue;
      const desde = Math.max(abre, d === dia(inicio) ? minutoDelDia(inicio) : 0);
      const hasta = Math.min(cierra, d === dia(fin) ? minutoDelDia(fin) : 24 * 60);
      if (hasta > desde) total += hasta - desde;
    }
    return total;
  }

  /** 80 → "1 h 20 min" · 45 → "45 min" · 120 → "2 h" */
  function formatear(min) {
    const m = Math.round(min);
    const h = Math.floor(m / 60), r = m % 60;
    if (!h) return `${r} min`;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  return { minutos, formatear };
})();

if (typeof module !== 'undefined') module.exports = TiempoHabil;
