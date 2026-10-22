/**
 * Sección 8 – Recordatorios: reuniones de Google Calendar,
 * recordatorio mensual "Preparar devoluciones" y check diario.
 */

// Días hacia adelante que se muestran además de hoy
const DIAS_REUNIONES = 7;
// Días hábiles que se muestran en el historial del check
const DIAS_HISTORIAL_CHECK = 20;

function obtenerRecordatorios() {
  const hoy = hoy_();
  const respuesta = { hoy: hoy, devoluciones: rangoDevoluciones_(hoy), reuniones: [], errorCalendario: '' };
  try {
    respuesta.reuniones = obtenerReuniones_(hoy);
  } catch (e) {
    respuesta.errorCalendario = 'No se pudo leer Google Calendar: ' + e.message;
  }
  return respuesta;
}

/** Reuniones del calendario principal de la cuenta, de hoy a DIAS_REUNIONES días */
function obtenerReuniones_(hoy) {
  const inicio = Utilities.parseDate(hoy, ZONA, 'yyyy-MM-dd');
  const fin = Utilities.parseDate(sumarDias_(hoy, DIAS_REUNIONES + 1), ZONA, 'yyyy-MM-dd');
  const formato = (fecha, patron) => Utilities.formatDate(fecha, ZONA, patron);
  return CalendarApp.getDefaultCalendar().getEvents(inicio, fin).map(ev => {
    const todoElDia = ev.isAllDayEvent();
    let fecha = formato(todoElDia ? ev.getAllDayStartDate() : ev.getStartTime(), 'yyyy-MM-dd');
    if (fecha < hoy) fecha = hoy; // eventos de varios días que empezaron antes
    return {
      fecha: fecha,
      todo_el_dia: todoElDia,
      inicio: todoElDia ? '' : formato(ev.getStartTime(), 'HH:mm'),
      fin: todoElDia ? '' : formato(ev.getEndTime(), 'HH:mm'),
      titulo: ev.getTitle() || '(sin título)',
      participantes: ev.getGuestList().map(g => g.getName() || g.getEmail())
    };
  }).sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));
}

/** Última semana del mes: desde el lunes de la semana que contiene el último día del mes */
function rangoDevoluciones_(hoy) {
  const partes = hoy.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(partes[0], partes[1], 0)).toISOString().slice(0, 10);
  const desde = lunesDe_(ultimoDia);
  return { desde: desde, hasta: ultimoDia, activo: hoy >= desde && hoy <= ultimoDia };
}

/* ---------- Check diario ---------- */

function marcarCheckDiario() {
  const hoy = hoy_();
  const yaMarcado = leerFilas_('check_diario').some(f => f.fecha === hoy);
  if (!yaMarcado) agregarFilas_('check_diario', [{ id: nuevoId_(), registrado_en: ahora_(), fecha: hoy }]);
  return obtenerCheckDiario();
}

/**
 * Estado del check: si hoy está marcado, racha de días hábiles (lunes a viernes)
 * consecutivos e historial de días marcados y no marcados.
 */
function obtenerCheckDiario() {
  const hoy = hoy_();
  const marcas = {};
  leerFilas_('check_diario').forEach(f => { if (!marcas[f.fecha]) marcas[f.fecha] = f.registrado_en; });
  const esHabil = iso => diaSemana_(iso) !== 0 && diaSemana_(iso) !== 6;

  // Hoy todavía no cortó la racha si no se marcó: se empieza a contar desde ayer
  let dia = marcas[hoy] ? hoy : sumarDias_(hoy, -1);
  let racha = 0;
  for (;;) {
    if (!esHabil(dia)) { dia = sumarDias_(dia, -1); continue; }
    if (!marcas[dia]) break;
    racha++;
    dia = sumarDias_(dia, -1);
  }

  const historial = [];
  dia = hoy;
  while (historial.length < DIAS_HISTORIAL_CHECK) {
    if (esHabil(dia)) historial.push({ fecha: dia, marcado_en: marcas[dia] || '' });
    dia = sumarDias_(dia, -1);
  }

  return { hoy: hoy, marcado_hoy: marcas[hoy] || '', racha: racha, historial: historial };
}
