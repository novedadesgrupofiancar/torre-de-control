/* ===== Sección 1 – Llamadas y conexión ===== */
Modulos.Llamadas = (() => {
  const L = LlamadasLogica;
  let vista, resultado = null, agenteLinea = '', origen = '';

  /** La semana va de lunes a domingo: el fin de semana se lee para detectar sesiones sin cerrar */
  function semanaDe(fecha) {
    const lunes = lunesDe(fecha);
    return { lunes, domingo: sumarDias(lunes, 6), claveFirma: 'llamadas|' + lunes };
  }

  async function render(v, s) {
    vista = v;
    v.innerHTML = banners([{ tipo: 'naranja', html: 'Sacar reportes de llamada los viernes' }]) + encabezado(s) + `
      <section class="tarjeta">
        <div><h2>Reportes recibidos por mail</h2>
          <p class="nota">Los reportes diarios de 3CX llegan a la cuenta del panel y se leen solos al abrir esta sección.</p></div>
        <div class="acciones" style="justify-content:flex-start">
          <div style="min-width:200px">${campo('Semana que incluye el día', `<input type="date" id="ll-fecha" value="${sumarDias(hoyISO(), -1)}">`)}</div>
          <div class="crece"></div>
          <button type="button" class="btn btn-sec" id="ll-actualizar">Actualizar</button>
        </div>
        <div id="ll-estado-mail" class="lista"><div class="cargando">Leyendo los mails…</div></div>
      </section>
      <div id="ll-resultado" class="vista"></div>
      <section class="tarjeta">
        <div><h2>Carga manual</h2>
          <p class="nota">Solo si hace falta: elegí los 2 CSV (% de llamadas atendidas e historial de conexión). Pueden ser de un día, una semana o un mes.</p></div>
        <label class="zona-pegar zona-archivo">
          <input type="file" id="ll-csv" accept=".csv,text/csv" multiple hidden>
          Elegí los dos archivos .csv
        </label>
      </section>
      <section class="tarjeta">
        <h2>Historial de cargas</h2>
        <div id="ll-historial"><div class="cargando">Cargando…</div></div>
      </section>`;
    v.querySelector('#ll-csv').addEventListener('change', e => procesarArchivos(e.target.files));
    v.querySelector('#ll-actualizar').addEventListener('click', cargarDesdeMail);
    v.querySelector('#ll-fecha').addEventListener('change', cargarDesdeMail);
    cargarHistorial();
    await cargarDesdeMail();
  }

  /** Pide al backend los reportes de la semana (lee los mails nuevos) y los procesa */
  async function obtenerSemana(fecha) {
    const sem = semanaDe(fecha);
    const r = await api('reportes3CXDelPeriodo', { desde: sem.lunes, hasta: sem.domingo, tipos: ['atendidas', 'conexion'], claveFirma: sem.claveFirma });
    const atendidas = r.archivos.filter(a => a.tipo === 'atendidas');
    const conexion = r.archivos.filter(a => a.tipo === 'conexion');
    let procesado = null;
    if (atendidas.length && conexion.length) {
      const conInterno = Estado.config.agentes.filter(a => a.interno);
      procesado = L.procesar(atendidas.map(a => a.texto).join('\n'), conexion.map(a => a.texto).join('\n'), conInterno, Estado.config.horarios);
      if (!procesado.agentes.length) procesado = null;
    }
    const firma = r.archivos.map(a => a.id).sort().join(',');
    return { sem, r, atendidas, conexion, procesado, firma, yaGuardado: !!firma && firma === r.firma_guardada };
  }

  /** Lo usa el resumen para Jimena: deja guardada la semana si llegaron reportes nuevos */
  async function asegurarCargaSemana(fecha) {
    const s = await obtenerSemana(fecha);
    if (s.procesado && !s.yaGuardado) await guardarResultado(s.procesado, s.sem.claveFirma, s.firma);
  }

  async function cargarDesdeMail() {
    const caja = vista.querySelector('#ll-estado-mail');
    const boton = vista.querySelector('#ll-actualizar');
    const fecha = vista.querySelector('#ll-fecha').value || sumarDias(hoyISO(), -1);
    caja.innerHTML = '<div class="cargando">Leyendo los mails…</div>';
    boton.disabled = true;
    let s;
    try {
      s = await obtenerSemana(fecha);
    } catch (e) {
      caja.innerHTML = `<p class="pildoras"><span class="pildora pildora-ambar">Error</span><span>${esc(e.message)}</span></p>`;
      return;
    } finally {
      boton.disabled = false;
    }
    if (!vista.isConnected) return;
    const nombres = { atendidas: '% de llamadas atendidas', conexion: 'Conexión de agentes', salientes: 'Salientes por día' };
    const e = s.r.estado;
    caja.innerHTML = `
      ${s.r.error ? `<p class="pildoras"><span class="pildora pildora-ambar">Error</span><span>${esc(s.r.error)}</span></p>` : ''}
      <p class="nota mono">Última lectura del mail: ${e.ultima_lectura ? fmtFechaHora(e.ultima_lectura) : 'nunca'}</p>
      <div class="pildoras">${e.ultimo_por_tipo.map(u => u.fecha_mail
        ? `<span class="pildora pildora-verde">${esc(nombres[u.tipo])}: último recibido ${fmtFechaHora(u.fecha_mail)} (datos del ${fmtFecha(u.fecha_datos)})</span>`
        : `<span class="pildora pildora-ambar">${esc(nombres[u.tipo])}: todavía no llegó ningún mail</span>`).join('')}</div>
      <p class="nota">Semana del ${fmtFecha(s.sem.lunes)} al ${fmtFecha(s.sem.domingo)}: ${s.atendidas.length} ${s.atendidas.length === 1 ? 'día' : 'días'} de % atendidas y ${s.conexion.length} de conexión.</p>`;

    if (!s.procesado) {
      if (origen !== 'manual') {
        resultado = null;
        vista.querySelector('#ll-resultado').innerHTML = `<section class="tarjeta">${vacioHtml('Todavía no hay reportes de los dos tipos para esta semana.')}</section>`;
      }
      return;
    }
    resultado = s.procesado;
    origen = 'mail';
    agenteLinea = resultado.agentes[0].interno;
    pintarResultado();
    if (!s.yaGuardado) {
      try {
        await guardarResultado(resultado, s.sem.claveFirma, s.firma);
        aviso('Semana actualizada con los reportes recibidos.');
        cargarHistorial();
      } catch (err) {
        aviso('No se pudo guardar la semana: ' + err.message, 'error');
      }
    }
  }

  async function procesarArchivos(archivos) {
    if (!archivos.length) return;
    const textos = {};
    try {
      for (const a of archivos) {
        const texto = await a.text();
        const tipo = L.tipoDeReporte(texto);
        if (!tipo) throw new Error(`"${a.name}" no es ninguno de los dos reportes de 3CX.`);
        textos[tipo] = texto;
      }
      if (!textos.atendidas) throw new Error('Falta el reporte de % de llamadas atendidas.');
      if (!textos.conexion) throw new Error('Falta el historial de conexión (agent_login_history).');
      const conInterno = Estado.config.agentes.filter(a => a.interno);
      if (!conInterno.length) throw new Error('No hay agentes con interno 3CX en Configuración.');
      resultado = L.procesar(textos.atendidas, textos.conexion, conInterno, Estado.config.horarios);
      if (!resultado.agentes.length) throw new Error('Ningún interno de los reportes está cargado en Configuración.');
    } catch (e) {
      aviso(e.message, 'error');
      return;
    }
    origen = 'manual';
    agenteLinea = resultado.agentes[0].interno;
    pintarResultado();
    try {
      await guardarResultado(resultado);
      aviso('Carga guardada en la base.');
      cargarHistorial();
    } catch (e) {
      aviso('No se pudo guardar la carga: ' + e.message, 'error');
    }
  }

  /** Guarda el resultado procesado en la base (con firma, para no repetir la misma semana) */
  async function guardarResultado(r, claveFirma, firma) {
    const pct = p => (p === null || p === undefined ? '' : Math.round(p * 1000) / 10);
    const filaAgente = a => ({
      agente: a.agente, interno: a.interno,
      pct_atendidas: a.atendidas ? pct(a.atendidas.pct) : '',
      atendidas: a.atendidas ? a.atendidas.atendidas : 0,
      ofrecidas: a.atendidas ? a.atendidas.ofrecidas : 0,
      detalle_colas: a.atendidas ? a.atendidas.colas.map(c => ({ cola: c.cola, atendidas: c.atendidas, ofrecidas: c.ofrecidas, pct: pct(c.pct) })) : [],
      desconexiones: a.conexion ? a.conexion.desconexiones : 0,
      minutos_desconectado: a.conexion ? a.conexion.minutos : 0,
      sesiones_sin_cerrar: a.conexion ? a.conexion.sinCerrar : [],
      resumen: a.resumen
    });
    await api('guardarCargaLlamadas', {
      desde: r.desde, hasta: r.hasta, claveFirma, firma,
      agentes: r.agentes.map(filaAgente),
      equipo: {
        pct_atendidas: pct(r.equipo.pct), atendidas: r.equipo.atendidas, ofrecidas: r.equipo.ofrecidas,
        desconexiones: r.equipo.desconexiones, minutos_desconectado: r.equipo.minutos,
        sesiones_sin_cerrar: [], resumen: r.equipo.resumen
      }
    });
  }

  function pintarResultado() {
    const r = resultado;
    const cont = vista.querySelector('#ll-resultado');
    const colas = [...new Set(r.agentes.flatMap(a => a.atendidas ? a.atendidas.colas.map(c => c.cola) : []))];
    const conAlerta = r.agentes.filter(a => a.conexion && a.conexion.sinCerrar.length);

    cont.innerHTML = `
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2>Por agente</h2>
          <span class="pildora pildora-azul">Del ${fmtFecha(r.desde)} al ${fmtFecha(r.hasta)}</span>
        </div>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Agente</th><th>% atendidas</th><th class="num">Atendidas / ofrecidas</th>
            <th class="num">Desconexiones</th><th class="num">Min desconectado</th><th class="num">Sesiones sin cerrar</th></tr></thead>
          <tbody>${r.agentes.map(a => `<tr>
            <td><strong>${esc(a.agente)}</strong></td>
            <td style="min-width:150px"><span class="mono">${L.pctTexto(a.atendidas && a.atendidas.pct)}</span>
              ${a.atendidas && a.atendidas.pct !== null ? barra(a.atendidas.pct * 100) : ''}</td>
            <td class="num">${a.atendidas ? `${a.atendidas.atendidas} / ${a.atendidas.ofrecidas}` : '—'}</td>
            <td class="num">${a.conexion ? a.conexion.desconexiones : '—'}</td>
            <td class="num">${a.conexion ? a.conexion.minutos : '—'}</td>
            <td class="num">${a.conexion && a.conexion.sinCerrar.length ? `<span class="pildora pildora-ambar">${a.conexion.sinCerrar.length}</span>` : '<span class="pildora pildora-verde">0</span>'}</td>
          </tr>`).join('')}
          <tr class="fila-total">
            <td><strong>Equipo</strong></td>
            <td><span class="mono">${L.pctTexto(r.equipo.pct)}</span>${r.equipo.pct !== null ? barra(r.equipo.pct * 100, 'verde') : ''}</td>
            <td class="num">${r.equipo.atendidas} / ${r.equipo.ofrecidas}</td>
            <td class="num">${r.equipo.desconexiones}</td>
            <td class="num">${r.equipo.minutos}</td>
            <td class="num">${r.equipo.sinCerrar}</td>
          </tr></tbody>
        </table></div>
        <details class="detalle-colas">
          <summary>Detalle por cola</summary>
          <div class="tabla-envoltura"><table class="tabla">
            <thead><tr><th>Agente</th>${colas.map(c => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${r.agentes.map(a => `<tr><td>${esc(a.agente)}</td>${colas.map(c => {
              const q = a.atendidas && a.atendidas.colas.find(x => x.cola === c);
              return `<td class="num">${q ? `${L.pctTexto(q.pct)}<span class="de"> ${q.atendidas}/${q.ofrecidas}</span>` : '—'}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
          </table></div>
        </details>
      </section>
      ${conAlerta.length ? `<section class="tarjeta">
        <h2>Sesiones sin cerrar</h2>
        <p class="nota">Sesiones que arrancan a las 00:00, terminan a las 24:00 o están en fin de semana: el agente quedó logueado sin estar. Afectan el % de atendidas.</p>
        ${conAlerta.map(a => `<div class="banner banner-ambar alerta-agente">
          ${esc(a.agente)}: ${a.conexion.sinCerrar.length} ${a.conexion.sinCerrar.length === 1 ? 'sesión' : 'sesiones'} sin cerrar${a.conexion.noches ? ` · ${a.conexion.noches} ${a.conexion.noches === 1 ? 'noche' : 'noches'} con la sesión abierta` : ''}
          <small>${a.conexion.sinCerrar.slice().sort((x, y) => x.dia.localeCompare(y.dia)).map(x => `${fmtFecha(x.dia)} ${x.inicio}–${x.fin} (${esc(x.motivo)})`).join(' · ')}</small>
        </div>`).join('')}
      </section>` : ''}
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2>Línea de tiempo</h2>
          <div class="segmento" id="ll-agentes">${r.agentes.filter(a => a.conexion).map(a =>
            `<button type="button" data-interno="${esc(a.interno)}" class="${a.interno === agenteLinea ? 'activo' : ''}">${esc(a.agente)}</button>`).join('')}</div>
        </div>
        <div class="leyenda">
          <span><i class="ley ley-conectado"></i>Conectado</span>
          <span><i class="ley ley-descanso"></i>Descanso configurado</span>
          <span><i class="ley ley-desconexion"></i>Desconexión fuera del descanso</span>
        </div>
        <div id="ll-linea"></div>
      </section>
      <section class="tarjeta">
        <h2>Resumen</h2>
        <pre class="vista-previa">${esc([r.equipo.resumen, ''].concat(r.agentes.map(a => a.resumen)).join('\n'))}</pre>
      </section>`;

    cont.querySelector('#ll-agentes').addEventListener('click', e => {
      const b = e.target.closest('[data-interno]');
      if (!b) return;
      agenteLinea = b.dataset.interno;
      cont.querySelectorAll('#ll-agentes button').forEach(x => x.classList.toggle('activo', x === b));
      pintarLinea();
    });
    pintarLinea();
  }

  /** Una barra por día hábil del agente elegido */
  function pintarLinea() {
    const a = resultado.agentes.find(x => x.interno === agenteLinea);
    const salida = vista.querySelector('#ll-linea');
    if (!a || !a.conexion) { salida.innerHTML = vacioHtml('Sin datos de conexión.'); return; }
    const c = a.conexion;
    const dias = Object.keys(c.dias).sort();
    // Escala: de la hora más temprana a la más tardía (sesiones y descansos), en horas enteras
    const minimos = dias.flatMap(d => c.dias[d].sesiones.map(s => s.ini)).concat(c.descansos.map(d => d.ini));
    const maximos = dias.flatMap(d => c.dias[d].sesiones.map(s => s.fin)).concat(c.descansos.map(d => d.fin));
    const desde = Math.max(0, Math.floor(Math.min(...minimos) / 60) * 60);
    const hasta = Math.min(L.DIA_COMPLETO, Math.ceil(Math.max(...maximos) / 60) * 60);
    const total = hasta - desde || 1;
    const pos = (ini, fin) => `left:${(Math.max(ini, desde) - desde) / total * 100}%;width:${(Math.min(fin, hasta) - Math.max(ini, desde)) / total * 100}%`;
    const horas = [];
    for (let h = desde; h <= hasta; h += 60) horas.push(h);

    salida.innerHTML = `
      <div class="linea-tiempo-dias">
        <div class="lt-fila lt-escala"><span></span><div class="lt-barra lt-horas">${horas.map(h =>
          `<span style="left:${(h - desde) / total * 100}%">${L.aHora(h).slice(0, 2)}</span>`).join('')}</div><span></span></div>
        ${dias.map(dia => {
          const d = c.dias[dia];
          const rojos = d.cortes.filter(x => x.cuenta);
          return `<div class="lt-fila">
            <span class="mono lt-dia">${esc(DIAS[diaSemana(dia)].slice(0, 3))} ${fmtFecha(dia).slice(0, 5)}</span>
            <div class="lt-barra">
              ${c.descansos.map(x => `<i class="seg seg-descanso" style="${pos(x.ini, x.fin)}" title="Descanso ${L.aHora(x.ini)}–${L.aHora(x.fin)}"></i>`).join('')}
              ${d.sesiones.map(x => `<i class="seg seg-conectado" style="${pos(x.ini, x.fin)}" title="Conectado ${L.aHora(x.ini)}–${L.aHora(x.fin)}"></i>`).join('')}
              ${rojos.map(x => `<i class="seg seg-desconexion" style="${pos(x.ini, x.fin)}" title="Desconectado ${L.aHora(x.ini)}–${L.aHora(x.fin)} (${Math.round(x.fuera)} min fuera del descanso)"></i>`).join('')}
            </div>
            <span class="mono nota lt-total">${rojos.length ? `${rojos.length} · ${Math.round(rojos.reduce((s, x) => s + x.fuera, 0))} min` : ''}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="nota">Tolerancia: los cortes de hasta ${c.tolerancia} min no cuentan como desconexión. Solo días de lunes a viernes.</p>`;
  }

  async function cargarHistorial() {
    const cont = vista.querySelector('#ll-historial');
    let cargas;
    try {
      cargas = await api('listarCargasLlamadas');
    } catch (e) {
      cont.innerHTML = `<p class="nota">${esc(e.message)}</p>`;
      return;
    }
    if (!vista.isConnected) return;
    cont.innerHTML = cargas.length ? `<div class="lista">${cargas.map(c => `
      <details class="sin-respaldo">
        <summary>
          <span class="mono">${fmtFecha(c.desde)} – ${fmtFecha(c.hasta)}</span>
          ${c.equipo ? `<span class="pildora pildora-azul">Equipo ${c.equipo.pct_atendidas} %</span>
            <span class="pildora">${c.equipo.desconexiones} desconexiones</span>` : ''}
          <span class="nota mono">cargado ${fmtFechaHora(c.registrado_en)}</span>
        </summary>
        <pre class="vista-previa" style="margin-top:10px">${esc([c.equipo ? c.equipo.resumen : '', ''].concat(c.agentes.map(a => a.resumen)).join('\n').trim())}</pre>
      </details>`).join('')}</div>` : vacioHtml('Todavía no hay cargas guardadas.');
  }

  return { render, asegurarCargaSemana };
})();
