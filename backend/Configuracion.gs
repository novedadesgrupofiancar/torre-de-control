/**
 * Configuración: agentes, horarios y descansos, links de campañas,
 * listas editables, palabras clave de No aplica y destinatarios.
 * Cada vez que se guarda un bloque se agrega una fila nueva en la hoja "configuración";
 * vale la última fila de cada clave, así queda el historial de cambios.
 */

function configInicial_() {
  return {
    // {id, nombre, interno, activo}
    agentes: [],
    // {idAgente: {entrada, salida, tolerancia (minutos), descansos: [{desde, hasta}]}}
    horarios: {},
    // {mes: 'aaaa-mm', link_chevrolet, link_marcas}
    campanias: [],
    listas: {
      motivos: ['Enfermedad'],
      talleres: [],
      redes: ['Geely', 'JAC Auto', 'JAC Camión', 'Lynk & Co', 'Shopping de Autos', 'Chevrolet', 'Fiat', 'Vehículos Fiancar'],
      turnos: ['Mañana'],
      lineas_whatsapp: ['Marcas', 'Chevrolet', 'Bot', 'Línea Oficial'],
      escalado: ['IT Fiancar', 'CRM', '3CX', 'Xtaller', 'Otro']
    },
    // Palabras clave para clasificar los "No aplica" de campañas (se usan en la Sección 2)
    palabras_clave: {
      canepas: ['canepa'],
      venta: ['vend', 'no tiene mas', 'no tiene más', 'ya no la tiene', 'ya no lo tiene', 'lo tiene el hijo'],
      ya_vino: ['ya lo hizo', 'ya lo realiz', 'ya realiz', 'hizo', 'falta', 'km', 'mil']
    },
    destinatarios: { jimena: '', rrhh: '' }
  };
}

function obtenerConfiguracion() {
  const conf = configInicial_();
  leerFilas_(HOJA_CONFIG).forEach(fila => {
    if (!(fila.clave in conf)) return;
    let valor;
    try { valor = JSON.parse(fila.valor); } catch (e) { return; }
    // En los bloques tipo objeto se completan las claves nuevas con los valores iniciales
    if (Array.isArray(conf[fila.clave])) conf[fila.clave] = valor;
    else conf[fila.clave] = Object.assign(configInicial_()[fila.clave], valor);
  });
  return conf;
}

/** Guarda un bloque de configuración y devuelve la configuración completa */
function guardarConfiguracion(clave, valor) {
  const normalizadores = {
    agentes: normalizarAgentes_,
    horarios: normalizarHorarios_,
    campanias: normalizarCampanias_,
    listas: v => normalizarListas_(v, Object.keys(configInicial_().listas)),
    palabras_clave: v => normalizarListas_(v, Object.keys(configInicial_().palabras_clave)),
    destinatarios: normalizarDestinatarios_
  };
  if (!normalizadores[clave]) throw new Error('Bloque de configuración desconocido.');
  const limpio = normalizadores[clave](valor);
  agregarFilas_(HOJA_CONFIG, [{ clave: clave, valor: JSON.stringify(limpio), registrado_en: ahora_() }]);
  return obtenerConfiguracion();
}

function normalizarAgentes_(lista) {
  if (!Array.isArray(lista)) throw new Error('Formato de agentes inválido.');
  const nombres = {}, internos = {};
  return lista.map(a => {
    const agente = {
      id: texto_(a.id, 60) || nuevoId_(),
      nombre: requerido_(texto_(a.nombre, 100), 'nombre del agente'),
      interno: texto_(a.interno, 10),
      activo: a.activo !== false
    };
    if (agente.interno && !/^\d+$/.test(agente.interno)) throw new Error('El interno de ' + agente.nombre + ' debe ser un número.');
    const clave = agente.nombre.toLowerCase();
    if (nombres[clave]) throw new Error('Hay dos agentes llamados ' + agente.nombre + '.');
    if (agente.interno && internos[agente.interno]) throw new Error('El interno ' + agente.interno + ' está repetido.');
    nombres[clave] = true;
    if (agente.interno) internos[agente.interno] = true;
    return agente;
  });
}

function normalizarHorarios_(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Formato de horarios inválido.');
  const hora = (v, campo) => (texto_(v, 5) ? horaHHMM_(v, campo) : '');
  const limpio = {};
  Object.keys(obj).forEach(id => {
    const h = obj[id] || {};
    limpio[id] = {
      entrada: hora(h.entrada, 'entrada'),
      salida: hora(h.salida, 'salida'),
      tolerancia: tolerancia_(h.tolerancia),
      descansos: (h.descansos || [])
        .filter(d => texto_(d.desde) || texto_(d.hasta))
        .map(d => {
          const desde = horaHHMM_(d.desde, 'inicio del descanso');
          const hasta = horaHHMM_(d.hasta, 'fin del descanso');
          if (hasta <= desde) throw new Error('Un descanso termina antes de empezar (' + desde + ' – ' + hasta + ').');
          return { desde: desde, hasta: hasta };
        })
    };
  });
  return limpio;
}

/** Minutos desde los que un corte entre sesiones cuenta como desconexión (vacío = valor por defecto) */
function tolerancia_(v) {
  const t = texto_(v, 4);
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 240) throw new Error('La tolerancia debe ser un número de minutos entre 0 y 240.');
  return n;
}

function normalizarCampanias_(lista) {
  if (!Array.isArray(lista)) throw new Error('Formato de campañas inválido.');
  const meses = {};
  return lista.map(c => {
    const mes = texto_(c.mes, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Falta el mes en un link de campañas.');
    if (meses[mes]) throw new Error('El mes ' + mes + ' está repetido.');
    meses[mes] = true;
    return { mes: mes, link_chevrolet: texto_(c.link_chevrolet, 500), link_marcas: texto_(c.link_marcas, 500) };
  }).sort((a, b) => b.mes.localeCompare(a.mes));
}

function normalizarListas_(obj, claves) {
  if (!obj || typeof obj !== 'object') throw new Error('Formato de listas inválido.');
  const limpio = {};
  claves.forEach(clave => {
    const vistos = {};
    limpio[clave] = (obj[clave] || []).map(v => texto_(v, 200)).filter(v => {
      if (!v || vistos[v.toLowerCase()]) return false;
      vistos[v.toLowerCase()] = true;
      return true;
    });
  });
  return limpio;
}

function normalizarDestinatarios_(obj) {
  obj = obj || {};
  const mail = (v, quien) => {
    v = texto_(v, 300);
    v.split(',').map(s => s.trim()).filter(String).forEach(m => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) throw new Error('El mail de ' + quien + ' no es válido: ' + m);
    });
    return v;
  };
  return { jimena: mail(obj.jimena, 'Jimena'), rrhh: mail(obj.rrhh, 'RRHH') };
}
