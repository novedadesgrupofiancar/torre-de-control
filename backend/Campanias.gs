/**
 * Sección 2 – Campañas.
 * Lee las planillas del mes (archivos .xlsx en Drive) convirtiéndolas a una copia temporal
 * con el servicio avanzado de Drive, que se borra al terminar.
 * Guarda la foto semanal (viernes 17:30) y el resultado de los cruces con 3CX.
 */

// Estructura de cada planilla (las columnas se ubican siempre por nombre de encabezado)
const PLANILLAS_CAMPANIA = {
  Chevrolet: { campoLink: 'link_chevrolet', filaEncabezado: 1, ignorarHojas: ['resumen'], cliente: ['nombre'], id: ['vin', 'documento'] },
  Marcas: { campoLink: 'link_marcas', filaEncabezado: 3, ignorarHojas: [], cliente: ['cliente'], id: ['matrícula', 'matricula'] }
};

const ESTADOS_OPORTUNIDAD = ['Agendado', 'Ya lo hizo', 'Rechaza', 'Pendiente', 'No contesta', 'No aplica'];

/**
 * Lee las dos planillas del mes y marca qué filas cambiaron desde la foto de referencia
 * (la última foto del mes tomada antes de hoy).
 */
function leerCampania(mes) {
  mes = texto_(mes, 7);
  const campania = obtenerConfiguracion().campanias.filter(c => c.mes === mes)[0];
  if (!campania) throw new Error('No hay links de campañas cargados para ' + mes + '.');
  const filas = leerPlanillasCampania_(campania);

  const referencia = fotoReferencia_(mes);
  filas.forEach(f => {
    const anterior = referencia.estados[f.clave];
    f.oportunidad_foto = anterior === undefined ? '' : anterior;
    f.cambio = f.oportunidad !== f.oportunidad_foto;
  });
  return {
    mes: mes,
    filas: filas,
    referencia: { fecha: referencia.fecha, registrado_en: referencia.registrado_en },
    leido_en: ahora_()
  };
}

function leerPlanillasCampania_(campania) {
  const filas = [];
  Object.keys(PLANILLAS_CAMPANIA).forEach(origen => {
    const def = PLANILLAS_CAMPANIA[origen];
    const link = campania[def.campoLink];
    if (!link) return;
    leerXlsxComoTabla_(idDeLink_(link), (hoja, valores) => {
      if (def.ignorarHojas.indexOf(hoja.toLowerCase()) >= 0) return;
      filas.push.apply(filas, filasDeHoja_(origen, def, hoja, valores));
    });
  });
  return filas;
}

