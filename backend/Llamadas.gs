/**
 * Sección 1 – Llamadas y conexión.
 * Los CSV de 3CX se procesan en el navegador; acá se guarda el resultado de cada carga
 * (una fila por agente más una fila "Equipo"), con su período y la semana.
 */

const AGENTE_EQUIPO = 'Equipo';

function guardarCargaLlamadas(d) {
  const desde = fechaISO_(d.desde, 'desde');
  const hasta = fechaISO_(d.hasta, 'hasta');
  if (hasta < desde) throw new Error('El período de la carga es inválido.');
  const agentes = d.agentes || [];
  if (!agentes.length) throw new Error('No hay resultados de agentes para guardar.');
  const cargaId = nuevoId_();
  const ahora = ahora_();
  const fila = r => ({
    id: nuevoId_(), registrado_en: ahora, carga_id: cargaId, desde: desde, hasta: hasta, semana: lunesDe_(desde),
    agente: texto_(r.agente, 100), interno: texto_(r.interno, 10),
    pct_atendidas: numero_(r.pct_atendidas), atendidas: numero_(r.atendidas), ofrecidas: numero_(r.ofrecidas),
    detalle_colas: JSON.stringify(r.detalle_colas || []),
    desconexiones: numero_(r.desconexiones), minutos_desconectado: numero_(r.minutos_desconectado),
    sesiones_sin_cerrar: JSON.stringify(r.sesiones_sin_cerrar || []),
    resumen: texto_(r.resumen)
  });
  const filas = agentes.map(fila);
  if (d.equipo) filas.push(fila(Object.assign({}, d.equipo, { agente: AGENTE_EQUIPO, interno: '' })));
  agregarFilas_('llamadas', filas);
  guardarFirma_(d.claveFirma, d.firma);
  return { carga_id: cargaId, filas: filas.length };
}

/** Cargas guardadas, de la más reciente a la más vieja */
function listarCargasLlamadas() {
  const cargas = {};
  leerFilas_('llamadas').forEach(f => {
    const c = cargas[f.carga_id] = cargas[f.carga_id] ||
      { carga_id: f.carga_id, registrado_en: f.registrado_en, desde: f.desde, hasta: f.hasta, semana: f.semana, agentes: [], equipo: null };
    const r = {
      agente: f.agente, interno: f.interno,
      pct_atendidas: Number(f.pct_atendidas), atendidas: Number(f.atendidas), ofrecidas: Number(f.ofrecidas),
      detalle_colas: jsonSeguro_(f.detalle_colas), desconexiones: Number(f.desconexiones),
      minutos_desconectado: Number(f.minutos_desconectado), sesiones_sin_cerrar: jsonSeguro_(f.sesiones_sin_cerrar),
      resumen: f.resumen
    };
    if (f.agente === AGENTE_EQUIPO) c.equipo = r;
    else c.agentes.push(r);
  });
  return Object.keys(cargas).map(k => cargas[k]).sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
}

function numero_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function jsonSeguro_(t) {
  try { return JSON.parse(t || '[]'); } catch (e) { return []; }
}
