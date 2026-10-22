/* ===== Sección 2 – Campañas: reglas de cálculo (sin interfaz) =====
   Clasificación de No aplica, gestiones por agente y km, resultados,
   lectura del CSV de salientes de 3CX y cruce con las gestiones. */
const CampaniasLogica = (() => {
  const ESTADOS = ['Agendado', 'Ya lo hizo', 'Rechaza', 'Pendiente', 'No contesta', 'No aplica'];
  const SIN_MAPEAR = 'Sin mapear';
  // Motivos de No aplica en orden de evaluación: gana el primero que coincide
  const MOTIVOS = [
    { clave: 'canepas', nombre: 'No aplica – lo hace en Canepas' },
    { clave: 'venta', nombre: 'No aplica – no tiene el auto / lo vendió' },
    { clave: 'ya_vino', nombre: 'No aplica – ya vino / el km no es el de la hoja' }
  ];
  const SIN_CLASIFICAR = 'No aplica – sin clasificar';
  // Comentario con formato de orden de taller: "dd/mm/aaaa | número | NN K"
  const FORMATO_ORDEN = /\d{1,2}\/\d{1,2}\/\d{4}\s*\|\s*\d+\s*\|\s*\d+\s*K/i;

  /** Minúsculas, sin acentos y sin espacios repetidos */
  function normalizar(t) {
    return String(t === null || t === undefined ? '' : t)
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function clasificarNoAplica(comentario, palabras) {
    const c = normalizar(comentario);
    for (const m of MOTIVOS) {
      const coincide = (palabras[m.clave] || []).some(p => { const n = normalizar(p); return n && c.includes(n); });
      if (coincide) return m.nombre;
      if (m.clave === 'ya_vino' && FORMATO_ORDEN.test(comentario || '')) return m.nombre;
    }
    return SIN_CLASIFICAR;
  }

  /** Orden de kilometrajes: 10K, 20K, …, 70K, 70K+, 80K, … */
  function ordenKm(km) {
    const n = parseInt(km, 10);
    return isNaN(n) ? 1e9 : n + (String(km).includes('+') ? 0.5 : 0);
  }

  /**
   * Asigna cada fila a un agente de Configuración (por nombre en planillas, sin acentos ni mayúsculas).
   * Los que no están en Configuración van a "Sin mapear".
   */
  function mapearAgentes(filas, agentes) {
    const porNombre = {};
    agentes.forEach(a => { porNombre[normalizar(a.nombre)] = a; });
    const sinMapear = new Set();
    const mapeadas = filas.map(f => {
      const a = porNombre[normalizar(f.agente)];
      if (!a) sinMapear.add(f.agente || '(sin agente)');
      return Object.assign({}, f, { agente_panel: a ? a.nombre : SIN_MAPEAR, interno: a ? a.interno : '' });
    });
    return { filas: mapeadas, sinMapear: [...sinMapear].sort() };
  }

  function ordenarAgentes(nombres) {
    return nombres.sort((a, b) => (a === SIN_MAPEAR) - (b === SIN_MAPEAR) || a.localeCompare(b));
  }

  /** Vista 1: asignadas y gestionadas por agente y kilometraje, más el texto por km */
  function gestionesPorAgenteKm(filas) {
    const kms = [...new Set(filas.map(f => f.km))].sort((a, b) => ordenKm(a) - ordenKm(b) || a.localeCompare(b));
    const agentes = ordenarAgentes([...new Set(filas.map(f => f.agente_panel))]);
    const celdas = {};
    agentes.forEach(a => { celdas[a] = { total: { asignadas: 0, gestionadas: 0 } }; kms.forEach(k => { celdas[a][k] = { asignadas: 0, gestionadas: 0 }; }); });
    filas.forEach(f => {
      const sumar = c => { c.asignadas++; if (f.oportunidad) c.gestionadas++; };
      sumar(celdas[f.agente_panel][f.km]);
      sumar(celdas[f.agente_panel].total);
    });
    const textos = kms.map(km => {
      const partes = agentes.filter(a => celdas[a][km].asignadas > 0).map(a => {
        const g = celdas[a][km].gestionadas;
        return g ? `${a} llamó a ${g}` : `${a} no llamó`;
      });
      return `${km} – ${partes.join(', ')}.`;
    });
    return { kms, agentes, celdas, textos };
  }

  /** Vista 2 y reporte semanal: ganadas, No aplica por motivo y el resto de los estados */
  function resultados(filas, palabras) {
    const r = { total: filas.length, gestionadas: 0, sinGestionar: 0, ganadas: 0, motivos: {}, sinClasificar: [], estados: {}, otros: {} };
    MOTIVOS.concat({ nombre: SIN_CLASIFICAR }).forEach(m => { r.motivos[m.nombre] = 0; });
    ['Ya lo hizo', 'Rechaza', 'Pendiente', 'No contesta'].forEach(e => { r.estados[e] = 0; });
    filas.forEach(f => {
      const o = f.oportunidad;
      if (!o) { r.sinGestionar++; return; }
      r.gestionadas++;
      if (o === 'Agendado') r.ganadas++;
      else if (o === 'No aplica') {
        const motivo = clasificarNoAplica(f.comentario, palabras);
        r.motivos[motivo]++;
        if (motivo === SIN_CLASIFICAR) r.sinClasificar.push(f);
      } else if (o in r.estados) r.estados[o]++;
      else r.otros[o] = (r.otros[o] || 0) + 1; // valor que no es uno de los estados conocidos
    });
    r.noAplica = Object.keys(r.motivos).reduce((s, k) => s + r.motivos[k], 0);
    return r;
  }

  /* ---------- CSV de salientes de 3CX ---------- */

  function parsearCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const filas = [];
    let fila = [], celda = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
        else celda += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === ',') { fila.push(celda); celda = ''; }
      else if (ch === '\n') { fila.push(celda.replace(/\r$/, '')); filas.push(fila); fila = []; celda = ''; }
      else celda += ch;
    }
    if (celda || fila.length) { fila.push(celda.replace(/\r$/, '')); filas.push(fila); }
    return filas;
  }

  function ultimos8(t) {
    const d = String(t || '').replace(/\D/g, '');
    return d.length >= 8 ? d.slice(-8) : '';
  }

  /**
   * Llamadas de uno o varios CSV: {interno, numero, atendida, fecha}.
   * Se ignoran la fila "Totals", las filas donde From es un número (desvíos) y las filas idénticas
   * (cuando se cargan archivos que se superponen). Un mismo Call ID puede tener varios tramos
   * (ej: uno no atendido y otro atendido): se conservan todos.
   */
  function llamadasDe3CX(textos) {
    const vistas = new Set();
    const llamadas = [];
    textos.forEach(texto => {
      const filas = parsearCSV(texto);
      const enc = (filas[0] || []).map(c => c.trim());
      const col = n => enc.indexOf(n);
      const cTime = col('Call Time'), cFrom = col('From'), cTo = col('To'), cStatus = col('Status');
      if (cFrom < 0 || cTo < 0 || cStatus < 0) throw new Error('El archivo no tiene las columnas del reporte de salientes (From, To, Status).');
      filas.slice(1).forEach(f => {
        const desde = (f[cFrom] || '').trim();
        const interno = (desde.match(/\((\d+)\)\s*$/) || [])[1];
        if (!interno) return; // Totals, vacías o desvíos (From es un número)
        const firma = JSON.stringify(f);
        if (vistas.has(firma)) return;
        vistas.add(firma);
        llamadas.push({
          interno,
          numero: ultimos8(f[cTo]),
          atendida: (f[cStatus] || '').trim().toLowerCase() === 'answered',
          fecha: (cTime >= 0 ? f[cTime] || '' : '').replace('T', ' ').slice(0, 19)
        });
      });
    });
    return llamadas;
  }

  /**
   * Cruce: por cada gestión, las llamadas del mismo agente (por interno) a alguno de sus teléfonos
   * dentro del período. Atendida / No atendida / Sin llamada.
   */
  function cruzar(gestiones, llamadas, desde, hasta) {
    const porInternoNumero = {};
    llamadas.forEach(l => {
      if (!l.numero || (l.fecha && (l.fecha < desde || l.fecha > hasta))) return;
      const k = l.interno + '|' + l.numero;
      (porInternoNumero[k] = porInternoNumero[k] || []).push(l);
    });
    const detalle = gestiones.map(g => {
      const numeros = [...new Set([ultimos8(g.telefono), ultimos8(g.telefono_alternativo)].filter(Boolean))];
      const encontradas = g.interno ? numeros.flatMap(n => porInternoNumero[g.interno + '|' + n] || []) : [];
      const resultado = !encontradas.length ? 'Sin llamada' : encontradas.some(l => l.atendida) ? 'Atendida' : 'No atendida';
      return Object.assign({}, g, { resultado });
    });

    const porAgente = {};
    detalle.forEach(d => {
      const a = porAgente[d.agente_panel] = porAgente[d.agente_panel] ||
        { agente: d.agente_panel, marcadas: 0, atendidas: 0, noAtendidas: 0, sinLlamada: 0, porKm: {}, sinRespaldo: [] };
      a.marcadas++;
      const k = a.porKm[d.km] = a.porKm[d.km] || { marcadas: 0, conLlamada: 0 };
      k.marcadas++;
      if (d.resultado === 'Sin llamada') { a.sinLlamada++; a.sinRespaldo.push(d); }
      else { k.conLlamada++; if (d.resultado === 'Atendida') a.atendidas++; else a.noAtendidas++; }
    });
    const agentes = ordenarAgentes(Object.keys(porAgente)).map(n => {
      const a = porAgente[n];
      a.conLlamada = a.atendidas + a.noAtendidas;
      return a;
    });

    // Resumen en texto simple, por agente y kilometraje
    const lineas = [];
    agentes.forEach(a => {
      Object.keys(a.porKm).sort((x, y) => ordenKm(x) - ordenKm(y)).forEach(km => {
        const k = a.porKm[km];
        const sin = k.marcadas - k.conLlamada;
        lineas.push(`${a.agente} marcó ${k.marcadas} ${k.marcadas === 1 ? 'gestión' : 'gestiones'} en ${km}; en 3CX aparecen llamadas a ${k.conLlamada} de esos números. ` +
          (sin ? `Hay ${sin} ${sin === 1 ? 'gestión' : 'gestiones'} sin respaldo.` : 'Todas tienen respaldo.'));
      });
    });
    return { detalle, agentes, texto: lineas.join('\n') };
  }

  return {
    ESTADOS, MOTIVOS, SIN_CLASIFICAR, SIN_MAPEAR,
    normalizar, clasificarNoAplica, ordenKm, mapearAgentes,
    gestionesPorAgenteKm, resultados, parsearCSV, ultimos8, llamadasDe3CX, cruzar
  };
})();

if (typeof module !== 'undefined') module.exports = CampaniasLogica;