/** Convierte las filas de una hoja en gestiones, ubicando columnas por encabezado */
function filasDeHoja_(origen, def, hoja, valores) {
  if (valores.length < def.filaEncabezado) return [];
  const encabezado = valores[def.filaEncabezado - 1].map(c => normalizarTexto_(c));
  const col = nombres => {
    for (let n = 0; n < nombres.length; n++) {
      const i = encabezado.indexOf(normalizarTexto_(nombres[n]));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cAgente = col(['agente']);
  const cOportunidad = col(['oportunidad']);
  const cTaller = col(['taller']);
  if (cAgente < 0 || cOportunidad < 0) return [];
  const cTel = col(['teléfono', 'telefono']);
  const cTelAlt = col(['teléfono alternativo', 'telefono alternativo']);
  const cKm = origen === 'Marcas' ? col(['próximo service', 'proximo service', 'service a ofrecer']) : -1;
  const cCliente = col(def.cliente);
  const cId = col(def.id);
  // Comentario del agente: la columna sin título inmediatamente después de "Taller"
  const cComentario = cTaller >= 0 && !encabezado[cTaller + 1] ? cTaller + 1 : -1;
  const celda = (fila, c) => (c >= 0 && c < fila.length ? aTexto_(fila[c]).trim() : '');

  const resultado = [];
  for (let i = def.filaEncabezado; i < valores.length; i++) {
    const fila = valores[i];
    if (!fila.some(v => aTexto_(v).trim() !== '')) continue;
    const agente = celda(fila, cAgente);
    const idFila = celda(fila, cId) || 'fila ' + (i + 1);
    resultado.push({
      clave: origen + '|' + hoja + '|' + idFila,
      origen: origen,
      hoja: hoja,
      km: normalizarKm_(origen === 'Chevrolet' ? hoja : celda(fila, cKm)),
      agente: agente,
      oportunidad: normalizarOportunidad_(celda(fila, cOportunidad)),
      comentario: celda(fila, cComentario),
      taller: celda(fila, cTaller),
      cliente: celda(fila, cCliente),
      telefono: celda(fila, cTel),
      telefono_alternativo: celda(fila, cTelAlt)
    });
  }
  return resultado;
}

/**
 * Convierte el .xlsx a una planilla temporal de Google (servicio avanzado de Drive),
 * entrega los valores de cada hoja y borra la copia.
 */
function leerXlsxComoTabla_(idArchivo, alLeerHoja) {
  const copia = Drive.Files.copy(
    { name: 'Torre de control – temporal', mimeType: MimeType.GOOGLE_SHEETS },
    idArchivo
  );
  try {
    SpreadsheetApp.openById(copia.id).getSheets().forEach(hoja => {
      alLeerHoja(hoja.getName(), hoja.getDataRange().getValues());
    });
  } finally {
    Drive.Files.remove(copia.id);
  }
}

function idDeLink_(link) {
  const m = String(link).match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(link).match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (!m) throw new Error('El link de campaña no es un link de Drive válido.');
  return m[1];
}

function normalizarTexto_(v) {
  return aTexto_(v).trim().toLowerCase();
}

/** "NO CONTESTA" → "No contesta"; un valor desconocido queda tal cual */
function normalizarOportunidad_(v) {
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const sinAcento = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const igual = ESTADOS_OPORTUNIDAD.filter(e => sinAcento(e) === sinAcento(t))[0];
  return igual || t;
}

/** "50K", "50 K", "50.000" → "50K"; conserva el "+" de "70K+" */
function normalizarKm_(v) {
  const t = aTexto_(v).trim();
  const conK = t.match(/^(\d+)\s*k(\+?)$/i);
  if (conK) return conK[1] + 'K' + conK[2];
  const numero = Number(t.replace(/[.,\s]/g, ''));
  if (numero >= 1000) return Math.round(numero / 1000) + 'K';
  return t;
}

/* ---------- Foto semanal ---------- */

/** La ejecuta el activador de los viernes a las 17:30 */
function tomarFotoCampanias() {
  inicializarBase_();
  const mes = hoy_().slice(0, 7);
  const campania = obtenerConfiguracion().campanias.filter(c => c.mes === mes)[0];
  if (!campania) return;
  const fotoId = nuevoId_();
  const ahora = ahora_();
  const filas = leerPlanillasCampania_(campania).map(f => ({
    id: nuevoId_(), registrado_en: ahora, foto_id: fotoId, fecha_foto: ahora.slice(0, 10), mes: mes,
    origen: f.origen, hoja: f.hoja, km: f.km, agente: f.agente, clave: f.clave, oportunidad: f.oportunidad
  }));
  agregarFilas_('fotos_campañas', filas);
}

/** Crea el activador semanal (viernes 17:30, hora de Montevideo). Se ejecuta una vez desde el editor. */
function instalarActivadorFoto() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'tomarFotoCampanias')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tomarFotoCampanias')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(17)
    .nearMinute(30)
    .inTimezone(ZONA)
    .create();
}

/** Última foto del mes tomada antes de hoy: {fecha, registrado_en, estados: {clave: oportunidad}} */
function fotoReferencia_(mes) {
  const hoy = hoy_();
  const fotos = leerFilas_('fotos_campañas').filter(f => f.mes === mes && f.fecha_foto < hoy);
  if (!fotos.length) return { fecha: '', registrado_en: '', estados: {} };
  const ultima = fotos.reduce((a, b) => (b.registrado_en > a.registrado_en ? b : a));
  const estados = {};
  fotos.filter(f => f.foto_id === ultima.foto_id).forEach(f => { estados[f.clave] = f.oportunidad; });
  return { fecha: ultima.fecha_foto, registrado_en: ultima.registrado_en, estados: estados };
}

/* ---------- Cruce con 3CX ---------- */

const RESULTADOS_CRUCE = ['Atendida', 'No atendida', 'Sin llamada'];

/** Guarda el resultado procesado del cruce (una fila por gestión), identificado por semana */
function guardarCruce3CX(d) {
  const mes = texto_(d.mes, 7);
  const desde = texto_(d.desde, 19);
  const hasta = texto_(d.hasta, 19);
  if (!/^\d{4}-\d{2}$/.test(mes) || !desde || !hasta) throw new Error('Faltan datos del período del cruce.');
  const cruceId = nuevoId_();
  const ahora = ahora_();
  const filas = (d.filas || []).map(f => ({
    id: nuevoId_(), registrado_en: ahora, cruce_id: cruceId, mes: mes, desde: desde, hasta: hasta,
    agente: texto_(f.agente, 100), origen: texto_(f.origen, 20), hoja: texto_(f.hoja, 60), km: texto_(f.km, 10),
    cliente: texto_(f.cliente, 200), telefono: texto_(f.telefono, 40), oportunidad: texto_(f.oportunidad, 40),
    resultado: enLista_(f.resultado, RESULTADOS_CRUCE, 'resultado del cruce')
  }));
  if (!filas.length) throw new Error('No hay gestiones para guardar.');
  agregarFilas_('cruces_3cx', filas);
  return { cruce_id: cruceId, filas: filas.length };
}
