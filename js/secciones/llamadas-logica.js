/* ===== Sección 1 – Llamadas y conexión: reglas de cálculo (sin interfaz) =====
   Lee los CSV de 3CX (% de atendidas e historial de conexión), calcula el % ponderado,
   las desconexiones fuera del descanso, las sesiones sin cerrar y arma los resúmenes. */
const LlamadasLogica = (() => {
  const parsearCSV = (typeof CampaniasLogica !== 'undefined' ? CampaniasLogica : require('./campanias-logica.js')).parsearCSV;
  // Minutos desde los que un corte cuenta como desconexión, si el agente no tiene uno propio
  const TOLERANCIA_POR_DEFECTO = 5;
  const DIA_COMPLETO = 24 * 60;

  /** Detecta qué reporte es cada archivo por sus encabezados */
  function tipoDeReporte(texto) {
    const enc = (parsearCSV(texto.slice(0, 2000))[0] || []).map(c => c.trim());
    if (enc.includes('Queue') && enc.includes('Calls Answered') && enc.includes('% Calls Serviced')) return 'atendidas';
    if (enc.includes('Logged In') && enc.includes('Logged Out') && enc.includes('Day')) return 'conexion';
    return null;
  }

  /** "1234 Nombre Apellido" → "1234" */
  function internoDe(agente) {
    const m = String(agente || '').trim().match(/^(\d+)\s/);
    return m ? m[1] : '';
  }

  function aMinutos(hhmm) {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return isNaN(h) ? null : h * 60 + (m || 0);
  }
  function aHora(min) {
    const m = Math.round(min);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function esFinDeSemana(dia) {
    const d = new Date(dia + 'T12:00:00').getDay();
    return d === 0 || d === 6;
  }

  function filasConEncabezado(texto) {
    const filas = parsearCSV(texto).filter(f => f.some(c => c.trim() !== ''));
    const enc = (filas.shift() || []).map(c => c.trim());
    return filas.map(f => { const o = {}; enc.forEach((c, i) => { o[c] = (f[i] || '').trim(); }); return o; });
  }

  /**
   * % de atendidas por agente y por cola.
   * Llamadas ofrecidas de cada cola = atendidas / %; el total del agente es la suma ponderada.
   */
  function porcentajeAtendidas(texto, equipo) {
    const res = {};
    filasConEncabezado(texto).forEach(f => {
      if (f.Queue === 'Totals' || !f.Queue) return;
      const interno = internoDe(f.Agent);
      if (!equipo[interno]) return; // interno que no es del equipo
      const atendidas = Number(f['Calls Answered']) || 0;
      const pct = (parseFloat(f['% Calls Serviced']) || 0) / 100;
      const ofrecidas = pct > 0 ? atendidas / pct : 0;
      const a = res[interno] = res[interno] || { atendidas: 0, ofrecidas: 0, colas: [] };
      a.atendidas += atendidas;
      a.ofrecidas += ofrecidas;
      a.colas.push({ cola: f.Queue.replace(/^\d+\s+/, ''), atendidas, ofrecidas: Math.round(ofrecidas), pct: ofrecidas ? atendidas / ofrecidas : null });
    });
    Object.values(res).forEach(a => { a.pct = a.ofrecidas ? a.atendidas / a.ofrecidas : null; a.ofrecidas = Math.round(a.ofrecidas); });
    return res;
  }

  /** Sesiones del historial de conexión, en minutos desde el inicio del día (fin 1440 = 24:00) */
  function sesionesDeConexion(texto, equipo) {
    const sesiones = [];
    filasConEncabezado(texto).forEach(f => {
      if (f.Day === 'Totals' || !/^\d{4}-\d{2}-\d{2}$/.test(f.Day)) return;
      const interno = internoDe(f.Agent);
      if (!equipo[interno]) return;
      const ini = f['Logged In'].slice(0, 10) < f.Day ? 0 : minutosDelDia(f['Logged In']);
      const fin = !f['Logged Out'] || f['Logged Out'].slice(0, 10) > f.Day ? DIA_COMPLETO : minutosDelDia(f['Logged Out']);
      sesiones.push({ interno, dia: f.Day, ini, fin, sinSalida: !f['Logged Out'] });
    });
    return sesiones;
  }
  function minutosDelDia(fechaHora) {
    const [h, m, s] = fechaHora.slice(11, 19).split(':').map(Number);
    return h * 60 + m + (s || 0) / 60;
  }

  /** Minutos de [ini, fin] que caen dentro de alguno de los intervalos */
  function superposicion(ini, fin, intervalos) {
    return intervalos.reduce((s, i) => s + Math.max(0, Math.min(fin, i.fin) - Math.max(ini, i.ini)), 0);
  }

  /**
   * Por agente: días hábiles con sus sesiones, cortes y desconexiones fuera del descanso,
   * y sesiones sin cerrar (arranca 00:00, termina 24:00 o en fin de semana).
   */
  function analizarConexion(sesiones, equipo) {
    const res = {};
    sesiones.forEach(s => {
      const a = res[s.interno] = res[s.interno] || { dias: {}, sinCerrar: [], noches: 0 };
      // Sesiones sin cerrar
      const motivos = [];
      if (esFinDeSemana(s.dia)) motivos.push('conexión en fin de semana');
      if (s.ini === 0) motivos.push('arranca a las 00:00');
      if (s.fin === DIA_COMPLETO) motivos.push(s.sinSalida ? 'sin hora de salida' : 'termina a las 24:00');
      if (motivos.length) {
        a.sinCerrar.push({ dia: s.dia, inicio: aHora(s.ini), fin: s.fin === DIA_COMPLETO ? '24:00' : aHora(s.fin), motivo: motivos.join(', ') });
        if (s.fin === DIA_COMPLETO) a.noches++;
      }
      if (esFinDeSemana(s.dia)) return; // desconexiones: solo lunes a viernes
      (a.dias[s.dia] = a.dias[s.dia] || { sesiones: [] }).sesiones.push({ ini: s.ini, fin: s.fin });
    });

    Object.keys(res).forEach(interno => {
      const a = res[interno];
      const horario = equipo[interno].horario || {};
      const descansos = (horario.descansos || []).map(d => ({ ini: aMinutos(d.desde), fin: aMinutos(d.hasta) })).filter(d => d.ini !== null && d.fin !== null);
      const tolerancia = horario.tolerancia === '' || horario.tolerancia === undefined ? TOLERANCIA_POR_DEFECTO : Number(horario.tolerancia);
      a.tolerancia = tolerancia;
      a.descansos = descansos;
      a.desconexiones = 0;
      a.minutos = 0;
      Object.keys(a.dias).forEach(dia => {
        const d = a.dias[dia];
        // Se ordenan y se unen las sesiones superpuestas
        const ses = d.sesiones.sort((x, y) => x.ini - y.ini).reduce((acc, s) => {
          const ult = acc[acc.length - 1];
          if (ult && s.ini <= ult.fin) ult.fin = Math.max(ult.fin, s.fin);
          else acc.push({ ini: s.ini, fin: s.fin });
          return acc;
        }, []);
        d.sesiones = ses;
        d.cortes = [];
        for (let i = 1; i < ses.length; i++) {
          const ini = ses[i - 1].fin, fin = ses[i].ini;
          const fuera = (fin - ini) - superposicion(ini, fin, descansos);
          const cuenta = fuera > tolerancia;
          d.cortes.push({ ini, fin, fuera, cuenta });
          if (cuenta) { a.desconexiones++; a.minutos += fuera; }
        }
      });
      a.minutos = Math.round(a.minutos);
    });
    return res;
  }

  const pctTexto = p => (p === null || p === undefined ? '—' : Math.round(p * 100) + ' %');

  function resumenAgente(nombre, at, con) {
    const partes = [];
    if (con) {
      partes.push(con.desconexiones
        ? `${nombre} se desconectó ${con.desconexiones} ${con.desconexiones === 1 ? 'vez' : 'veces'} además de su descanso (${con.minutos} min en total)`
        : `${nombre} no tuvo desconexiones fuera de su descanso`);
    } else partes.push(`${nombre} no figura en el historial de conexión`);
    partes.push(at && at.pct !== null ? `y atendió el ${pctTexto(at.pct)}` : 'y no figura en el reporte de atendidas');
    let texto = partes.join(' ') + '.';
    if (con && con.noches) texto += ` Dejó la sesión abierta ${con.noches} ${con.noches === 1 ? 'noche' : 'noches'} (afecta el % de atendidas).`;
    else if (con && con.sinCerrar.length) texto += ` Tiene ${con.sinCerrar.length} ${con.sinCerrar.length === 1 ? 'sesión' : 'sesiones'} sin cerrar.`;
    return texto;
  }

  function resumenEquipo(equipo) {
    const sinCerrar = equipo.sinCerrar;
    return `El equipo atendió el ${pctTexto(equipo.pct)} (${equipo.atendidas} de ${equipo.ofrecidas} llamadas ofrecidas). ` +
      `Hubo ${equipo.desconexiones} ${equipo.desconexiones === 1 ? 'desconexión' : 'desconexiones'} fuera del descanso (${equipo.minutos} min) ` +
      `y ${sinCerrar} ${sinCerrar === 1 ? 'sesión' : 'sesiones'} sin cerrar.`;
  }

  /**
   * Procesa los dos CSV. "agentes" y "horarios" vienen de Configuración.
   * Devuelve el período, los resultados por agente, el total del equipo y los textos.
   */
  function procesar(textoAtendidas, textoConexion, agentes, horarios) {
    const equipo = {};
    agentes.filter(a => a.interno).forEach(a => { equipo[a.interno] = { nombre: a.nombre, horario: horarios[a.id] || {} }; });
    const at = porcentajeAtendidas(textoAtendidas, equipo);
    const sesiones = sesionesDeConexion(textoConexion, equipo);
    const con = analizarConexion(sesiones, equipo);
    const dias = sesiones.map(s => s.dia).sort();

    const internos = Object.keys(equipo).filter(i => at[i] || con[i]).sort((x, y) => equipo[x].nombre.localeCompare(equipo[y].nombre));
    const resultado = internos.map(i => ({
      interno: i,
      agente: equipo[i].nombre,
      atendidas: at[i] || null,
      conexion: con[i] || null,
      resumen: resumenAgente(equipo[i].nombre, at[i], con[i])
    }));
    const tot = resultado.reduce((t, r) => {
      if (r.atendidas) { t.atendidas += r.atendidas.atendidas; t.ofrecidas += r.atendidas.ofrecidas; }
      if (r.conexion) { t.desconexiones += r.conexion.desconexiones; t.minutos += r.conexion.minutos; t.sinCerrar += r.conexion.sinCerrar.length; }
      return t;
    }, { atendidas: 0, ofrecidas: 0, desconexiones: 0, minutos: 0, sinCerrar: 0 });
    tot.pct = tot.ofrecidas ? tot.atendidas / tot.ofrecidas : null;
    tot.resumen = resumenEquipo(tot);
    return { desde: dias[0] || '', hasta: dias[dias.length - 1] || '', agentes: resultado, equipo: tot };
  }

  return { TOLERANCIA_POR_DEFECTO, tipoDeReporte, procesar, pctTexto, aHora, aMinutos, DIA_COMPLETO };
})();

if (typeof module !== 'undefined') module.exports = LlamadasLogica;
